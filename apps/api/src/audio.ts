import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z } from 'zod';
import { failJob } from './analysis.ts';
import type { AnalysisService } from './analysis.ts';
import { requireUser } from './auth.ts';
import type { User, VerifySession } from './auth.ts';
import { applyCredits, InsufficientCredits } from './credits.ts';
import type { Db } from './db.ts';
import { ANALYSIS_MODELS, ANALYSIS_PROMPT_VERSION } from './gemini.ts';
import { analyses, audioAssets, jobs, libraryEntries } from './schema.ts';
import { getSettings } from './settings.ts';
import type { Storage } from './storage.ts';

export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav',
  'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac'] as const;

const uploadInput = z.object({
  title: z.string().trim().min(1).max(255), contentType: z.enum(AUDIO_TYPES),
  bytes: z.number().int().positive().max(2_147_483_647),
});
const analyzeInput = z.object({
  assetId: z.uuid(), language: z.enum(['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali']),
  karaoke: z.boolean().default(false), model: z.enum(ANALYSIS_MODELS).optional(),
  idempotencyKey: z.string().min(1).max(100).optional(),
});
const libraryInput = z.object({ analysisId: z.uuid() });

const uploadBody = validator('json', (value, c) => {
  const parsed = uploadInput.safeParse(value);
  return parsed.success ? parsed.data : c.json({ error: 'Provide a title, audio content type and byte count.' }, 400);
});
const analysisBody = validator('json', (value, c) => {
  const parsed = analyzeInput.safeParse(value);
  return parsed.success ? parsed.data : c.json({ error: 'Provide an asset id and a supported target language or model.' }, 400);
});
const libraryBody = validator('json', (value, c) => {
  const parsed = libraryInput.safeParse(value);
  return parsed.success ? parsed.data : c.json({ error: 'Provide an analysis id.' }, 400);
});

type AudioDeps = { db: Db; storage: Storage; verifySession?: VerifySession; analysis?: AnalysisService };

export function audioRoutes({ db, storage, verifySession, analysis }: AudioDeps) {
  return new Hono<{ Variables: { user: User } }>()
    .onError((error, c) => {
      if (error instanceof InsufficientCredits) return c.json({ error: 'Not enough credits.' }, 402);
      if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
      console.error('Audio request failed', error);
      return c.json({ error: 'We could not complete this request. Please try again.' }, 500);
    })
    .get('/media/:id', async (c, next) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      if (!id.success) return c.json({ error: 'Audio not found.' }, 404);
      const [asset] = await db.select().from(audioAssets).where(and(eq(audioAssets.id, id.data), eq(audioAssets.source, 'seed')));
      if (asset?.readyAt) return c.json({ audioUrl: await storage.signedUrl(asset.storageKey) }, 200);
      await next();
    })
    .use('*', requireUser(db, verifySession))
    .post('/uploads', uploadBody, async (c) => {
      const body = c.req.valid('json');
      const { maxUploadMb } = await getSettings(db);
      if (body.bytes > maxUploadMb * 1024 * 1024) return c.json({ error: `Audio must be at most ${maxUploadMb} MB.` }, 413);
      const id = randomUUID();
      const storageKey = `uploads/${id}`;
      const uploadUrl = await storage.signedPutUrl(storageKey, body.contentType, body.bytes);
      await db.insert(audioAssets).values({ ...body, id, storageKey, source: 'upload', ownerId: c.var.user.id, readyAt: null });
      return c.json({ id, uploadUrl }, 201);
    })
    .post('/uploads/:id/complete', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const [asset] = id.success ? await db.select().from(audioAssets).where(and(
        eq(audioAssets.id, id.data), eq(audioAssets.ownerId, c.var.user.id), eq(audioAssets.source, 'upload'),
      )) : [];
      if (!asset) return c.json({ error: 'Upload not found.' }, 404);
      let object;
      try {
        object = await storage.head(asset.storageKey);
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
          return c.json({ error: 'The audio has not finished uploading.' }, 409);
        }
        throw error;
      }
      const { maxUploadMb } = await getSettings(db);
      if (object.bytes > maxUploadMb * 1024 * 1024) return c.json({ error: `Audio must be at most ${maxUploadMb} MB.` }, 413);
      if (object.bytes !== asset.bytes || object.contentType !== asset.contentType || !AUDIO_TYPES.some((type) => type === object.contentType)) {
        return c.json({ error: 'The uploaded size or audio type does not match. Upload the file again.' }, 400);
      }
      const [ready] = await db.update(audioAssets).set({ readyAt: asset.readyAt ?? new Date() })
        .where(eq(audioAssets.id, asset.id)).returning();
      return c.json({ asset: { id: ready.id, title: ready.title, bytes: ready.bytes, contentType: ready.contentType, readyAt: ready.readyAt } }, 200);
    })
    .post('/analyses', analysisBody, async (c) => {
      const body = c.req.valid('json');
      if (!analysis) return c.json({ error: 'Song analysis is unavailable. Configure GEMINI_API_KEY, GEMINI_MODEL_ID and Inngest.' }, 503);
      // The server owns model selection; a known alternate model is still refused.
      if (body.model && body.model !== analysis.model) return c.json({ error: 'This model is not enabled on the server.' }, 400);
      const asset = await accessibleAsset(db, c.var.user.id, body.assetId);
      if (!asset) return c.json({ error: 'Audio not found.' }, 404);
      if (!asset.readyAt) return c.json({ error: 'Finish uploading the audio first.' }, 409);
      const idempotencyKey = JSON.stringify([c.var.user.id, body.idempotencyKey ?? randomUUID()]);
      const job = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${c.var.user.id}:${asset.id}:${body.language}`}, 0))`);
        const [previous] = await tx.select().from(jobs).where(eq(jobs.idempotencyKey, idempotencyKey));
        if (previous) {
          if (previous.assetId !== asset.id || previous.input.language !== body.language || previous.input.karaoke !== body.karaoke) {
            throw new HTTPException(409, { message: 'This request key already belongs to a different analysis.' });
          }
          return previous;
        }
        const [active] = await tx.select().from(jobs).where(and(
          eq(jobs.userId, c.var.user.id), eq(jobs.assetId, asset.id), eq(jobs.type, 'analyze'),
          inArray(jobs.status, ['queued', 'running']), sql`${jobs.input}->>'language' = ${body.language}`,
          sql`${jobs.input}->>'karaoke' = ${String(body.karaoke)}`,
        ));
        if (active) return active;
        const [entry] = await tx.select().from(libraryEntries).where(and(
          eq(libraryEntries.userId, c.var.user.id), eq(libraryEntries.assetId, asset.id),
        ));
        const [cached] = await tx.select().from(analyses).where(and(
          eq(analyses.assetId, asset.id), eq(analyses.language, body.language), eq(analyses.karaoke, body.karaoke),
        )).orderBy(desc(analyses.createdAt)).limit(1);
        const free = !!cached && (!!entry || asset.source === 'seed');
        const [created] = await tx.insert(jobs).values({
          userId: c.var.user.id, type: 'analyze', assetId: asset.id, idempotencyKey,
          status: free ? 'succeeded' : 'queued', progress: free ? 100 : 0, analysisId: free ? cached.id : null,
          input: { assetId: asset.id, title: asset.title, language: body.language, karaoke: body.karaoke,
            model: analysis.model, promptVersion: ANALYSIS_PROMPT_VERSION },
        }).returning();
        if (!free) {
          const { analysisCredits } = await getSettings(tx);
          await applyCredits(tx, { userId: c.var.user.id, jobId: created.id, reason: 'spend', delta: -analysisCredits });
        }
        await tx.insert(libraryEntries).values({ userId: c.var.user.id, assetId: asset.id, preferredLanguage: body.language })
          .onConflictDoUpdate({ target: [libraryEntries.userId, libraryEntries.assetId], set: { preferredLanguage: body.language } });
        return created;
      });
      if (job.status === 'queued') {
        try {
          await analysis.send({ jobId: job.id, userId: job.userId });
        } catch (error) {
          console.error('Analysis dispatch failed', { jobId: job.id, userId: job.userId, error });
          await failJob(db, job.id, 'dispatch_failed');
          return c.json({ error: 'Song processing is unavailable. Your credits have been returned.' }, 503);
        }
      }
      return c.json({ job }, 202);
    })
    .get('/jobs/:id', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const [job] = id.success ? await db.select().from(jobs).where(and(eq(jobs.id, id.data), eq(jobs.userId, c.var.user.id))) : [];
      return job ? c.json({ job }, 200) : c.json({ error: 'Job not found.' }, 404);
    })
    .get('/analyses/:id', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const [found] = id.success ? await db.select().from(analyses).where(eq(analyses.id, id.data)) : [];
      const asset = found ? await accessibleAsset(db, c.var.user.id, found.assetId) : undefined;
      if (!found || !asset?.readyAt) return c.json({ error: 'Song not found.' }, 404);
      return c.json({ id: found.id, assetId: asset.id, language: found.language, song: found.result,
        audioUrl: await storage.signedUrl(asset.storageKey) }, 200);
    })
    .get('/media/:id', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const asset = id.success ? await accessibleAsset(db, c.var.user.id, id.data) : undefined;
      if (!asset?.readyAt) return c.json({ error: 'Audio not found.' }, 404);
      return c.json({ audioUrl: await storage.signedUrl(asset.storageKey) }, 200);
    })
    .get('/library', async (c) => {
      const entries = await db.selectDistinctOn([libraryEntries.id], {
        id: libraryEntries.id, assetId: audioAssets.id, title: audioAssets.title,
        analysisId: analyses.id, language: analyses.language, createdAt: libraryEntries.createdAt,
        originalLanguage: sql<string | null>`${analyses.result}->>'originalLanguage'`,
      }).from(libraryEntries).innerJoin(audioAssets, eq(audioAssets.id, libraryEntries.assetId))
        .leftJoin(analyses, and(eq(analyses.assetId, audioAssets.id), eq(analyses.language, libraryEntries.preferredLanguage)))
        .where(eq(libraryEntries.userId, c.var.user.id)).orderBy(libraryEntries.id, desc(analyses.createdAt));
      const pending = await db.select().from(jobs).where(and(eq(jobs.userId, c.var.user.id),
        inArray(jobs.type, ['analyze', 'youtube_ingest']), inArray(jobs.status, ['queued', 'running', 'failed']),
      )).orderBy(desc(jobs.createdAt)).limit(50);
      return c.json({ entries, jobs: pending }, 200);
    })
    .post('/library', libraryBody, async (c) => {
      const [found] = await db.select().from(analyses).where(eq(analyses.id, c.req.valid('json').analysisId));
      const asset = found ? await accessibleAsset(db, c.var.user.id, found.assetId) : undefined;
      if (!asset?.readyAt || !found) return c.json({ error: 'Song not found.' }, 404);
      const [entry] = await db.insert(libraryEntries).values({
        userId: c.var.user.id, assetId: asset.id, preferredLanguage: found.language,
      }).onConflictDoUpdate({ target: [libraryEntries.userId, libraryEntries.assetId],
        set: { preferredLanguage: found.language } }).returning();
      return c.json({ entry }, 200);
    })
    .delete('/library/:id', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const deleted = id.success ? await db.delete(libraryEntries).where(and(
        eq(libraryEntries.id, id.data), eq(libraryEntries.userId, c.var.user.id),
      )).returning() : [];
      return deleted.length ? c.json({ ok: true }, 200) : c.json({ error: 'Library entry not found.' }, 404);
    });
}

export async function accessibleAsset(db: Db, userId: string, assetId: string) {
  const [asset] = await db.select().from(audioAssets).where(eq(audioAssets.id, assetId));
  if (!asset) return;
  if (asset.source === 'seed' || asset.ownerId === userId) return asset;
  const [entry] = await db.select().from(libraryEntries).where(and(
    eq(libraryEntries.userId, userId), eq(libraryEntries.assetId, assetId),
  ));
  return entry ? asset : undefined;
}
