import type { AppType } from '@babelback/api/app';
import { hc } from 'hono/client';

export function api(token?: string | null) {
  const url = process.env.API_URL;
  if (!url) throw new Error('API_URL is not set');
  return hc<AppType>(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
}
