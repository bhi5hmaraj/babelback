import Link from 'next/link';
import styles from '../../workflows.module.css';

export const metadata = { title: 'Sign in - Babelback' };

export default function SignInPage() {
  return (
    <main className={styles.backdrop}>
      <section aria-labelledby="sign-in-heading" className={styles.sheet}>
        <div aria-hidden="true" className={styles.handle} />
        <div className={styles.row}>
          <h1 id="sign-in-heading" className={styles.heading}>Sign in to add<br />your own songs</h1>
          <Link href="/" aria-label="Close sign in" className={styles.close}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </div>
        <p className={styles.muted}>Keep your songs in your Library and practise any line.</p>
        <p role="status" className={styles.error}>Sign-in is not configured yet. Please try again later.</p>
        <div className={styles.footer}>
          <p className={styles.muted}>The sample songs stay free without an account.</p>
          <Link href="/" className={styles.button}>Listen to the free songs</Link>
        </div>
      </section>
    </main>
  );
}
