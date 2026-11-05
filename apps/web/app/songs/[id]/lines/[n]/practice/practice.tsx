'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { pollAttempt, scoreAttempt, startAttempt } from './actions.ts';
import { scoreSummary, type Score } from './score.ts';
import styles from './practice.module.css';

type Verse = { original: string; transliteration: string; translation: string; startTime: number; endTime: number };
type Phase = 'ready' | 'recording' | 'scoring' | 'result';
type Props = {
  analysisId: string; title: string; line: number; lines: number; verse: Verse; lang?: string;
  audioUrl: string; credits: number; price: number; best: number | null;
};

// ponytail: fixed caps; a sung line is seconds long and scoring usually takes under a minute.
const MAX_RECORDING_SECONDS = 60;
const MAX_SCORING_MS = 3 * 60 * 1000;
const LEVELS = [18, 30, 44, 26, 58, 40, 66, 50, 34, 62, 72, 48, 38, 56, 30, 46, 24, 40, 28, 20, 14];
const RING = 2 * Math.PI * 33;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function Practice({ analysisId, title, line, lines, verse, lang, audioUrl, credits: startCredits, price, best: startBest }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [slow, setSlow] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [credits, setCredits] = useState(startCredits);
  const [best, setBest] = useState(startBest);
  const [summary, setSummary] = useState<ReturnType<typeof scoreSummary> | null>(null);
  const songUrl = `/songs/${analysisId}?line=${line}`;
  const short = credits < price;

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS && recorder.current?.state === 'recording') recorder.current.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  function hear() {
    const media = audio.current;
    if (!media) return;
    media.currentTime = verse.startTime;
    media.playbackRate = slow ? 0.75 : 1;
    media.play().catch(() => setError('The song could not play. Try again.'));
  }

  async function record() {
    setError('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Allow the microphone in your browser settings to practise.');
      return;
    }
    audio.current?.pause();
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    media.ondataavailable = (event) => chunks.push(event.data);
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      void submit(new Blob(chunks, { type: media.mimeType }));
    };
    recorder.current = media;
    media.start();
    setElapsed(0);
    setSummary(null);
    setPhase('recording');
  }

  async function submit(recording: Blob) {
    setPhase('scoring');
    try {
      // The signed upload is for the bare type, so codec parameters are dropped.
      const contentType = recording.type.split(';')[0];
      const started = await startAttempt({ analysisId, line, contentType, bytes: recording.size });
      if ('error' in started) throw new Error(String(started.error));
      const put = await fetch(started.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: recording });
      if (!put.ok) throw new Error('The recording did not upload. Please try again.');
      const queued = await scoreAttempt(started.attempt.id);
      if ('error' in queued) throw new Error(String(queued.error));
      setCredits((value) => value - price);
      const deadline = Date.now() + MAX_SCORING_MS;
      for (let delay = 1500; Date.now() < deadline; delay = Math.min(delay * 1.5, 5000)) {
        await wait(delay);
        const polled = await pollAttempt(started.attempt.id);
        if ('error' in polled) throw new Error(String(polled.error));
        const { status, score, errorMessage } = polled.attempt;
        if (status === 'failed') {
          setCredits((value) => value + price);
          throw new Error(errorMessage ?? 'We could not score this attempt. Your credit has been returned.');
        }
        if (score) return show(score);
      }
      throw new Error('Scoring is taking longer than usual. Try again in a moment.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not score this attempt. Please try again.');
      setPhase('ready');
    }
  }

  function show(score: Score) {
    setSummary(scoreSummary(score, line, best));
    setBest((value) => Math.max(value ?? 0, score.overallScore));
    setPhase('result');
  }

  return (
    <div className={styles.screen}>
      <audio ref={audio} src={audioUrl} preload="metadata"
        onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= verse.endTime) event.currentTarget.pause(); }} />
      <header className={styles.header}>
        <a href={songUrl} aria-label="Close practice" className={styles.close}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </a>
        <div className={styles.title}>
          <h1>Practise</h1>
          <p>{title}, line {line} of {lines}</p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <p lang={lang} className={styles.original}>{verse.original}</p>
          <p className={styles.sound}>{verse.transliteration}</p>
          <p className={styles.translation}>{verse.translation}</p>
          <div className={styles.buttons}>
            <button type="button" className={styles.hear} onClick={hear}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
              Hear it
            </button>
            <button type="button" className={styles.slow} aria-pressed={slow} onClick={() => {
              setSlow(!slow);
              if (audio.current) audio.current.playbackRate = slow ? 1 : 0.75;
            }}>Slower</button>
          </div>
        </div>

        {phase === 'ready' && <div className={styles.hint}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="2" /><rect x="17" y="14" width="4" height="7" rx="2" /></svg>
          <span>Wear earphones so the mic hears only you, not the song.</span>
        </div>}

        {phase === 'recording' && <div className={styles.listening}>
          <div aria-hidden="true" className={styles.levels}>{LEVELS.map((height, index) => <span key={index} style={{ height }} />)}</div>
          <span role="status">Listening to you, {clock(elapsed)}</span>
        </div>}

        {phase === 'scoring' && <p role="status" className={styles.status}>Scoring your singing...</p>}

        {phase === 'result' && summary && <section aria-label="Your score" className={styles.result}>
          <div className={styles.overall}>
            <div className={styles.ring}>
              <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
                <circle cx="38" cy="38" r="33" fill="none" stroke="var(--line)" strokeWidth="7" />
                <circle cx="38" cy="38" r="33" fill="none" stroke="var(--accent)" strokeWidth="7" strokeDasharray={`${summary.overall / 100 * RING} ${RING}`} transform="rotate(-90 38 38)" />
              </svg>
              <span>{summary.overall}</span>
            </div>
            <div>
              <strong>{summary.label}</strong>
              <span className={styles.muted}>{summary.note}</span>
            </div>
          </div>
          <dl className={styles.bars}>
            {summary.bars.map((bar) => <div key={bar.label}>
              <dt>{bar.label}</dt>
              <dd aria-hidden="true"><span style={{ width: `${bar.value}%` }} /></dd>
              <dd>{bar.value}</dd>
            </div>)}
          </dl>
          {summary.tip && <p className={styles.tip}>{summary.tip}</p>}
        </section>}

        {error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={short ? styles.error : styles.price}>
          {short ? `Scoring costs ${price} ${price === 1 ? 'credit' : 'credits'} and you have ${credits}.`
            : `Each score costs ${price} ${price === 1 ? 'credit' : 'credits'}. You have ${credits}.`}
        </p>
      </main>

      <div className={styles.footer}>
        <button type="button" className={styles.side} disabled={phase === 'recording' || phase === 'scoring'}
          onClick={() => { setSummary(null); setError(''); setPhase('ready'); }}>Try again</button>
        <button type="button" className={styles.mic} aria-label={phase === 'recording' ? 'Stop and score' : 'Start singing'}
          disabled={phase === 'scoring' || (phase !== 'recording' && short)}
          onClick={() => { if (phase === 'recording') recorder.current?.stop(); else void record(); }}>
          {phase === 'recording' ? <span className={styles.stop} /> : <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
        </button>
        {line < lines
          ? <Link href={`/songs/${analysisId}/lines/${line + 1}/practice`} className={styles.side}>Next line</Link>
          : <a href={songUrl} className={styles.side}>Done</a>}
      </div>
    </div>
  );
}
