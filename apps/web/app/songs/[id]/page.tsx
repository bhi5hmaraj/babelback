import { notFound } from 'next/navigation';
import { api } from '../../../api.ts';
import { Player } from './player.tsx';

export const dynamic = 'force-dynamic';

export default async function SongPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string; loop?: string }>;
}) {
  const { id } = await params;
  const response = await api().v1.seeds[':id'].$get({ param: { id } });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Could not load this song');
  const seed = await response.json();
  const query = await searchParams;
  const line = Number(query.line);
  const initialLine = Number.isInteger(line) && line > 0 && line <= seed.song.verses.length ? line - 1 : -1;
  return <Player key={id} seed={seed} initialLine={initialLine} initialLoop={query.loop === '1'} />;
}
