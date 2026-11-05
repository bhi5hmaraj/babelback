import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { z } from 'zod';
import { buildApp } from './app.ts';
import { analyses, audioAssets } from './schema.ts';
import { importSeeds, seedRecord } from './seeds.ts';
import type { Storage } from './storage.ts';
import { freshDatabase } from './test-db.ts';

const storage: Storage = {
  signedUrl: async (key) => `https://bucket.test/${key}?signed`,
  signedPutUrl: async () => { throw new Error('Seed tests do not upload'); },
  head: async () => ({ bytes: 1234, contentType: 'audio/mp4' }),
  read: async () => { throw new Error('Seed tests do not download'); },
};

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof buildApp>;
let records: z.infer<typeof seedRecord>[];

before(async () => {
  database = await freshDatabase('babelback_test_seeds');
  app = buildApp({ db: database.db, storage, adminPassword: 'unused-admin-password' });
  const manifest = await readFile(join(import.meta.dirname, '../seeds/seed-songs.json'), 'utf8');
  records = z.array(seedRecord).parse(JSON.parse(manifest));
  await importSeeds(database.db, storage, records);
});

after(() => database.close());

async function listSeeds() {
  const response = await app.request('/v1/seeds');
  return (await response.json()) as { seeds: { id: string; title: string }[] };
}

test('every seed in the manifest is listed once, even after a second import', async () => {
  await importSeeds(database.db, storage, records);

  const { seeds } = await listSeeds();

  assert.deepEqual(
    seeds.map((s) => s.title).sort(),
    records.map((r) => r.songData.title).sort(),
  );
});

test('a seed comes with its lyrics and a signed link to its own audio', async () => {
  const [first] = (await listSeeds()).seeds;

  const response = await app.request(`/v1/seeds/${first.id}`);
  const seed = await response.json();

  assert.equal(response.status, 200);
  assert.equal(seed.song.title, first.title);
  const record = records.find((r) => r.songData.title === first.title);
  assert.ok(record && seed.audioUrl.includes(record.gcsObject.path.split('/').pop()));
});

test('an analysis of a user upload is not served as a seed', async () => {
  const [upload] = await database.db
    .insert(audioAssets)
    .values({ source: 'upload', title: 'Private', storageKey: 'uploads/x.m4a', contentType: 'audio/mp4', bytes: 1 })
    .returning();
  const [analysis] = await database.db
    .insert(analyses)
    .values({
      assetId: upload.id,
      language: 'English',
      model: 'm',
      karaoke: false,
      promptVersion: 'v1',
      result: records[0].songData,
    })
    .returning();

  const response = await app.request(`/v1/seeds/${analysis.id}`);

  assert.equal(response.status, 404);
  assert.ok(!(await listSeeds()).seeds.some((s) => s.id === analysis.id));
});

test('a malformed seed id is a 404, not a server error', async () => {
  const response = await app.request('/v1/seeds/not-a-uuid');
  assert.equal(response.status, 404);
});
