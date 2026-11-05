import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { adminRoutes } from './admin.ts';
import { handleClerkWebhook, requireUser, type VerifySession } from './auth.ts';
import type { Db } from './db.ts';
import { findSeed, listSeeds } from './seeds.ts';
import { getSettings } from './settings.ts';
import { users } from './schema.ts';
import type { Storage } from './storage.ts';

const appearance = z.object({
  theme: z.enum(['night', 'day', 'retro']),
  accent: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
});

type AppDeps = {
  db: Db;
  storage: Storage;
  adminPassword: string;
  // Without these keys sign-in answers 503 and seeds still work.
  verifySession?: VerifySession;
  clerkWebhookSecret?: string;
};

export function buildApp({ db, storage, adminPassword, verifySession, clerkWebhookSecret }: AppDeps) {
  const auth = requireUser(db, verifySession);
  return new Hono()
    .get('/v1/health', async (c) => {
      await db.execute(sql`select 1`);
      return c.json({ ok: true });
    })
    .get('/v1/seeds', async (c) => c.json({ seeds: await listSeeds(db) }))
    .get('/v1/seeds/:id', async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      const seed = id.success ? await findSeed(db, id.data) : undefined;
      if (!seed) return c.json({ error: 'Seed not found' }, 404);
      const { storageKey, ...rest } = seed;
      return c.json({ ...rest, audioUrl: await storage.signedUrl(storageKey) }, 200);
    })
    // Prices and limits are public so the client can show a price before the user confirms.
    .get('/v1/config', async (c) => c.json(await getSettings(db)))
    .get('/v1/me', auth, (c) => c.json({ user: c.var.user }))
    .patch('/v1/me/appearance', auth, async (c) => {
      const body = appearance.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: 'Pick a known theme and a #RRGGBB accent.' }, 400);
      const [user] = await db.update(users).set(body.data).where(eq(users.id, c.var.user.id)).returning();
      return c.json({ user }, 200);
    })
    .post('/v1/webhooks/clerk', async (c) => {
      if (!clerkWebhookSecret) return c.json({ error: 'Clerk webhooks are not configured on this server yet.' }, 503);
      const verified = await handleClerkWebhook(db, c.req.raw, clerkWebhookSecret);
      return verified ? c.json({ ok: true }, 200) : c.json({ error: 'Invalid webhook signature' }, 400);
    })
    .route('/admin', adminRoutes(db, adminPassword));
}

export type AppType = ReturnType<typeof buildApp>;
