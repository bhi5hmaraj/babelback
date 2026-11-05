'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pollJob } from './actions.ts';
import styles from '../../workflows.module.css';

type Result = Awaited<ReturnType<typeof pollJob>>;
type Job = Extract<Result, { job: unknown }>['job'];

export function Progress({ initial }: { initial: Job }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [error, setError] = useState('');

  useEffect(() => {
    if (job.status === 'succeeded') {
      if (job.analysisId) router.replace(`/songs/${job.analysisId}`);
      return;
    }
    if (job.status === 'failed') return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    let delay = 2000;
    async function refresh() {
      try {
        const result = await pollJob(initial.id);
        if (disposed) return;
        if ('error' in result) { setError(result.error); return; }
        setJob(result.job);
        setError('');
        if (result.job.status === 'failed' || result.job.status === 'succeeded') return;
      } catch {
        if (disposed) return;
        setError('Connection interrupted. Checking again shortly.');
      }
      delay = Math.min(delay * 1.5, 10000);
      timeout = setTimeout(refresh, delay);
    }
    timeout = setTimeout(refresh, delay);
    return () => { disposed = true; clearTimeout(timeout); };
  }, [initial.id, job.status, job.analysisId, router]);

  const failed = job.status === 'failed';
  const ready = job.status === 'succeeded';
  return <>
    <div>
      <p className={styles.eyebrow}>{failed ? 'Could not prepare this song' : ready ? 'Ready to listen' : 'Getting it ready'}</p>
      <h1 className={styles.heading}>{typeof job.input.title === 'string' ? job.input.title : 'Your song'}</h1>
      <p role="status" className={styles.muted}>{job.status === 'queued' ? 'Waiting to start' : job.status === 'running' ? 'Listening and writing the lyrics' : ready ? 'Saved to your Library' : 'Analysis stopped'}</p>
    </div>
    {failed ? <p role="alert" className={styles.error}>{job.errorMessage || 'Could not analyse the song. Your credits have been returned.'}</p> : <>
      <ol className={styles.steps} aria-label="Progress">
        <li data-done={Boolean(job.assetId)}><span aria-hidden="true">1</span>Got the audio</li>
        <li aria-current={job.status === 'running' ? 'step' : undefined} data-done={ready}><span aria-hidden="true">2</span>Writing lyrics and translations</li>
        <li data-done={ready}><span aria-hidden="true">3</span>Saved to your Library</li>
      </ol>
      <progress aria-label="Song preparation" max="100" value={job.progress} className={styles.progress} />
    </>}
    {error && <p role="status" className={styles.error}>{error}</p>}
    <div className={styles.footer}>
      <p className={styles.muted}>You can leave this screen. Find this song in your Library. If analysis fails, your credits come back.</p>
      <Link href={failed ? '/add' : '/library'} className={styles.button}>{failed ? 'Try another song' : 'Go to Library'}</Link>
      <Link href="/" className={styles.secondary}>Back to home</Link>
    </div>
  </>;
}
