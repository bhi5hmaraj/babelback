import { loadSong } from '../song.ts';
import { Player } from './player.tsx';

export const dynamic = 'force-dynamic';

export default async function SongPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string; loop?: string }>;
}) {
  const { id } = await params;
  const seed = await loadSong(id);
  const query = await searchParams;
  const line = Number(query.line);
  const initialLine = Number.isInteger(line) && line > 0 && line <= seed.song.verses.length ? line - 1 : -1;
  return <Player key={id} seed={seed} initialLine={initialLine} initialLoop={query.loop === '1'} />;
}
