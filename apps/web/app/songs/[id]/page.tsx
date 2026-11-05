import { notFound } from 'next/navigation';
import { api } from '../../../api.ts';
import { Player } from './player.tsx';

export const dynamic = 'force-dynamic';

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await api().v1.seeds[':id'].$get({ param: { id } });
  if (response.status === 404) notFound();
  const { song, audioUrl } = await response.json();
  return (
    <>
      <h1>{song.title}</h1>
      <p>{song.summary}</p>
      <Player audioUrl={audioUrl} verses={song.verses} />
    </>
  );
}
