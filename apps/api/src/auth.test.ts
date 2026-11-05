import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { buildApp } from './app.ts';
import { creditLedger, users } from './schema.ts';
import { freshDatabase } from './test-db.ts';

const PASSWORD = 'test-admin-password';
const WEBHOOK_SECRET = `whsec_${Buffer.from('test-webhook-secret').toString('base64')}`;
const storage = {
  signedUrl: async () => '',
  head: async () => ({ bytes: 0, contentType: '' }),
  signedPutUrl: async () => '',
  read: async () => new Blob(),
};
// Stands in for Clerk: a token "token-<id>" is a session of user <id>.
const verifySession = async (token: string) => {
  if (!token.startsWith('token-')) throw new Error('invalid token');
  return token.slice('token-'.length);
};
const bearer = (userId: string) => ({ Authorization: `Bearer token-${userId}` });

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  database = await freshDatabase('babelback_test_auth');
  app = buildApp({ db: database.db, storage, adminPassword: PASSWORD, verifySession, clerkWebhookSecret: WEBHOOK_SECRET });
});

after(() => database.close());

function signedWebhook(payload: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  const id = `msg_${crypto.randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    method: 'POST',
    body,
    headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
  };
}

const grants = async (userId: string) =>
  database.db.select().from(creditLedger).where(eq(creditLedger.userId, userId));

test('without Clerk keys, sign-in answers 503 and seeds still work', async () => {
  const keyless = buildApp({ db: database.db, storage, adminPassword: PASSWORD });
  assert.equal((await keyless.request('/v1/me', { headers: bearer('user_x') })).status, 503);
  assert.equal((await keyless.request('/v1/webhooks/clerk', signedWebhook({}))).status, 503);
  assert.equal((await keyless.request('/v1/seeds')).status, 200);
});

test('a request without a valid session token is refused', async () => {
  assert.equal((await app.request('/v1/me')).status, 401);
  assert.equal((await app.request('/v1/me', { headers: { Authorization: 'Bearer forged' } })).status, 401);
});

test('the first authenticated request creates the user with the sign-up grant', async () => {
  const response = await app.request('/v1/me', { headers: bearer('user_first') });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.id, 'user_first');
  assert.equal(user.creditBalance, 40);
});

test('the user.created webhook grants once, even when replayed or after a request', async () => {
  const event = { type: 'user.created', data: { id: 'user_hook' } };
  assert.equal((await app.request('/v1/webhooks/clerk', signedWebhook(event))).status, 200);
  assert.equal((await app.request('/v1/webhooks/clerk', signedWebhook(event))).status, 200);
  await app.request('/v1/me', { headers: bearer('user_hook') });
  const rows = await grants('user_hook');
  assert.deepEqual(
    rows.map((r) => r.reason),
    ['signup_grant'],
  );
});

test('a webhook with a bad signature creates nothing', async () => {
  const forged = signedWebhook(
    { type: 'user.created', data: { id: 'user_forged' } },
    `whsec_${Buffer.from('wrong').toString('base64')}`,
  );
  assert.equal((await app.request('/v1/webhooks/clerk', forged)).status, 400);
  assert.equal((await database.db.select().from(users).where(eq(users.id, 'user_forged'))).length, 0);
});

test('appearance saves to the users row and rejects unknown values', async () => {
  const patch = (body: unknown) =>
    app.request('/v1/me/appearance', {
      method: 'PATCH',
      headers: { ...bearer('user_style'), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await patch({ theme: 'retro', accent: '#3CFF5A' })).status, 200);
  assert.equal((await patch({ theme: 'neon', accent: null })).status, 400);
  assert.equal((await patch({ theme: 'day', accent: 'red;x:1' })).status, 400);
  const { user } = await (await app.request('/v1/me', { headers: bearer('user_style') })).json();
  assert.deepEqual([user.theme, user.accent], ['retro', '#3CFF5A']);
});

test('prices and limits come from the settings table', async () => {
  const config = await (await app.request('/v1/config')).json();
  assert.equal(config.analysisCredits, 5);
  assert.equal(config.maxUploadMb, 100);
});

test('an admin finds a user and grants credits', async () => {
  await app.request('/v1/me', { headers: bearer('user_admin_find') });
  const auth = { Authorization: `Basic ${btoa(`admin:${PASSWORD}`)}` };
  const page = await (await app.request('/admin/users?q=admin_find', { headers: auth })).text();
  assert.match(page, /user_admin_find/);

  const grant = await app.request('/admin/users/user_admin_find/credits', {
    method: 'POST',
    headers: { ...auth, Origin: 'http://localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ credits: '15' }),
  });
  assert.equal(grant.status, 303);
  const { user } = await (await app.request('/v1/me', { headers: bearer('user_admin_find') })).json();
  assert.equal(user.creditBalance, 55);
  assert.deepEqual(
    (await grants('user_admin_find')).map((r) => [r.reason, r.delta]),
    [
      ['signup_grant', 40],
      ['admin', 15],
    ],
  );
});
