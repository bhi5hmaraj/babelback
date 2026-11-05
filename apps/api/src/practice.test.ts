import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { buildApp } from './app.ts';
import type { ScoreSinging } from './gemini.ts';
import { failPractice, runPractice, type PracticeService } from './practice.ts';
import { analyses, audioAssets, creditLedger, jobs, practiceAttempts, users } from './schema.ts';
import type { Storage } from './storage.ts';
import { freshDatabase } from './test-db.ts';

const verse = (verseNumber: number) => ({
  verseNumber, original: `Line ${verseNumber}`, translation: 'Hello', transliteration: 'Heh-loh',
  meaning: 'A greeting', startTime: verseNumber * 2, endTime: verseNumber * 2 + 2,
});
const song = { title: 'Seed', originalLanguage: 'Hindi', summary: 's', detailedAnalysis: 'd', verses: [1, 2, 3, 4, 5].map(verse) };
const feedback = { positive: ['Clear vowels'], improvementAreas: ['Come in one beat later'] };
const scores = { pronunciationAccuracyScore: 82, timingAlignmentScore: 71, vocalClarityScore: 80, feedback };
const goodScore = { overallScore: 78, ...scores, verseScores: [{ verseNumber: 2, ...scores }] };

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
  read: async () => new Blob(['voice'], { type: 'audio/webm' }),
};
const scored: Parameters<ScoreSinging>[0][] = [];
const practice: PracticeService = {
  model: 'gemini-2.5-flash',
  score: async (input) => { scored.push(input); return goodScore; },
  send: async ({ jobId }) => { scheduled.add(jobId); },
};

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof buildApp>;
let seedAnalysis: string;
let privateAnalysis: string;

const makeApp = (service?: PracticeService) =>
  buildApp({ db: database.db, storage, adminPassword: 'unused-admin-password', verifySession: async (token) => token, practice: service });

before(async () => {
  database = await freshDatabase('babelback_test_practice');
  app = makeApp(practice);
  const [seed] = await database.db.insert(audioAssets).values({
    source: 'seed', title: 'Seed', storageKey: 'seeds/seed.mp3', contentType: 'audio/mpeg', bytes: 4,
  }).returning();
  const [mine] = await database.db.insert(analyses).values({
    assetId: seed.id, language: 'English', model: 'm', karaoke: false, promptVersion: 'v1', result: song,
  }).returning();
  seedAnalysis = mine.id;
  await database.db.insert(users).values({ id: 'user_owner' });
  const [upload] = await database.db.insert(audioAssets).values({
    source: 'upload', ownerId: 'user_owner', title: 'Private', storageKey: 'uploads/private', contentType: 'audio/mpeg', bytes: 4,
  }).returning();
  const [hidden] = await database.db.insert(analyses).values({
    assetId: upload.id, language: 'English', model: 'm', karaoke: false, promptVersion: 'v1', result: song,
  }).returning();
  privateAnalysis = hidden.id;
});

after(() => database.close());

function call(user: string, path: string, body?: unknown, target = app) {
  return target.request(`/v1/practice-attempts${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const lineTwo = { analysisId: '', firstVerse: 2, lastVerse: 2, contentType: 'audio/webm', bytes: 5 };

// Creates an attempt on line 2 of the seed and puts its recording in the fake bucket.
async function recorded(user: string) {
  const response = await call(user, '', { ...lineTwo, analysisId: seedAnalysis });
  assert.equal(response.status, 201);
  const { attempt } = await response.json();
  objects.set(attempt.recordingKey, { bytes: 5, contentType: 'audio/webm' });
  return attempt.id as string;
}

async function balance(user: string) {
  const [row] = await database.db.select().from(users).where(eq(users.id, user));
  return row.creditBalance;
}

test('practice needs sign-in and answers 503 without Gemini', async () => {
  assert.equal((await app.request('/v1/practice-attempts', { method: 'POST' })).status, 401);
  const keyless = makeApp();
  assert.equal((await call('user_keyless', '', { ...lineTwo, analysisId: seedAnalysis }, keyless)).status, 503);
});

test('an attempt must be on a song the user can read, within the song, and small', async () => {
  assert.equal((await call('user_limits', '', { ...lineTwo, analysisId: privateAnalysis })).status, 404);
  assert.equal((await call('user_limits', '', { ...lineTwo, analysisId: seedAnalysis, lastVerse: 6 })).status, 400);
  assert.equal((await call('user_limits', '', { ...lineTwo, analysisId: seedAnalysis, firstVerse: 1, lastVerse: 5 })).status, 400);
  assert.equal((await call('user_limits', '', { ...lineTwo, analysisId: seedAnalysis, contentType: 'text/html' })).status, 400);
  assert.equal((await call('user_limits', '', { ...lineTwo, analysisId: seedAnalysis, bytes: 11 * 1024 * 1024 })).status, 413);
  assert.equal((await database.db.select().from(practiceAttempts).where(eq(practiceAttempts.userId, 'user_limits'))).length, 0);
});

test('scoring waits for the recording and checks its type', async () => {
  const response = await call('user_upload', '', { ...lineTwo, analysisId: seedAnalysis });
  const { attempt } = await response.json();
  assert.equal((await call('user_upload', `/${attempt.id}/score`, {})).status, 409);
  objects.set(attempt.recordingKey, { bytes: 5, contentType: 'text/html' });
  assert.equal((await call('user_upload', `/${attempt.id}/score`, {})).status, 400);
  assert.equal((await call('user_stranger', `/${attempt.id}/score`, {})).status, 404);
  assert.equal(await balance('user_upload'), 40);
});

test('a double tap charges the practice price once and scores the chosen line', async () => {
  const user = 'user_score';
  const id = await recorded(user);
  const responses = await Promise.all([call(user, `/${id}/score`, {}), call(user, `/${id}/score`, {})]);
  assert.deepEqual(responses.map((r) => r.status), [202, 202]);
  const [{ job }, second] = await Promise.all(responses.map((r) => r.json()));
  assert.equal(job.id, second.job.id);
  assert.equal(await balance(user), 39);
  assert.ok(scheduled.has(job.id));

  await runPractice(database.db, practice.score, job.id);
  await runPractice(database.db, practice.score, job.id);
  assert.deepEqual(scored.at(-1)?.verses.map((v) => v.verseNumber), [2]);
  const { attempt } = await (await call(user, `/${id}`)).json();
  assert.equal(attempt.status, 'succeeded');
  assert.deepEqual(attempt.score, goodScore);
  const { attempts } = await (await call(user, `?analysisId=${seedAnalysis}`)).json();
  assert.deepEqual(attempts.map((a: { id: string }) => a.id), [id]);
  assert.equal((await call('user_stranger', `/${id}`)).status, 404);
});

test('a user without enough credits gets 402 and no job', async () => {
  const user = 'user_broke';
  const id = await recorded(user);
  await database.db.update(users).set({ creditBalance: 0 }).where(eq(users.id, user));
  assert.equal((await call(user, `/${id}/score`, {})).status, 402);
  assert.equal((await database.db.select().from(jobs).where(eq(jobs.userId, user))).length, 0);
  const [attempt] = await database.db.select().from(practiceAttempts).where(eq(practiceAttempts.id, id));
  assert.equal(attempt.jobId, null);
});

test('a failed score refunds once and shows only a user-safe message', async () => {
  const user = 'user_fail';
  const id = await recorded(user);
  const { job } = await (await call(user, `/${id}/score`, {})).json();
  await assert.rejects(runPractice(database.db, async () => { throw new Error('provider-secret-detail'); }, job.id));
  await Promise.all([failPractice(database.db, job.id), failPractice(database.db, job.id)]);
  assert.equal(await balance(user), 40);
  const refunds = await database.db.select().from(creditLedger)
    .where(and(eq(creditLedger.jobId, job.id), eq(creditLedger.reason, 'refund')));
  assert.deepEqual(refunds.map((row) => row.delta), [1]);
  const { attempt } = await (await call(user, `/${id}`)).json();
  assert.equal(attempt.status, 'failed');
  assert.match(attempt.errorMessage, /credit has been returned/);
  assert.doesNotMatch(attempt.errorMessage, /provider-secret-detail/);
});

test('a dispatch error refunds the charge', async () => {
  const user = 'user_dispatch';
  const id = await recorded(user);
  const offline = makeApp({ ...practice, send: async () => { throw new Error('Inngest unavailable'); } });
  assert.equal((await call(user, `/${id}/score`, {}, offline)).status, 503);
  assert.equal(await balance(user), 40);
});
