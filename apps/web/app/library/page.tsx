import Link from 'next/link';
import { authenticatedApi } from '../../auth.ts';
import { Navigation } from '../navigation.tsx';
import { deleteEntry } from './actions.ts';
import styles from '../workflows.module.css';

export const metadata = { title: 'Library - Babelback' };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; language?: string | string[] }> }) {
  const response = await (await authenticatedApi()).v1.library.$get();
  const result = await response.json();
  const query = await searchParams;
  const q = typeof query.q === 'string' ? query.q : '';
  const language = typeof query.language === 'string' ? query.language : '';
  if ('error' in result) return <main className={styles.main}><h1 className={styles.heading}>Library</h1><p role="alert" className={styles.error}>{typeof result.error === 'string' ? result.error : 'Could not load your Library.'}</p></main>;
  const { entries, jobs } = result;
  const languages = [...new Set(entries.map((entry) => entry.language).filter(Boolean))];
  const matching = entries.filter((entry) => entry.analysisId && entry.title.toLowerCase().includes(q.toLowerCase()) && (!language || entry.language === language));
  return <div className={styles.screen}>
    <main className={styles.main}>
      <div className={styles.row}><h1 className={styles.heading}>Library</h1><span className={styles.muted}>{entries.length} {entries.length === 1 ? 'song' : 'songs'}</span></div>
      <form action="/library" className={styles.search}>
        <label htmlFor="library-search" className={styles.muted}>Search your songs</label>
        <input id="library-search" type="search" name="q" defaultValue={q} placeholder="Search titles" className={styles.input} />
        {language && <input type="hidden" name="language" value={language} />}
        <button className={styles.secondary}>Search</button>
      </form>
      {languages.length > 0 && <form action="/library" className={styles.choices} aria-label="Filter by language">
        <input type="hidden" name="q" value={q} />
        {['', ...languages].map((item) => <button key={item} name="language" value={item ?? ''} className={styles.chip} aria-pressed={language === item}>{item || 'All'}</button>)}
      </form>}
      <ul className={styles.list}>
        {jobs.map((job) => <li key={job.id}>
          <Link href={`/processing/${job.id}`} className={styles.song}>
            <span aria-hidden="true" className={styles.tile}>{job.status === 'failed' ? '!' : '...'}</span>
            <span className={styles.songText}><strong>{typeof job.input.title === 'string' ? job.input.title : 'Your song'}</strong><span className={styles.muted}>{job.errorMessage || 'Lyrics and translations are on their way'}</span></span>
          </Link>
        </li>)}
        {matching.map((entry) => <li key={entry.id} className={styles.row}>
          <Link href={`/songs/${entry.analysisId}`} className={styles.song}>
            <span aria-hidden="true" className={styles.tile}>{entry.title.slice(0, 2)}</span>
            <span className={styles.songText}><strong>{entry.title}</strong><span className={styles.muted}>Translated to {entry.language}</span></span>
          </Link>
          <form action={deleteEntry}>
            <input type="hidden" name="id" value={entry.id} />
            <button className={styles.close} aria-label={`Remove ${entry.title} from Library`}>X</button>
          </form>
        </li>)}
      </ul>
      {!matching.length && <p className={styles.muted}>{q || language ? 'No songs match this search.' : jobs.length ? 'Your songs are being prepared above.' : 'Your songs will wait here. Add one to get started.'}</p>}
      <Link href="/add" className={styles.button}>Add a song</Link>
    </main>
    <Navigation active="library" />
  </div>;
}
