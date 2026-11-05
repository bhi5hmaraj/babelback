import { and, asc, eq } from 'drizzle-orm';
import { applyCredits } from './credits.ts';
import type { Db } from './db.ts';
import type { AnalyzeSong } from './gemini.ts';
import { analyses, audioAssets, creditLedger, jobs, libraryEntries } from './schema.ts';
import { getSettings } from './settings.ts';
import { songData } from './song.ts';
import { z } from 'zod';

export const analysisInput = z.object({
  assetId: z.uuid(),
  language: z.enum(['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali']),
  model: z.string(),
  karaoke: z.boolean(),
  promptVersion: z.string(),
  title: z.string(),
});

type Job = typeof jobs.$inferSelect;
export type SendAnalysis = (event: { jobId: string; userId: string }) => Promise<unknown>;
export type AnalysisService = { model: string; analyze: AnalyzeSong; send: SendAnalysis };

// Only this transaction marks success, so replaying a step never creates a second library entry.
export async function runAnalysis(db: Db, analyze: AnalyzeSong, jobId: string, runId?: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  // A YouTube job runs this once its download has saved the asset.
  if (!job || job.type === 'practice_score' || job.status === 'failed' || job.status === 'succeeded') return;
  const input = analysisInput.parse(job.input);
  const [asset] = await db.select().from(audioAssets).where(eq(audioAssets.id, input.assetId));
  if (!asset?.readyAt) throw new Error('Audio is not ready');
  await db.update(jobs).set({ status: 'running', progress: 25, inngestRunId: runId, updatedAt: new Date() }).where(and(
    eq(jobs.id, jobId), eq(jobs.status, 'queued'),
  ));
  const [cached] = await db.select().from(analyses).where(and(
    eq(analyses.assetId, input.assetId), eq(analyses.language, input.language),
    eq(analyses.model, input.model), eq(analyses.karaoke, input.karaoke),
    eq(analyses.promptVersion, input.promptVersion),
  ));
  const result = cached?.result ?? songData.parse(await analyze({ ...input,
    storageKey: asset.storageKey, contentType: asset.contentType,
  }));
  const { maxSongSeconds } = await getSettings(db);
  if (result.verses.some((verse) => verse.startTime < 0 || verse.endTime < verse.startTime || verse.endTime > maxSongSeconds)) {
    throw new Error('Song exceeds the duration limit or contains invalid timings');
  }
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
    if (!current || current.status === 'failed' || current.status === 'succeeded') return;
    await tx.insert(analyses).values({
      assetId: input.assetId, language: input.language, model: input.model,
      karaoke: input.karaoke, promptVersion: input.promptVersion, result,
    }).onConflictDoNothing();
    const [analysis] = await tx.select().from(analyses).where(and(
      eq(analyses.assetId, input.assetId), eq(analyses.language, input.language),
      eq(analyses.model, input.model), eq(analyses.karaoke, input.karaoke),
      eq(analyses.promptVersion, input.promptVersion),
    ));
    await tx.insert(libraryEntries).values({
      userId: job.userId, assetId: input.assetId, preferredLanguage: input.language,
    }).onConflictDoUpdate({ target: [libraryEntries.userId, libraryEntries.assetId],
      set: { preferredLanguage: input.language } });
    await tx.update(jobs).set({ status: 'succeeded', progress: 100, analysisId: analysis.id, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  });
  console.info(JSON.stringify({ event: 'analysis.succeeded', jobId, userId: job.userId }));
}

export async function failJob(db: Db, jobId: string, code = 'analysis_failed',
  message = 'We could not prepare this song. Your credits have been returned. Please try again.') {
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
    if (!job || job.status === 'succeeded') return;
    const [spend] = await tx.select().from(creditLedger).where(and(
      eq(creditLedger.jobId, jobId), eq(creditLedger.reason, 'spend'),
    ));
    if (spend) await applyCredits(tx, { userId: job.userId, jobId, reason: 'refund', delta: -spend.delta });
    await tx.update(jobs).set({
      status: 'failed', errorCode: code,
      errorMessage: message,
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId));
    console.error(JSON.stringify({ event: 'job.failed', jobId, userId: job.userId, code }));
  });
}

// Recovers a process exit after the charge commits but before the event is sent.
export async function redispatchAnalysisJobs(db: Db, send: SendAnalysis, type: Job['type'] = 'analyze') {
  const queued = await db.select({ jobId: jobs.id, userId: jobs.userId }).from(jobs)
    .where(and(eq(jobs.type, type), eq(jobs.status, 'queued'))).orderBy(asc(jobs.updatedAt)).limit(100);
  await Promise.all(queued.map(async (event) => {
    await send(event);
    await db.update(jobs).set({ updatedAt: new Date() }).where(and(eq(jobs.id, event.jobId), eq(jobs.status, 'queued')));
  }));
}

