import { serve } from '@hono/node-server';
import { buildApp } from './app.ts';
import { clerkSession } from './auth.ts';
import { connect } from './db.ts';
import { env } from './env.ts';
import { connectStorage } from './storage.ts';

const { db } = connect(env.DATABASE_URL);
const app = buildApp({
  db,
  storage: connectStorage(env),
  adminPassword: env.ADMIN_PASSWORD,
  verifySession: env.CLERK_SECRET_KEY ? clerkSession(env.CLERK_SECRET_KEY) : undefined,
  clerkWebhookSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on port ${info.port}`);
});
