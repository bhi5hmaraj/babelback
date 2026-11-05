import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { failJob, runAnalysis, type AnalysisService } from './analysis.ts';
import { buildApp } from './app.ts';
import { audioAssets, creditLedger, jobs, libraryEntries, users } from './schema.ts';
import type { Storage } from './storage.ts';
import { freshDatabase } from './test-db.ts';
import {
  failureMessage, finishDownload, startDownload, youtubeId, type DownloadStatus, type YoutubeDownloader, type YoutubeService,
} from './youtube.ts';

const song = {
  title: 'Kun Faya Kun', originalLanguage: 'Hindi', summary: 's', detailedAnalysis: 'd',
  verses: [{ verseNumber: 1, original: 'Kun', translation: 'Be', transliteration: 'Koon', meaning: 'Be', startTime: 0, endTime: 2 }],
};
const objects = new Map<string, { bytes: number; contentType: string }>();
const storage: Storage = {
  signedUrl: async (key) => `https://storage.test/${key}`,
  signedPutUrl: async (key) => `https://storage.test/${key}?upload`,
  head: async (key) => {
    const object = objects.get(key);
    if (!object) throw Object.assign(new Error('Not found'), { $metadata: { httpStatusCode: 404 } });
    return object;
  },
  read: async () => new Blob(['audio']),
};

// Stands in for Apify: a run "finishes" by writing its object into the fake bucket.
const runs = new Map<string, { videoId: string; status: DownloadStatus }>();
const started: { videoId: string; maxSeconds: number }[] = [];
const downloader: YoutubeDownloader = {
  start: async ({ videoId, maxSeconds }) => {
    started.push({ videoId, maxSeconds });
    const runId = `run_${runs.size}`;
    runs.set(runId, { videoId, status: 'running' });
    return runId;
  },
  status: async (runId) => runs.get(runId)!.status,
  details: async () => ({ title: 'Kun Faya Kun', artist: 'A. R. Rahman' }),
};
function finish(runId: string, status: DownloadStatus = 'succeeded') {
  const run = runs.get(runId)!;
  run.status = status;
  if (status === 'succeeded') objects.set(`youtube/${run.videoId}.m4a`, { bytes: 4, contentType: 'audio/mp4' });
}

const sent = new Set<string>();
const analysis: AnalysisService = { model: 'gemini-2.5-flash', analyze: async () => song, send: async () => {} };
const youtube: YoutubeService = { downloader, send: async ({ jobId }) => { sent.add(jobId); } };

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof buildApp>;
const makeApp = (service?: YoutubeService) => buildApp({ db: database.db, storage, adminPassword: 'unused-admin-password',
  verifySession: async (token) => token, analysis, youtube: service });

before(async () => {
  database = await freshDatabase('babelback_test_youtube');
  app = makeApp(youtube);
});

after(() => database.close());

function add(user: string, body: Record<string, unknown>, target = app) {
  return target.request('/v1/jobs/youtube', {
    method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function balance(user: string) {
  const [row] = await database.db.select().from(users).where(eq(users.id, user));
  return row.creditBalance;
}

// Runs the ingest function's steps the way Inngest would.
async function ingest(jobId: string) {
  const download = await startDownload(database.db, storage, downloader, jobId);
  if ('runId' in download) {
    assert.equal(await finishDownload(database.db, storage, downloader, jobId, download.runId), false);
    finish(download.runId);
    assert.equal(await finishDownload(database.db, storage, downloader, jobId, download.runId), true);
  }
  await runAnalysis(database.db, analysis.analyze, jobId);
}

test('links in every YouTube shape give the video id, and anything else gives none', () => {
  for (const link of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ?si=x',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ']) {
    assert.equal(youtubeId(link), 'dQw4w9WgXcQ', link);
  }
  for (const link of ['https://vimeo.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=short', 'not a link']) {
    assert.equal(youtubeId(link), undefined, link);
  }
});

test('YouTube import needs sign-in', async () => {
  assert.equal((await app.request('/v1/jobs/youtube', { method: 'POST' })).status, 401);
});

test('a link that is not a YouTube video is refused', async () => {
  assert.equal((await add('user_input', { url: 'https://vimeo.com/1', language: 'English' })).status, 400);
});

test('without Apify keys YouTube import answers 503 and the config says it is off', async () => {
  assert.equal((await add('user_input', { url: 'https://youtu.be/aaaaaaaaaaa', language: 'English' }, makeApp())).status, 503);
  const config = await (await makeApp().request('/v1/config')).json();
  assert.equal(config.youtubeImport, false);
});

test('a new video is charged once, downloaded once with the server caps, and lands in the library', async () => {
  const user = 'user_first';
  const body = { url: 'https://youtu.be/bbbbbbbbbbb', language: 'English', idempotencyKey: 'click' };
  const responses = await Promise.all([add(user, body), add(user, body)]);
  assert.deepEqual(responses.map((r) => r.status), [202, 202]);
  const [{ job }, second] = await Promise.all(responses.map((r) => r.json()));
  assert.equal(job.id, second.job.id);
  assert.ok(sent.has(job.id));
  assert.equal(await balance(user), 32);

  await ingest(job.id);
  assert.deepEqual(started.filter((run) => run.videoId === 'bbbbbbbbbbb'), [{ videoId: 'bbbbbbbbbbb', maxSeconds: 600 }]);
  const [done] = await database.db.select().from(jobs).where(eq(jobs.id, job.id));
  assert.equal(done.status, 'succeeded');
  const [asset] = await database.db.select().from(audioAssets).where(eq(audioAssets.youtubeId, 'bbbbbbbbbbb'));
  assert.deepEqual([asset.source, asset.ownerId, asset.title, asset.artist], ['youtube', null, 'Kun Faya Kun', 'A. R. Rahman']);
  const [entry] = await database.db.select().from(libraryEntries).where(eq(libraryEntries.userId, user));
  assert.equal(entry.assetId, asset.id);
  assert.equal((await app.request(`/v1/analyses/${done.analysisId}`, { headers: { Authorization: `Bearer ${user}` } })).status, 200);
});

test('a video someone else added is shared without a second download, and is free once in your library', async () => {
  const body = { url: 'https://www.youtube.com/watch?v=ccccccccccc', language: 'English' };
  const first = await (await add('user_a', body)).json();
  await ingest(first.job.id);
  const runsBefore = started.length;

  const second = await (await add('user_b', body)).json();
  await ingest(second.job.id);
  assert.equal(started.length, runsBefore);
  assert.equal(await balance('user_b'), 32);

  const again = await (await add('user_b', body)).json();
  assert.equal(again.job.status, 'succeeded');
  assert.equal(await balance('user_b'), 32);
});

test('a user without enough credits gets 402 and no job', async () => {
  await add('user_poor', { url: 'https://youtu.be/ddddddddddd', language: 'English' });
  await database.db.update(users).set({ creditBalance: 7 }).where(eq(users.id, 'user_poor'));
  assert.equal((await add('user_poor', { url: 'https://youtu.be/eeeeeeeeeee', language: 'English' })).status, 402);
  assert.equal((await database.db.select().from(jobs).where(eq(jobs.youtubeId, 'eeeeeeeeeee'))).length, 0);
});

test('a video over the length cap fails once with a refund and a user-safe message', async () => {
  const user = 'user_long';
  const { job } = await (await add(user, { url: 'https://youtu.be/fffffffffff', language: 'English' })).json();
  const download = await startDownload(database.db, storage, downloader, job.id);
  assert.ok('runId' in download);
  finish(download.runId, 'too_long');
  await assert.rejects(finishDownload(database.db, storage, downloader, job.id, download.runId),
    (error) => error instanceof NonRetriableError && error.message === 'too_long');
  await Promise.all([failJob(database.db, job.id, 'too_long', failureMessage('too_long')),
    failJob(database.db, job.id, 'too_long', failureMessage('too_long'))]);
  assert.equal(await balance(user), 40);
  const refunds = await database.db.select().from(creditLedger)
    .where(and(eq(creditLedger.jobId, job.id), eq(creditLedger.reason, 'refund')));
  assert.deepEqual(refunds.map((row) => row.delta), [8]);
  const [failed] = await database.db.select().from(jobs).where(eq(jobs.id, job.id));
  assert.equal(failed.errorMessage, failureMessage('too_long'));
  assert.equal((await database.db.select().from(audioAssets).where(eq(audioAssets.youtubeId, 'fffffffffff'))).length, 0);
});

test('a dispatch error refunds the charge', async () => {
  const offline = makeApp({ ...youtube, send: async () => { throw new Error('Inngest unavailable'); } });
  assert.equal((await add('user_offline', { url: 'https://youtu.be/ggggggggggg', language: 'English' }, offline)).status, 503);
  assert.equal(await balance('user_offline'), 40);
});
