import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { csrf } from 'hono/csrf';
import { html } from 'hono/html';
import { z } from 'zod';
import type { Db } from './db.ts';
import { getSettings, saveSettings, settingsForm } from './settings.ts';

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

  return admin;
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
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Babelback admin</title>
        <style>
          body { font: 16px/1.5 system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; }
          label { display: grid; grid-template-columns: 1fr 7rem; gap: 0.25rem 1rem; align-items: center; margin: 0.75rem 0; }
          input { font: inherit; padding: 0.25rem 0.5rem; }
          small { grid-column: 1 / -1; color: #b00020; }
          button { font: inherit; padding: 0.5rem 1.25rem; margin-top: 1rem; }
          .saved { color: #1b5e20; }
        </style>
      </head>
      <body>
        <h1>Credits and limits</h1>
        ${saved ? html`<p class="saved">Saved.</p>` : ''}
        <form method="post">
          ${fields}
          <button type="submit">Save</button>
        </form>
      </body>
    </html>`;
}
