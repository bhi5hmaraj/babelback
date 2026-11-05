import { basename } from 'node:path';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db.ts';
import { analyses, audioAssets } from './schema.ts';
import { songData } from './song.ts';
import type { Storage } from './storage.ts';

const isSeed = eq(audioAssets.source, 'seed');

export function listSeeds(db: Db) {
  return db
    .select({
      id: analyses.id,
      title: audioAssets.title,
      originalLanguage: sql<string>`${analyses.result}->>'originalLanguage'`,
      language: analyses.language,
    })
    .from(analyses)
    .innerJoin(audioAssets, eq(analyses.assetId, audioAssets.id))
    .where(isSeed)
    .orderBy(asc(audioAssets.title));
}

export async function findSeed(db: Db, analysisId: string) {
  const [seed] = await db
    .select({
      id: analyses.id,
      language: analyses.language,
      song: analyses.result,
      storageKey: audioAssets.storageKey,
    })
    .from(analyses)
    .innerJoin(audioAssets, eq(analyses.assetId, audioAssets.id))
    .where(and(eq(analyses.id, analysisId), isSeed));
  return seed;
}

export const seedRecord = z.object({
  gcsObject: z.object({ path: z.string() }),
  targetLanguage: z.string(),
  modelId: z.string(),
  karaokeMode: z.boolean(),
  songData,
});

// The audio must already be in the bucket under seeds/<file name>. Safe to re-run.
export async function importSeeds(db: Db, storage: Storage, records: z.infer<typeof seedRecord>[]) {
  for (const record of records) {
    const storageKey = `seeds/${basename(record.gcsObject.path)}`;
    const { bytes, contentType } = await storage.head(storageKey);
    const title = record.songData.title;
    const [asset] = await db
      .insert(audioAssets)
      .values({ source: 'seed', title, storageKey, contentType, bytes })
      .onConflictDoUpdate({ target: audioAssets.storageKey, set: { title, contentType, bytes } })
      .returning({ id: audioAssets.id });
    await db
      .insert(analyses)
      .values({
        assetId: asset.id,
        language: record.targetLanguage,
        model: record.modelId,
        karaoke: record.karaokeMode,
        promptVersion: 'legacy',
        result: record.songData,
      })
      .onConflictDoNothing();
  }
}
