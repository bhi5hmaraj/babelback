import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { analysisInput, failJob, type AnalysisService, type SendAnalysis } from './analysis.ts';
import { AUDIO_TYPES } from './audio.ts';
import { requireUser, type User, type VerifySession } from './auth.ts';
import { applyCredits, InsufficientCredits } from './credits.ts';
import type { Db } from './db.ts';
import { ANALYSIS_PROMPT_VERSION } from './gemini.ts';
import { analyses, audioAssets, jobs, libraryEntries } from './schema.ts';
import { getSettings } from './settings.ts';
import type { Storage } from './storage.ts';

export type DownloadStatus = 'running' | 'succeeded' | 'too_long' | 'too_large' | 'failed';

// The Apify actor (actors/yt-audio-basic) behind the one boundary tests replace.
export type YoutubeDownloader = {
  start(input: { videoId: string; uploadUrl: string; jobId: string; maxSeconds: number; maxBytes: number }): Promise<string>;
  status(runId: string): Promise<DownloadStatus>;
  details(videoId: string): Promise<{ title: string; artist?: string } | undefined>;
};

export type YoutubeService = { downloader: YoutubeDownloader; send: SendAnalysis };

// The actor writes m4a, which it labels audio/mp4.
const DOWNLOAD_TYPE = 'audio/mp4';

const MESSAGES: Record<string, string> = {
  too_long: 'This video is longer than we can take. Your credits have been returned.',
  too_large: 'This video is too large to add. Your credits have been returned.',
  youtube_failed: 'We could not get the audio from this video. Your credits have been returned. Please try again.',
};

export function failureMessage(code: string) {
  return MESSAGES[code] ?? MESSAGES.youtube_failed;
}

// Accepts watch, short, embed, music and youtu.be links; the id is always 11 characters.
export function youtubeId(link: string) {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return undefined;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const id = host === 'youtu.be'
    ? url.pathname.slice(1)
    : host === 'youtube.com'
      ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
      : undefined;
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

const youtubeBody = validator('json', (value, c) => {
  const parsed = z.object({
    url: z.string().max(2000),
    language: analysisInput.shape.language,
    idempotencyKey: z.string().min(1).max(100).optional(),
  }).safeParse(value);
  const videoId = parsed.success ? youtubeId(parsed.data.url) : undefined;
  return parsed.success && videoId
    ? { ...parsed.data, videoId }
    : c.json({ error: 'Paste a YouTube video link and pick a language.' }, 400);
});

type YoutubeDeps = { db: Db; verifySession?: VerifySession; analysis?: AnalysisService; youtube?: YoutubeService };

export function youtubeRoutes({ db, verifySession, analysis, youtube }: YoutubeDeps) {
  return new Hono<{ Variables: { user: User } }>()
    .onError((error, c) => {
      if (error instanceof InsufficientCredits) return c.json({ error: 'Not enough credits.' }, 402);
      if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
      console.error('YouTube request failed', error);
      return c.json({ error: 'We could not complete this request. Please try again.' }, 500);
    })
    .use('*', requireUser(db, verifySession))
    .post('/', youtubeBody, async (c) => {
      if (!analysis || !youtube) {
        return c.json({ error: 'YouTube import is unavailable. Configure APIFY_TOKEN, APIFY_ACTOR_ID, Gemini and Inngest.' }, 503);
      }
      const { videoId, language, idempotencyKey: key } = c.req.valid('json');
      const userId = c.var.user.id;
      const idempotencyKey = JSON.stringify([userId, key ?? randomUUID()]);
      const job = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:youtube:${videoId}`}, 0))`);
        const [previous] = await tx.select().from(jobs).where(eq(jobs.idempotencyKey, idempotencyKey));
        if (previous) {
          if (previous.youtubeId !== videoId || previous.input.language !== language) {
            throw new HTTPException(409, { message: 'This request key already belongs to a different song.' });
          }
          return previous;
        }
        // The partial unique index allows one active import per user and video.
        const [active] = await tx.select().from(jobs).where(and(
          eq(jobs.userId, userId), eq(jobs.youtubeId, videoId), inArray(jobs.status, ['queued', 'running']),
        ));
        if (active) return active;
        const [asset] = await tx.select().from(audioAssets).where(eq(audioAssets.youtubeId, videoId));
        const [cached] = asset ? await tx.select({ id: analyses.id }).from(analyses)
          .innerJoin(libraryEntries, and(eq(libraryEntries.assetId, analyses.assetId), eq(libraryEntries.userId, userId)))
          .where(and(eq(analyses.assetId, asset.id), eq(analyses.language, language), eq(analyses.karaoke, false))) : [];
        // A song already in the library in this language costs nothing.
        const [created] = await tx.insert(jobs).values({
          userId, type: 'youtube_ingest', youtubeId: videoId, idempotencyKey,
          assetId: asset?.readyAt ? asset.id : null,
          status: cached ? 'succeeded' : 'queued', progress: cached ? 100 : 0, analysisId: cached?.id,
          input: { videoId, title: asset?.title ?? 'YouTube song', language, karaoke: false,
            model: analysis.model, promptVersion: ANALYSIS_PROMPT_VERSION },
        }).returning();
        if (cached) {
          await tx.update(libraryEntries).set({ preferredLanguage: language })
            .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.assetId, asset.id)));
        } else {
          const { youtubeImportCredits } = await getSettings(tx);
          await applyCredits(tx, { userId, jobId: created.id, reason: 'spend', delta: -youtubeImportCredits });
        }
        return created;
      });
      if (job.status === 'queued') {
        try {
          await youtube.send({ jobId: job.id, userId });
        } catch (error) {
          console.error('YouTube dispatch failed', { jobId: job.id, userId, error });
          await failJob(db, job.id, 'dispatch_failed', failureMessage('dispatch_failed'));
          return c.json({ error: 'YouTube import is unavailable. Your credits have been returned.' }, 503);
        }
      }
      return c.json({ job }, 202);
    });
}

const storageKey = (videoId: string) => `youtube/${videoId}.m4a`;

// Starts the actor unless the video was downloaded before; each video is stored once and shared.
export async function startDownload(
  db: Db, storage: Storage, downloader: YoutubeDownloader, jobId: string,
): Promise<{ assetId: string } | { runId: string }> {
  const job = await loadJob(db, jobId);
  const [asset] = await db.select().from(audioAssets).where(eq(audioAssets.youtubeId, job.youtubeId));
  if (asset?.readyAt) return { assetId: await attachAsset(db, jobId, asset) };
  await db.update(jobs).set({ status: 'running', progress: 10, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'queued')));
  const { maxSongSeconds, maxUploadMb } = await getSettings(db);
  const runId = await downloader.start({
    videoId: job.youtubeId, jobId, maxSeconds: maxSongSeconds, maxBytes: maxUploadMb * 1024 * 1024,
    uploadUrl: await storage.signedPutUrl(storageKey(job.youtubeId), DOWNLOAD_TYPE),
  });
  return { runId };
}

// Resolves false while the actor runs. A refused or failed download is final, so it is never retried.
export async function finishDownload(db: Db, storage: Storage, downloader: YoutubeDownloader, jobId: string, runId: string) {
  const status = await downloader.status(runId);
  if (status === 'running') return false;
  if (status !== 'succeeded') throw new NonRetriableError(status === 'failed' ? 'youtube_failed' : status);
  const job = await loadJob(db, jobId);
  const key = storageKey(job.youtubeId);
  const object = await storage.head(key);
  const { maxUploadMb } = await getSettings(db);
  if (object.bytes > maxUploadMb * 1024 * 1024) throw new NonRetriableError('too_large');
  if (!object.bytes || !AUDIO_TYPES.some((type) => type === object.contentType)) throw new NonRetriableError('youtube_failed');
  const details = await downloader.details(job.youtubeId).catch(() => undefined);
  await db.insert(audioAssets).values({
    source: 'youtube', youtubeId: job.youtubeId, storageKey: key, contentType: object.contentType, bytes: object.bytes,
    title: details?.title ?? `YouTube ${job.youtubeId}`, artist: details?.artist,
  }).onConflictDoNothing();
  const [asset] = await db.select().from(audioAssets).where(eq(audioAssets.youtubeId, job.youtubeId));
  await attachAsset(db, jobId, asset);
  return true;
}

async function loadJob(db: Db, jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (job?.type !== 'youtube_ingest' || !job.youtubeId) throw new NonRetriableError('youtube_failed');
  return { ...job, youtubeId: job.youtubeId };
}

// Gives the job what runAnalysis reads, so the same job goes on to analyse the audio.
async function attachAsset(db: Db, jobId: string, asset: typeof audioAssets.$inferSelect) {
  await db.update(jobs).set({
    assetId: asset.id, progress: 40, updatedAt: new Date(),
    input: sql`${jobs.input} || ${JSON.stringify({ assetId: asset.id, title: asset.title })}::jsonb`,
  }).where(eq(jobs.id, jobId));
  return asset.id;
}

export function connectApify(token: string, actorId: string): YoutubeDownloader {
  const apify = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://api.apify.com/v2${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`Apify ${path.split('?')[0]} answered ${response.status}`);
    return (await response.json()).data;
  };
  return {
    start: async ({ videoId, uploadUrl, jobId, maxSeconds, maxBytes }) => {
      // Residential proxies; YouTube blocks datacenter IP ranges.
      const run = await apify(`/acts/${actorId.replace('/', '~')}/runs?timeout=900`, {
        method: 'POST',
        body: JSON.stringify({
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`, audioFormat: 'm4a', uploadUrl, jobId,
          maxDurationSeconds: maxSeconds, maxFileSizeBytes: maxBytes,
          proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
        }),
      });
      return run.id;
    },
    status: async (runId) => {
      const run = await apify(`/actor-runs/${runId}`);
      if (run.status === 'SUCCEEDED') return 'succeeded';
      if (['READY', 'RUNNING'].includes(run.status)) return 'running';
      // The actor records why it skipped a video in its dataset before failing.
      const response = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const items: { reason?: string }[] = response.ok ? await response.json() : [];
      if (items.some((item) => item.reason === 'duration_exceeded')) return 'too_long';
      if (items.some((item) => item.reason === 'filesize_exceeded')) return 'too_large';
      return 'failed';
    },
    details: async (videoId) => {
      const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const video = await response.json() as { title?: string; author_name?: string };
      return video.title ? { title: video.title, artist: video.author_name } : undefined;
    },
  };
}
