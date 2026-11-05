import Link from 'next/link';
import { notFound } from 'next/navigation';
import { authenticatedApi } from '../../../auth.ts';
import { Progress } from './progress.tsx';
import styles from '../../workflows.module.css';

export const metadata = { title: 'Preparing your song - Babelback' };

export default async function ProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await (await authenticatedApi()).v1.jobs[':id'].$get({ param: { id } });
  if (response.status === 404) notFound();
  const result = await response.json();
  return <div className={styles.screen}>
    <header className={styles.row}><Link href="/" className={styles.close} aria-label="Back to home">&lt;</Link></header>
    <main className={styles.main}>
      {'error' in result ? <p role="alert" className={styles.error}>{typeof result.error === 'string' ? result.error : 'Could not load this job.'}</p> : <Progress initial={result.job} />}
    </main>
  </div>;
}
