import { desc, eq, ilike } from 'drizzle-orm';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { csrf } from 'hono/csrf';
import { html } from 'hono/html';
import { z } from 'zod';
import { applyCredits } from './credits.ts';
import type { Db } from './db.ts';
import { users } from './schema.ts';
import { getSettings, saveSettings, settingsForm } from './settings.ts';

const grantForm = z.object({ credits: z.coerce.number().int().min(1).max(100_000) });

type SettingsPageProps = {
  values: Record<string, unknown>;
  errors: Record<string, string[] | undefined>;
  saved: boolean;
};

// One shared password until accounts exist, then switch to an admin role.
export function adminRoutes(db: Db, password: string) {
  const admin = new Hono();
  admin.use(basicAuth({ username: 'admin', password }), csrf());

  admin.get('/', async (c) =>
    c.html(
      settingsPage({
        values: await getSettings(db),
        errors: {},
        saved: c.req.query('saved') !== undefined,
      }),
    ),
  );

  admin.post('/', async (c) => {
    const body = await c.req.parseBody();
    const parsed = settingsForm.safeParse(body);
    if (!parsed.success) {
      const errors = z.flattenError(parsed.error).fieldErrors;
      return c.html(settingsPage({ values: body, errors, saved: false }), 400);
    }
    await saveSettings(db, parsed.data);
    return c.redirect('/admin?saved', 303);
  });

  // Search by Clerk user id; emails live at Clerk, so copy the id from the Clerk dashboard.
  admin.get('/users', async (c) => {
    const q = c.req.query('q')?.trim() ?? '';
    const found = q
      ? await db
          .select()
          .from(users)
          .where(ilike(users.id, `%${q.replace(/[\\%_]/g, '\\$&')}%`))
          .orderBy(desc(users.createdAt))
          .limit(20)
      : [];
    return c.html(usersPage({ q, found, granted: c.req.query('granted') !== undefined }));
  });

  admin.post('/users/:id/credits', async (c) => {
    const userId = c.req.param('id');
    const parsed = grantForm.safeParse(await c.req.parseBody());
    if (!parsed.success) return c.text('Credits must be a whole number from 1 to 100000.', 400);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) return c.text('User not found', 404);
    await db.transaction((tx) => applyCredits(tx, { userId, delta: parsed.data.credits, reason: 'admin' }));
    return c.redirect(`/admin/users?q=${encodeURIComponent(userId)}&granted`, 303);
  });

  return admin;
}

function usersPage({ q, found, granted }: { q: string; found: (typeof users.$inferSelect)[]; granted: boolean }) {
  const rows = found.map(
    (user) => html`
      <li>
        <code>${user.id}</code> has <strong>${user.creditBalance}</strong> credits
        <form method="post" action="/admin/users/${encodeURIComponent(user.id)}/credits">
          <input name="credits" type="number" min="1" step="1" required aria-label="Credits to grant" />
          <button type="submit">Grant</button>
        </form>
      </li>`,
  );
  return page(
    'Users',
    html`
      ${granted ? html`<p class="saved">Granted.</p>` : ''}
      <form method="get">
        <input name="q" value="${q}" placeholder="Clerk user id" aria-label="Clerk user id" />
        <button type="submit">Find</button>
      </form>
      ${q && !found.length ? html`<p>No user matches.</p>` : html`<ul>${rows}</ul>`}`,
  );
}

function settingsPage({ values, errors, saved }: SettingsPageProps) {
  const fields = Object.entries(settingsForm.shape).map(
    ([name, field]) => html`
      <label>
        <span>${field.description}</span>
        <input name="${name}" type="number" min="0" step="1" required value="${String(values[name] ?? '')}" />
        ${errors[name] ? html`<small>${errors[name].join(' ')}</small>` : ''}
      </label>`,
  );
  return page(
    'Credits and limits',
    html`
      ${saved ? html`<p class="saved">Saved.</p>` : ''}
      <form method="post">
        ${fields}
        <button type="submit">Save</button>
      </form>`,
  );
}

function page(title: string, body: unknown) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} - Babelback admin</title>
        <style>
          body { font: 16px/1.5 system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; }
          label { display: grid; grid-template-columns: 1fr 7rem; gap: 0.25rem 1rem; align-items: center; margin: 0.75rem 0; }
          input { font: inherit; padding: 0.25rem 0.5rem; }
          small { grid-column: 1 / -1; color: #b00020; }
          button { font: inherit; padding: 0.5rem 1.25rem; margin-top: 1rem; }
          .saved { color: #1b5e20; }
          li form { display: inline-flex; gap: 0.5rem; margin-left: 1rem; }
          li input { width: 6rem; }
        </style>
      </head>
      <body>
        <nav><a href="/admin">Credits and limits</a> | <a href="/admin/users">Users</a></nav>
        <h1>${title}</h1>
        ${body}
      </body>
    </html>`;
}
