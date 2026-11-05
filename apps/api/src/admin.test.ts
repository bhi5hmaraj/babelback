import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from './app.ts';
import { getSettings } from './settings.ts';
import { freshDatabase } from './test-db.ts';

const PASSWORD = 'test-admin-password';
const AUTH = { Authorization: `Basic ${btoa(`admin:${PASSWORD}`)}` };
const FORM_POST = {
  ...AUTH,
  Origin: 'http://localhost',
  'Content-Type': 'application/x-www-form-urlencoded',
};
const VALID_FORM = {
  practiceScoreCredits: '2',
  analysisCredits: '6',
  youtubeImportCredits: '9',
  trialGrantCredits: '0',
  signupGrantCredits: '50',
  anonymousUsersPerIpPerDay: '4',
  maxSongSeconds: '480',
  maxUploadMb: '80',
};

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  database = await freshDatabase('babelback_test_admin');
  const storage = {
    signedUrl: async () => '',
    signedPutUrl: async () => { throw new Error('Admin tests do not upload'); },
    head: async () => ({ bytes: 0, contentType: '' }),
    read: async () => { throw new Error('Admin tests do not download'); },
  };
  app = buildApp({ db: database.db, storage, adminPassword: PASSWORD });
});

after(() => database.close());

test('admin pages refuse a request without the password', async () => {
  const response = await app.request('/admin');
  assert.equal(response.status, 401);
});

test('saved settings are what the API reads back', async () => {
  const response = await app.request('/admin', {
    method: 'POST',
    headers: FORM_POST,
    body: new URLSearchParams(VALID_FORM),
  });

  assert.equal(response.status, 303);
  assert.partialDeepStrictEqual(await getSettings(database.db), {
    practiceScoreCredits: 2,
    analysisCredits: 6,
    youtubeImportCredits: 9,
    trialGrantCredits: 0,
    signupGrantCredits: 50,
    anonymousUsersPerIpPerDay: 4,
    maxSongSeconds: 480,
    maxUploadMb: 80,
  });
});

test('a negative price is rejected and the stored settings stay', async () => {
  const stored = await getSettings(database.db);

  const response = await app.request('/admin', {
    method: 'POST',
    headers: FORM_POST,
    body: new URLSearchParams({ ...VALID_FORM, analysisCredits: '-1' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await getSettings(database.db), stored);
});

test('a form post from another site is refused', async () => {
  const response = await app.request('/admin', {
    method: 'POST',
    headers: { ...FORM_POST, Origin: 'https://evil.example' },
    body: new URLSearchParams(VALID_FORM),
  });

  assert.equal(response.status, 403);
});
