import { notFound, redirect } from 'next/navigation';
import { api } from '../../../../../../api.ts';
import { account, authenticatedApi } from '../../../../../../auth.ts';
import { loadSong } from '../../../../song.ts';
import { Practice } from './practice.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Practise - Babelback' };

export default async function PracticePage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const number = Number(n);
  if (!/^\d+$/.test(n) || !Number.isSafeInteger(number) || number < 1) notFound();
  const user = await account();
  if (!user) redirect('/sign-in');
  const { song, audioUrl } = await loadSong(id);
  const verse = song.verses[number - 1];
  if (!verse) notFound();
  const [config, history] = await Promise.all([
    api().v1.config.$get().then((response) => response.json()),
    (await authenticatedApi()).v1['practice-attempts'].$get({ query: { analysisId: id } }).then((response) => response.json()),
  ]);
  const scores = 'attempts' in history
    ? history.attempts.flatMap((attempt) => attempt.firstVerse === number && attempt.score ? [attempt.score.overallScore] : [])
    : [];
  const originalLanguage = song.originalLanguage.toLowerCase();
  const lang = originalLanguage.includes('hindi') ? 'hi' : originalLanguage.includes('tamil') ? 'ta' : undefined;

  return <Practice key={`${id}-${number}`} analysisId={id} title={song.title} line={number} lines={song.verses.length}
    verse={verse} lang={lang} audioUrl={audioUrl} credits={user.creditBalance}
    price={config.practiceScoreCredits} best={scores.length ? Math.max(...scores) : null} />;
}
