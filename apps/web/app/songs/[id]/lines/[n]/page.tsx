import { notFound } from 'next/navigation';
import { loadSong } from '../../../song.ts';
import styles from './line.module.css';

export const dynamic = 'force-dynamic';

export default async function LinePage({ params }: {
  params: Promise<{ id: string; n: string }>;
}) {
  const { id, n } = await params;
  const number = Number(n);
  if (!/^\d+$/.test(n) || !Number.isSafeInteger(number) || number < 1) notFound();
  const { song, language } = await loadSong(id);
  const verse = song.verses[number - 1];
  if (!verse) notFound();
  const originalLanguage = song.originalLanguage.toLowerCase();
  const lang = originalLanguage.includes('hindi') ? 'hi' : originalLanguage.includes('tamil') ? 'ta' : undefined;
  const seconds = Math.max(0, Math.floor(verse.startTime));
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const playerUrl = `/songs/${id}?line=${number}`;

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        {song.verses.slice(Math.max(0, number - 2), number).map((line, index) => (
          <p key={index} lang={lang}>{line.original}</p>
        ))}
      </div>
      <main className={styles.sheet}>
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <span>Line {number} of {song.verses.length}, at {time}</span>
          <a href={playerUrl} className={styles.close} aria-label="Close line detail">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </a>
        </header>
        <div className={styles.lyrics}>
          <h1 lang={lang}>{verse.original}</h1>
          <section aria-labelledby="sounds-like">
            <h2 id="sounds-like">Sounds like</h2>
            <p className={styles.sound}>{verse.transliteration}</p>
          </section>
        </div>
        <section aria-labelledby="translation">
          <h2 id="translation">In {language}</h2>
          <p className={styles.translation}>{verse.translation}</p>
        </section>
        <section aria-labelledby="meaning">
          <h2 id="meaning">What it means</h2>
          <p className={styles.meaning}>{verse.meaning}</p>
        </section>
        <a href={`${playerUrl}&loop=1`} className={styles.loop}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m17 2 3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-5v2a4 4 0 0 1-4 4H4" />
          </svg>
          Loop line
        </a>
      </main>
    </div>
  );
}
