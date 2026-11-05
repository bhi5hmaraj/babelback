import Link from 'next/link';
import { cookies } from 'next/headers';
import { readAppearance } from '../../theme.ts';
import { Picker } from './picker.tsx';
import styles from './appearance.module.css';

export const metadata = { title: 'Appearance - Babelback' };

export default async function AppearancePage() {
  const appearance = readAppearance(await cookies());
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link href="/" aria-label="Back to home" className={styles.round}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className={styles.title}>Appearance</h1>
      </header>

      <main className={styles.main}>
        <section aria-label="Preview" className={styles.preview}>
          <div className={styles.panel}>
            <span lang="hi" className={styles.before}>साहिबा नींदें विंदें आए ना</span>
            <div className={styles.now}>
              <span lang="hi" className={styles.lyric}>साहिबा समंदर मेरी आँखों में रह गए</span>
              <span className={styles.sound}>Sah-heh-bah sah-mun-dur meh-ree ahn-khon</span>
            </div>
            <span lang="hi" className={styles.after}>ये पलकें गवाही है</span>
          </div>
          <div aria-hidden="true" className={styles.seek}>
            {Array.from({ length: 10 }, (_, index) => (
              <span key={index} className={index <= 3 ? styles.played : undefined} data-now={index === 3 || undefined} />
            ))}
          </div>
          <div aria-hidden="true" className={styles.transport}>
            <span className={styles.nav}>
              <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5.5v13L9.5 12z" fill="currentColor" /></svg>
            </span>
            <span className={styles.play}>
              <svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
            </span>
            <span className={styles.nav}>
              <svg width="22" height="22" viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5.5v13L14.5 12z" fill="currentColor" /></svg>
            </span>
          </div>
        </section>

        <Picker {...appearance} />

        <p className={styles.note}>Saved on this device.</p>
      </main>
    </div>
  );
}
