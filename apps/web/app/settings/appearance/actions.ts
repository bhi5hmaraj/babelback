'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { api } from '../../../api.ts';
import { sessionToken } from '../../../auth.ts';
import { ACCENTS, THEMES, type Appearance } from '../../theme.ts';

export async function saveAppearance({ theme, accent }: Appearance) {
  if (!Object.hasOwn(THEMES, theme) || (accent !== undefined && !ACCENTS.some((item) => item.hex === accent))) {
    return { error: 'Choose a listed theme and colour.' };
  }
  const token = await sessionToken();
  if (token) {
    const response = await api(token).v1.me.appearance.$patch({ json: { theme, accent: accent ?? null } });
    if (!response.ok) return { error: 'Your appearance could not be saved. Please try again.' };
  } else {
    const jar = await cookies();
    const options = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const };
    jar.set('theme', theme, options);
    if (accent) jar.set('accent', accent, options);
    else jar.delete('accent');
  }
  revalidatePath('/', 'layout');
  return { error: null };
}
