'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { analyzeUpload, completeUpload, createUpload } from './actions.ts';
import { uploadError } from './upload.ts';
import styles from '../workflows.module.css';

const languages = ['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali'] as const;

export function UploadForm({ credits, price, maxUploadMb, maxSongSeconds }: {
  credits: number; price: number; maxUploadMb: number; maxSongSeconds: number;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<Parameters<typeof analyzeUpload>[1]>('English');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const asset = useRef<string | null>(null);
  const requestKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const invalid = uploadError(file, maxUploadMb);
    if (invalid) { setError(invalid); return; }
    setError('');
    setBusy('Preparing upload...');
    try {
      if (!asset.current) {
        const upload = await createUpload({ title: file.name, contentType: file.type, bytes: file.size });
        if ('error' in upload) throw new Error(upload.error);
        setBusy('Uploading audio...');
        const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!put.ok) throw new Error('The upload did not finish. Please try again.');
        const completed = await completeUpload(upload.id);
        if ('error' in completed) throw new Error(completed.error);
        asset.current = upload.id;
      }
      setBusy('Starting analysis...');
      requestKey.current ??= crypto.randomUUID();
      const result = await analyzeUpload(asset.current, language, requestKey.current);
      if ('error' in result) { requestKey.current = null; throw new Error(result.error); }
      router.push(`/processing/${result.job.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the song. Please try again.');
    } finally { setBusy(''); }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.upload} htmlFor="audio-file">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
        <strong>{file?.name ?? 'Choose an audio file'}</strong>
        <span className={styles.muted}>Up to {maxUploadMb} MB and {Math.floor(maxSongSeconds / 60)} minutes</span>
        <input id="audio-file" type="file" accept="audio/*" disabled={Boolean(busy)} onChange={(event) => {
          setFile(event.target.files?.[0] ?? null); asset.current = null; requestKey.current = null; setError('');
        }} />
      </label>
      <fieldset className={styles.fieldset} disabled={Boolean(busy)}>
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
        <button className={styles.button} disabled={!file || Boolean(busy) || credits < price}>{busy || 'Add song'}</button>
        <p role="status" aria-live="polite" className={styles.muted}>{busy}</p>
      </div>
    </form>
  );
}
