import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { failJob, runAnalysis } from './analysis.ts';
import type { AnalysisService } from './analysis.ts';
import { buildApp } from './app.ts';
import { ensureUser } from './credits.ts';
import { analyses, audioAssets, creditLedger, jobs, libraryEntries, settings, users } from './schema.ts';
import type { Storage } from './storage.ts';
import { freshDatabase } from './test-db.ts';

const song = {
  title: 'Test song', originalLanguage: 'English', summary: 'A greeting', detailedAnalysis: 'A greeting song',
  verses: [{ verseNumber: 1, original: 'Hello', translation: 'Hello', transliteration: 'Heh-loh',
    meaning: 'A greeting', startTime: 0, endTime: 2 }],
};
const objects = new Map<string, { bytes: number; contentType: string }>();
const scheduled = new Set<string>();
const storage: Storage = {
  signedUrl: async (key) => `https://storage.test/${key}`,
  signedPutUrl: async (key) => `https://storage.test/${key}?upload`,
  head: async (key) => {
    const object = objects.get(key);
    if (!object) throw Object.assign(new Error('Not found'), { $metadata: { httpStatusCode: 404 } });
    return object;
  },
  read: async () => new Blob(['test'], { type: 'audio/mpeg' }),
};
const analysis: AnalysisService = {
  model: 'gemini-2.5-flash', analyze: async () => song,
  send: async ({ jobId }) => { scheduled.add(jobId); },
};
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof buildApp>;

function makeApp(service: AnalysisService | undefined = analysis) {
  return buildApp({ db: database.db, storage, adminPassword: 'unused-admin-password',
    verifySession: async (token) => token, analysis: service });
}

before(async () => {
  database = await freshDatabase('babelback_test_audio');
  app = makeApp();
});
after(() => database.close());

function request(user: string, path: string, body?: unknown, target = app, method = 'POST') {
  return target.request(`/v1${path}`, { method, headers: {
    Authorization: `Bearer ${user}`, 'Content-Type': 'application/json',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function upload(user: string, complete = true) {
  const response = await request(user, '/uploads', { title: 'Test song', contentType: 'audio/mpeg', bytes: 4 });
  assert.equal(response.status, 201);
  const result = await response.json();
  if (complete) {
    objects.set(`uploads/${result.id}`, { bytes: 4, contentType: 'audio/mpeg' });
    assert.equal((await request(user, `/uploads/${result.id}/complete`)).status, 200);
  }
  return result.id as string;
}

async function balance(user: string) {
  const [row] = await database.db.select().from(users).where(eq(users.id, user));
  return row.creditBalance;
}

test('uploads need sign-in and keyless features answer 503', async () => {
  const body = { title: 'test', contentType: 'audio/mpeg', bytes: 4 };
  const noKeys = buildApp({ db: database.db, storage, adminPassword: 'unused-admin-password' });
  assert.equal((await request('user_keyless', '/uploads', body, noKeys)).status, 503);
  assert.equal((await app.request('/v1/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 401);
  const id = await upload('user_no_gemini');
  const noGemini = buildApp({ db: database.db, storage, adminPassword: 'unused-admin-password', verifySession: async (token) => token });
  assert.equal((await request('user_no_gemini', '/analyses', { assetId: id, language: 'English' }, noGemini)).status, 503);
  assert.equal((await noKeys.request('/api/inngest')).status, 503);
  assert.equal((await noKeys.request('/v1/seeds')).status, 200);
});

test('uploads reject oversized requests and non-audio types before creating assets', async () => {
  await database.db.update(settings).set({ maxUploadMb: 1 });
  assert.equal((await request('user_limits', '/uploads', { title: 'big', contentType: 'audio/mpeg', bytes: 1_048_577 })).status, 413);
  assert.equal((await request('user_limits', '/uploads', { title: 'image', contentType: 'image/png', bytes: 4 })).status, 400);
  assert.deepEqual(await database.db.select().from(audioAssets).where(eq(audioAssets.ownerId, 'user_limits')), []);
  await database.db.update(settings).set({ maxUploadMb: 100 });
});

test('completion checks ownership and actual object size and type before marking ready', async () => {
  const id = await upload('user_complete', false);
  assert.equal((await request('user_other', `/uploads/${id}/complete`)).status, 404);
  assert.equal((await request('user_complete', `/uploads/${id}/complete`)).status, 409);
  objects.set(`uploads/${id}`, { bytes: 5, contentType: 'audio/mpeg' });
  assert.equal((await request('user_complete', `/uploads/${id}/complete`)).status, 400);
  objects.set(`uploads/${id}`, { bytes: 4, contentType: 'text/html' });
  assert.equal((await request('user_complete', `/uploads/${id}/complete`)).status, 400);
  objects.set(`uploads/${id}`, { bytes: 101 * 1024 * 1024, contentType: 'audio/mpeg' });
  assert.equal((await request('user_complete', `/uploads/${id}/complete`)).status, 413);
  const [pending] = await database.db.select().from(audioAssets).where(eq(audioAssets.id, id));
  assert.equal(pending.readyAt, null);
  objects.set(`uploads/${id}`, { bytes: 4, contentType: 'audio/mpeg' });
  assert.equal((await request('user_complete', `/uploads/${id}/complete`)).status, 200);
  assert.equal((await request('user_complete', `/uploads/${id}/complete`)).status, 200);
});

test('analysis charges the configured price once and finishes into the private library', async () => {
  const user = 'user_flow';
  const assetId = await upload(user);
  await database.db.update(settings).set({ analysisCredits: 7 });
  const body = { assetId, language: 'English', idempotencyKey: 'same-request' };
  const responses = await Promise.all([request(user, '/analyses', body), request(user, '/analyses', body)]);
  assert.deepEqual(responses.map((r) => r.status), [202, 202]);
  const first = await responses[0].json();
  assert.equal(first.job.id, (await responses[1].json()).job.id);
  assert.equal(await balance(user), 33);
  assert.ok(scheduled.has(first.job.id));
  assert.equal((await request(user, '/library', undefined, app, 'GET')).status, 200);

  await runAnalysis(database.db, analysis.analyze, first.job.id);
  await runAnalysis(database.db, analysis.analyze, first.job.id);
  const { job } = await (await request(user, `/jobs/${first.job.id}`, undefined, app, 'GET')).json();
  assert.equal(job.status, 'succeeded');
  const played = await request(user, `/analyses/${job.analysisId}`, undefined, app, 'GET');
  assert.equal(played.status, 200);
  assert.deepEqual((await played.json()).song, song);
  const { entries } = await (await request(user, '/library', undefined, app, 'GET')).json();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].analysisId, job.analysisId);
  const repeat = await request(user, '/analyses', { assetId, language: 'English' });
  assert.equal((await repeat.json()).job.status, 'succeeded');
  assert.equal(await balance(user), 33);
  await database.db.update(settings).set({ analysisCredits: 5 });
});

test('concurrent jobs cannot overdraw credits or leave an uncharged job', async () => {
  const user = 'user_poor';
  const assets = await Promise.all([upload(user), upload(user)]);
  await database.db.update(users).set({ creditBalance: 5 }).where(eq(users.id, user));
  const responses = await Promise.all(assets.map((assetId) => request(user, '/analyses', { assetId, language: 'English' })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [202, 402]);
  assert.equal(await balance(user), 0);
  assert.equal((await database.db.select().from(jobs).where(eq(jobs.userId, user))).length, 1);
  assert.equal((await database.db.select().from(libraryEntries).where(eq(libraryEntries.userId, user))).length, 1);
});

test('failure refunds the original price once and stores only a user-safe error', async () => {
  const user = 'user_failure';
  const assetId = await upload(user);
  const { job } = await (await request(user, '/analyses', { assetId, language: 'English' })).json();
  const broken = async () => { throw new Error('provider-secret-detail'); };
  await assert.rejects(runAnalysis(database.db, broken, job.id));
  await database.db.update(settings).set({ analysisCredits: 9 });
  await Promise.all([failJob(database.db, job.id), failJob(database.db, job.id)]);
  assert.equal(await balance(user), 40);
  const [failed] = await database.db.select().from(jobs).where(eq(jobs.id, job.id));
  assert.equal(failed.status, 'failed');
  assert.ok(!failed.errorMessage?.includes('provider-secret-detail'));
  const refunds = await database.db.select().from(creditLedger).where(and(eq(creditLedger.jobId, job.id), eq(creditLedger.reason, 'refund')));
  assert.deepEqual(refunds.map((row) => row.delta), [5]);
  assert.equal((await database.db.select().from(analyses).where(eq(analyses.assetId, assetId))).length, 0);
  await database.db.update(settings).set({ analysisCredits: 5 });
});

test('dispatch errors refund the charge and make the job discoverable as failed', async () => {
  const user = 'user_dispatch';
  const assetId = await upload(user);
  const offline = makeApp({ ...analysis, send: async () => { throw new Error('Inngest unavailable'); } });
  assert.equal((await request(user, '/analyses', { assetId, language: 'English' }, offline)).status, 503);
  assert.equal(await balance(user), 40);
  const library = await (await request(user, '/library', undefined, app, 'GET')).json();
  assert.equal(library.jobs[0].status, 'failed');
});

test('private assets, jobs and analyses cannot be read or changed by another user', async () => {
  const owner = 'user_private';
  const stranger = 'user_stranger';
  const assetId = await upload(owner);
  const { job } = await (await request(owner, '/analyses', { assetId, language: 'English' })).json();
  await runAnalysis(database.db, analysis.analyze, job.id);
  const [finished] = await database.db.select().from(jobs).where(eq(jobs.id, job.id));
  assert.equal((await request(stranger, `/jobs/${job.id}`, undefined, app, 'GET')).status, 404);
  assert.equal((await request(stranger, `/media/${assetId}`, undefined, app, 'GET')).status, 404);
  assert.equal((await request(stranger, `/analyses/${finished.analysisId}`, undefined, app, 'GET')).status, 404);
  assert.equal((await request(stranger, '/analyses', { assetId, language: 'English' })).status, 404);
  assert.equal((await request(stranger, '/library', { analysisId: finished.analysisId })).status, 404);
  const { entries } = await (await request(owner, '/library', undefined, app, 'GET')).json();
  assert.equal((await request(stranger, `/library/${entries[0].id}`, undefined, app, 'DELETE')).status, 404);
  assert.equal((await request(owner, `/library/${entries[0].id}`, undefined, app, 'DELETE')).status, 200);
  assert.equal((await request(owner, '/library', undefined, app, 'GET')).status, 200);
});

test('seed audio and library additions stay free', async () => {
  const [asset] = await database.db.insert(audioAssets).values({
    source: 'seed', title: song.title, storageKey: `seeds/${randomUUID()}`, bytes: 4, contentType: 'audio/mpeg',
  }).returning();
  const [seed] = await database.db.insert(analyses).values({
    assetId: asset.id, language: 'English', model: 'seed', karaoke: false, promptVersion: 'seed', result: song,
  }).returning();
  assert.equal((await app.request(`/v1/media/${asset.id}`)).status, 200);
  assert.equal((await request('user_seed', '/library', { analysisId: seed.id })).status, 200);
  assert.equal((await request('user_seed', '/library', { analysisId: seed.id })).status, 200);
  assert.equal(await balance('user_seed'), 40);
});

test('unsupported models, unfinished uploads and mismatched request keys are rejected', async () => {
  const user = 'user_bad_requests';
  const assetId = await upload(user, false);
  assert.equal((await request(user, '/analyses', { assetId, language: 'English' })).status, 409);
  assert.equal((await request(user, '/analyses', { assetId, language: 'English', model: 'untrusted' })).status, 400);
  objects.set(`uploads/${assetId}`, { bytes: 4, contentType: 'audio/mpeg' });
  await request(user, `/uploads/${assetId}/complete`);
  await request(user, '/analyses', { assetId, language: 'English', idempotencyKey: 'one' });
  assert.equal((await request(user, '/analyses', { assetId, language: 'Hindi', idempotencyKey: 'one' })).status, 409);
});
