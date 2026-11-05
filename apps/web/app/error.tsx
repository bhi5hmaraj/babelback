'use client';

import Link from 'next/link';
import styles from './workflows.module.css';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className={styles.main}>
    <h1 className={styles.heading}>Could not load this screen</h1>
    <p role="alert" className={styles.error}>Please try again in a moment.</p>
    <button onClick={reset} className={styles.button}>Try again</button>
    <Link href="/" className={styles.secondary}>Back to home</Link>
  </main>;
}
