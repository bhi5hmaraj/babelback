import { notFound } from 'next/navigation';
import { api } from '../../api.ts';
import { authenticatedApi } from '../../auth.ts';

export async function loadSong(id: string) {
  const seed = await api().v1.seeds[':id'].$get({ param: { id } });
  if (seed.ok) return seed.json();
  if (seed.status !== 404) throw new Error('Could not load this song. Please try again.');
  const response = await (await authenticatedApi()).v1.analyses[':id'].$get({ param: { id } });
  if (response.status === 404) notFound();
  const result = await response.json();
  if ('error' in result) throw new Error(result.error);
  return result;
}
