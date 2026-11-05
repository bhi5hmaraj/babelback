'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { importYoutube } from './actions.ts';
import { languages } from './form.tsx';
import styles from '../workflows.module.css';

export function YoutubeForm({ credits, price, maxSongSeconds }: { credits: number; price: number; maxSongSeconds: number }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState<(typeof languages)[number]>('English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      requestKey.current ??= crypto.randomUUID();
      const result = await importYoutube(url, language, requestKey.current);
      if ('error' in result) { requestKey.current = null; throw new Error(String(result.error)); }
      router.push(`/processing/${result.job.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the song. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.field} htmlFor="youtube-link">
        YouTube link
        <input id="youtube-link" type="url" required inputMode="url" placeholder="https://youtu.be/..." className={styles.input}
          value={url} disabled={busy} onChange={(event) => { setUrl(event.target.value); requestKey.current = null; }} />
        <span className={styles.muted}>Songs up to {Math.floor(maxSongSeconds / 60)} minutes</span>
      </label>
      <fieldset className={styles.fieldset} disabled={busy}>
        <legend className={styles.muted}>Translate into</legend>
        <div className={styles.choices}>
          {languages.map((item) => <button key={item} type="button" aria-pressed={language === item} className={styles.chip} onClick={() => {
            setLanguage(item); requestKey.current = null;
          }}>{item}</button>)}
        </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.footer}>
        <p className={styles.muted}>Costs {price} credits. You have {credits}.</p>
        {credits < price && <p className={styles.error}>You need {price - credits} more credits to add this song.</p>}
        <button className={styles.button} disabled={!url || busy || credits < price}>{busy ? 'Starting...' : 'Add song'}</button>
      </div>
    </form>
  );
}
