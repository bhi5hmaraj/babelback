import { randomUUID } from 'node:crypto';
import { and, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import { failJob, type SendAnalysis } from './analysis.ts';
import { AUDIO_TYPES, accessibleAsset } from './audio.ts';
import { requireUser, type User, type VerifySession } from './auth.ts';
import { applyCredits, InsufficientCredits } from './credits.ts';
import type { Db } from './db.ts';
import type { ScoreSinging } from './gemini.ts';
import { analyses, jobs, practiceAttempts } from './schema.ts';
import { getSettings } from './settings.ts';
import { singingScore } from './song.ts';
import type { Storage } from './storage.ts';

export type PracticeService = { model: string; score: ScoreSinging; send: SendAnalysis };

// ponytail: fixed caps; a few lines of voice is well under both.
const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
const MAX_LINES = 4;
const FAILED_MESSAGE = 'We could not score this attempt. Your credit has been returned. Please try again.';

const jobInput = z.object({ attemptId: z.uuid(), contentType: z.enum(AUDIO_TYPES), model: z.string() });
const attemptBody = validator('json', (value, c) => {
  const parsed = z.object({
    analysisId: z.uuid(),
    firstVerse: z.number().int().min(1),
    lastVerse: z.number().int().min(1),
    contentType: z.enum(AUDIO_TYPES),
    bytes: z.number().int().positive(),
  }).safeParse(value);
  return parsed.success ? parsed.data : c.json({ error: 'Provide an analysis id, a line range and the recording type and size.' }, 400);
});

// The user sees errorMessage from the job, never the provider's error.
const attemptColumns = { ...getTableColumns(practiceAttempts), errorMessage: jobs.errorMessage };

type PracticeDeps = { db: Db; storage: Storage; verifySession?: VerifySession; practice?: PracticeService };

export function practiceRoutes({ db, storage, verifySession, practice }: PracticeDeps) {
  const findAttempt = async (userId: string, id: string) => {
    const [attempt] = await db.select(attemptColumns).from(practiceAttempts).leftJoin(jobs, eq(jobs.id, practiceAttempts.jobId))
      .where(and(eq(practiceAttempts.id, id), eq(practiceAttempts.userId, userId)));
    return attempt;
  };

  return new Hono<{ Variables: { user: User } }>()
    .onError((error, c) => {
      if (error instanceof InsufficientCredits) return c.json({ error: 'Not enough credits.' }, 402);
      console.error('Practice request failed', error);
      return c.json({ error: 'We could not complete this request. Please try again.' }, 500);
    })
    .use('*', requireUser(db, verifySession))
    .post('/', attemptBody, async (c) => {
      if (!practice) return c.json({ error: 'Practice scoring is unavailable. Configure GEMINI_API_KEY, GEMINI_MODEL_ID and Inngest.' }, 503);
      const body = c.req.valid('json');
      const [analysis] = await db.select().from(analyses).where(eq(analyses.id, body.analysisId));
      const asset = analysis ? await accessibleAsset(db, c.var.user.id, analysis.assetId) : undefined;
      if (!analysis || !asset?.readyAt) return c.json({ error: 'Song not found.' }, 404);
      if (body.lastVerse < body.firstVerse || body.lastVerse > analysis.result.verses.length
        || body.lastVerse - body.firstVerse >= MAX_LINES) {
        return c.json({ error: `Pick up to ${MAX_LINES} lines that are in the song.` }, 400);
      }
      if (body.bytes > MAX_RECORDING_BYTES) return c.json({ error: 'Recordings must be at most 10 MB.' }, 413);
      const id = randomUUID();
      const recordingKey = `recordings/${id}`;
      const uploadUrl = await storage.signedPutUrl(recordingKey, body.contentType, body.bytes);
      const [attempt] = await db.insert(practiceAttempts).values({
        id, userId: c.var.user.id, assetId: asset.id, analysisId: analysis.id,
        firstVerse: body.firstVerse, lastVerse: body.lastVerse, recordingKey,
      }).returning();
      return c.json({ attempt, uploadUrl }, 201);
    })
    .post('/:id/score', async (c) => {
      if (!practice) return c.json({ error: 'Practice scoring is unavailable. Configure GEMINI_API_KEY, GEMINI_MODEL_ID and Inngest.' }, 503);
      const id = z.uuid().safeParse(c.req.param('id'));
      const attempt = id.success ? await findAttempt(c.var.user.id, id.data) : undefined;
      if (!attempt) return c.json({ error: 'Practice attempt not found.' }, 404);
      const object = await storage.head(attempt.recordingKey).catch((error: { $metadata?: { httpStatusCode?: number } }) => {
        if (error.$metadata?.httpStatusCode === 404) return undefined;
        throw error;
      });
      if (!object) return c.json({ error: 'The recording has not finished uploading.' }, 409);
      const contentType = AUDIO_TYPES.find((type) => type === object.contentType);
      if (!contentType || !object.bytes || object.bytes > MAX_RECORDING_BYTES) {
        return c.json({ error: 'The recording is empty, too large or not audio. Record it again.' }, 400);
      }
      const { job, created } = await db.transaction(async (tx) => {
        // Locking the attempt makes a double tap charge once.
        const [current] = await tx.select().from(practiceAttempts).where(eq(practiceAttempts.id, attempt.id)).for('update');
        if (current.jobId) {
          const [existing] = await tx.select().from(jobs).where(eq(jobs.id, current.jobId));
          return { job: existing, created: false };
        }
        const [job] = await tx.insert(jobs).values({
          userId: c.var.user.id, type: 'practice_score', assetId: current.assetId, analysisId: current.analysisId,
          input: { attemptId: current.id, contentType, model: practice.model },
        }).returning();
        const { practiceScoreCredits } = await getSettings(tx);
        await applyCredits(tx, { userId: c.var.user.id, jobId: job.id, reason: 'spend', delta: -practiceScoreCredits });
        await tx.update(practiceAttempts).set({ jobId: job.id }).where(eq(practiceAttempts.id, current.id));
        return { job, created: true };
      });
      if (created) {
        try {
          await practice.send({ jobId: job.id, userId: job.userId });
        } catch (error) {
          console.error('Practice dispatch failed', { jobId: job.id, userId: job.userId, error });
          await failPractice(db, job.id, 'dispatch_failed');
          return c.json({ error: 'Practice scoring is unavailable. Your credit has been returned.' }, 503);
        }
      }
      return c.json({ job }, 202);
    })
    .get('/:id', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const attempt = id.success ? await findAttempt(c.var.user.id, id.data) : undefined;
      return attempt ? c.json({ attempt }, 200) : c.json({ error: 'Practice attempt not found.' }, 404);
    })
    .get('/', validator('query', (value) => ({ analysisId: typeof value.analysisId === 'string' ? value.analysisId : undefined })), async (c) => {
      const analysisId = z.uuid().safeParse(c.req.valid('query').analysisId);
      const attempts = await db.select(attemptColumns).from(practiceAttempts).leftJoin(jobs, eq(jobs.id, practiceAttempts.jobId))
        .where(and(eq(practiceAttempts.userId, c.var.user.id),
          analysisId.success ? eq(practiceAttempts.analysisId, analysisId.data) : undefined))
        .orderBy(desc(practiceAttempts.createdAt)).limit(50);
      return c.json({ attempts }, 200);
    });
}

// Only this transaction marks success, so a replayed step never scores twice.
export async function runPractice(db: Db, score: ScoreSinging, jobId: string, runId?: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || job.type !== 'practice_score' || job.status === 'failed' || job.status === 'succeeded') return;
  const input = jobInput.parse(job.input);
  const [attempt] = await db.select().from(practiceAttempts).where(eq(practiceAttempts.id, input.attemptId));
  const [analysis] = await db.select().from(analyses).where(eq(analyses.id, attempt.analysisId));
  await db.update(jobs).set({ status: 'running', progress: 25, inngestRunId: runId, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'queued')));
  await db.update(practiceAttempts).set({ status: 'running' }).where(eq(practiceAttempts.id, attempt.id));
  const attemptScore = singingScore.parse(await score({
    recordingKey: attempt.recordingKey, contentType: input.contentType, model: input.model, language: analysis.language,
    verses: analysis.result.verses.slice(attempt.firstVerse - 1, attempt.lastVerse),
  }));
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
    if (current.status === 'failed' || current.status === 'succeeded') return;
    await tx.update(practiceAttempts).set({ status: 'succeeded', score: attemptScore }).where(eq(practiceAttempts.id, attempt.id));
    await tx.update(jobs).set({ status: 'succeeded', progress: 100, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  });
  console.info(JSON.stringify({ event: 'practice.succeeded', jobId, userId: job.userId }));
}

// Refunds once (the ledger's unique job + reason) and leaves a user-safe message.
export async function failPractice(db: Db, jobId: string, code = 'practice_failed') {
  await failJob(db, jobId, code, FAILED_MESSAGE);
  await db.update(practiceAttempts).set({ status: 'failed' })
    .where(and(eq(practiceAttempts.jobId, jobId), inArray(practiceAttempts.status, ['queued', 'running'])));
}
