import { verifyToken } from '@clerk/backend';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { createMiddleware } from 'hono/factory';
import { ensureUser } from './credits.ts';
import type { Db } from './db.ts';
import type { users } from './schema.ts';

// Resolves a Clerk session token to the Clerk user id, or throws. Tests pass a fake.
export type VerifySession = (token: string) => Promise<string>;

export type User = typeof users.$inferSelect;

export function clerkSession(secretKey: string): VerifySession {
  return async (token) => (await verifyToken(token, { secretKey })).sub;
}

// Web sends the session token from server components and native sends the same
// bearer, so both reach the same routes.
export function requireUser(db: Db, verifySession: VerifySession | undefined) {
  return createMiddleware<{ Variables: { user: User } }>(async (c, next) => {
    if (!verifySession) return c.json({ error: 'Sign-in is not configured on this server yet.' }, 503);
    const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    const userId = token ? await verifySession(token).catch(() => undefined) : undefined;
    if (!userId) return c.json({ error: 'Sign in to continue.' }, 401);
    c.set('user', await ensureUser(db, userId));
    await next();
  });
}

// Clerk signs webhooks with Svix. Only user.created matters: it creates the row
// and writes the sign-up grant, which the first authenticated request also does.
export async function handleClerkWebhook(db: Db, request: Request, signingSecret: string) {
  const event = await verifyWebhook(request, { signingSecret }).catch(() => undefined);
  if (!event) return false;
  if (event.type === 'user.created') await ensureUser(db, event.data.id);
  return true;
}
