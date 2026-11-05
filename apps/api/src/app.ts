import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { adminRoutes } from './admin.ts';
import type { Db } from './db.ts';
import { findSeed, listSeeds } from './seeds.ts';
import type { Storage } from './storage.ts';

type AppDeps = { db: Db; storage: Storage; adminPassword: string };

export function buildApp({ db, storage, adminPassword }: AppDeps) {
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
    .route('/admin', adminRoutes(db, adminPassword));
}

export type AppType = ReturnType<typeof buildApp>;
