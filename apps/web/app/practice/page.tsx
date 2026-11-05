import Link from 'next/link';
import { api } from '../../api.ts';
import { authenticatedApi } from '../../auth.ts';
import { Navigation } from '../navigation.tsx';
import styles from '../workflows.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Practise - Babelback' };

export default async function PracticeIndex() {
  const [library, seeds] = await Promise.all([
    (await authenticatedApi()).v1.library.$get().then((response) => response.json()),
    api().v1.seeds.$get().then((response) => response.json()),
  ]);
  const songs = [
    ...('entries' in library ? library.entries.flatMap((entry) => entry.analysisId ? [{ id: entry.analysisId, title: entry.title, note: `Translated to ${entry.language}` }] : []) : []),
    ...seeds.seeds.map((seed) => ({ id: seed.id, title: seed.title, note: `${seed.originalLanguage} to ${seed.language}, free to play` })),
  ];
  return <div className={styles.screen}>
    <main className={styles.main}>
      <h1 className={styles.heading}>Practise</h1>
      <p className={styles.muted}>Pick a song, sing a line, and get a score for pronunciation, timing and clarity.</p>
      <ul className={styles.list}>
        {songs.map((song) => <li key={song.id}>
          <Link href={`/songs/${song.id}/lines/1/practice`} className={styles.song}>
            <span aria-hidden="true" className={styles.tile}>{song.title.slice(0, 2)}</span>
            <span className={styles.songText}><strong>{song.title}</strong><span className={styles.muted}>{song.note}</span></span>
          </Link>
        </li>)}
      </ul>
      {!songs.length && <p className={styles.muted}>Add a song to start practising.</p>}
    </main>
    <Navigation active="practice" />
  </div>;
}
