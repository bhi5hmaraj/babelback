import { serve } from '@hono/node-server';
import { buildApp } from './app.ts';
import { clerkSession } from './auth.ts';
import { connect } from './db.ts';
import { env } from './env.ts';
import { allowBrowserUploads, connectStorage } from './storage.ts';
import { connectWorkflows } from './workflows.ts';

const { db } = connect(env.DATABASE_URL);
// ponytail: Railway's own web domain only; add a custom domain here when the web gets one.
const webHost = process.env.RAILWAY_SERVICE_WEB_URL;
if (webHost) {
  await allowBrowserUploads(env, `https://${webHost}`).catch((error: unknown) => {
    console.error('Could not set the bucket CORS rule; browser uploads will fail', error);
  });
}
const storage = connectStorage(env);
const app = buildApp({
  db,
  storage,
  adminPassword: env.ADMIN_PASSWORD,
  verifySession: env.CLERK_SECRET_KEY ? clerkSession(env.CLERK_SECRET_KEY) : undefined,
  clerkWebhookSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
  ...connectWorkflows(db, storage, env, process.env.NODE_ENV === 'production'),
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on port ${info.port}`);
});
