import Link from 'next/link';
import { api } from '../api.ts';
import { account } from '../auth.ts';
import { SignOutButton } from '@clerk/nextjs';
import { Navigation } from './navigation.tsx';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const response = await api().v1.seeds.$get();
  if (!response.ok) throw new Error('Could not load songs');
  const { seeds } = await response.json();
  const user = await account();
  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="Babelback home">
          babel<span>back</span>
        </Link>
        <div className={styles.controls}>
          {user ? <><span className={styles.credits}>{user.creditBalance} credits</span><SignOutButton><button className={styles.signIn}>Sign out</button></SignOutButton></> : <Link href="/sign-in" className={styles.signIn}>Sign in</Link>}
          <Link href="/settings/appearance" className={styles.appearance} aria-label="Appearance">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
          </svg>
        </Link>
        </div>
      </header>
      <main className={styles.content}>
        <h1>What are we<br />listening to?</h1>
        <Link href="/add" className={styles.add}>Add your own song <span aria-hidden="true">+</span></Link>
        <section aria-labelledby="free-songs" className={styles.seeds}>
          <h2 id="free-songs">Try these, free</h2>
          {seeds.length === 0 ? (
            <p className={styles.empty}>Songs are on their way. Check back soon.</p>
          ) : (
            <ul className={styles.cards}>
              {seeds.map((seed) => (
                <li key={seed.id}>
                  <Link href={`/songs/${seed.id}`} className={styles.card}>
                    <span className={styles.title}>{seed.title}</span>
                    <span className={styles.languages}>{seed.originalLanguage} to {seed.language}</span>
                    <span className={styles.listen}>
                      Listen along
                      <span className={styles.play} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5.5v13l11-6.5Z" />
                        </svg>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Navigation active="home" />
    </div>
  );
}
