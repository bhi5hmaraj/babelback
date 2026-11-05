'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { currentLine, singLines, sungFraction } from '../../../playback.ts';
import { pollAttempt, scoreAttempt, startAttempt } from './actions.ts';
import { scoreSummary, type Score } from './score.ts';
import styles from './practice.module.css';

type Lyric = { original: string; transliteration: string; translation: string; startTime: number; endTime: number };
type Verse = Lyric & { lines?: Lyric[] };
type Phase = 'ready' | 'singing' | 'review' | 'scoring' | 'result';
type Props = {
  analysisId: string; title: string; verseNumber: number; verseCount: number; verse: Verse; lang?: string;
  audioUrl: string; credits: number; price: number; best: number | null;
};

// ponytail: fixed caps; a verse is well under a minute even at 0.75x, and scoring usually takes under a minute.
const MAX_RECORDING_SECONDS = 120;
const MAX_SCORING_MS = 3 * 60 * 1000;
const RING = 2 * Math.PI * 33;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const credit = (count: number) => `${count} ${count === 1 ? 'credit' : 'credits'}`;

export function Practice({ analysisId, title, verseNumber, verseCount, verse, lang, audioUrl, credits: startCredits, price, best: startBest }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout>>(undefined);
  const singStart = useRef(0);
  const lines = singLines([verse]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [time, setTime] = useState(verse.startTime);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [withSong, setWithSong] = useState(true);
  const [take, setTake] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState('');
  const [credits, setCredits] = useState(startCredits);
  const [best, setBest] = useState(startBest);
  const [summary, setSummary] = useState<ReturnType<typeof scoreSummary> | null>(null);
  const songUrl = `/songs/${analysisId}?line=${verseNumber}`;
  const rate = slow ? 0.75 : 1;
  const singing = phase === 'singing';
  const following = playing || singing;
  const active = currentLine(lines, time);
  const length = Math.ceil(verse.endTime - verse.startTime);

  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    clearTimeout(autoStop.current);
  }, []);

  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);

  // Without the song there is no audio clock, so the lyrics follow the time since the take began.
  useEffect(() => {
    if (!following) return;
    let frame = 0;
    const tick = () => {
      setTime(singing && !withSong
        ? verse.startTime + (performance.now() - singStart.current) / 1000 * rate
        : audio.current?.currentTime ?? verse.startTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [following, singing, withSong, rate, verse.startTime]);

  function hear() {
    const media = audio.current;
    if (!media) return;
    if (playing) return media.pause();
    media.currentTime = verse.startTime;
    media.playbackRate = rate;
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
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    media.ondataavailable = (event) => chunks.push(event.data);
    media.onstop = () => {
      clearTimeout(autoStop.current);
      stream.getTracks().forEach((track) => track.stop());
      audio.current?.pause();
      const blob = new Blob(chunks, { type: media.mimeType });
      setTake({ blob, url: URL.createObjectURL(blob) });
      setPhase('review');
    };
    recorder.current = media;
    const song = audio.current;
    if (song) {
      song.pause();
      song.currentTime = verse.startTime;
      song.playbackRate = rate;
    }
    media.start();
    singStart.current = performance.now();
    if (withSong) song?.play().catch(() => setError('The song could not play. Sing without it or try again.'));
    // The take ends a second after the verse does.
    autoStop.current = setTimeout(() => { if (media.state === 'recording') media.stop(); },
      Math.min(MAX_RECORDING_SECONDS, (verse.endTime - verse.startTime) / rate + 1) * 1000);
    setTime(verse.startTime);
    setTake(null);
    setSummary(null);
    setPhase('singing');
  }

  async function submit(recording: Blob) {
    setError('');
    setPhase('scoring');
    try {
      // The signed upload is for the bare type, so codec parameters are dropped.
      const contentType = recording.type.split(';')[0];
      const started = await startAttempt({ analysisId, verse: verseNumber, contentType, bytes: recording.size });
      if ('error' in started) throw new Error(String(started.error));
      const put = await fetch(started.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: recording })
        .catch(() => null);
      if (!put?.ok) throw new Error('Your take did not upload. Check your connection and try again.');
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
          throw new Error(errorMessage ?? 'We could not score this take. Your credit has been returned.');
        }
        if (score) return show(score);
      }
      throw new Error('Scoring is taking longer than usual. Try again in a moment.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not score this take. Please try again.');
      setPhase('review');
    }
  }

  function show(score: Score) {
    setSummary(scoreSummary(score, verseNumber, best));
    setBest((value) => Math.max(value ?? 0, score.overallScore));
    setPhase('result');
  }

  return (
    <div className={styles.screen}>
      <audio ref={audio} src={audioUrl} preload="auto"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= verse.endTime) event.currentTarget.pause(); }} />
      <header className={styles.header}>
        <a href={songUrl} aria-label="Close practice" className={styles.close}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </a>
        <div className={styles.title}>
          <h1>Practise</h1>
          <p>{title}, verse {verseNumber} of {verseCount}</p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <ol className={styles.lyrics} aria-label="Lines to sing">
            {lines.map((line, index) => {
              const now = following && index === active;
              return (
                <li key={index} className={now ? styles.now : following && index < active ? styles.past : undefined}>
                  <span className={styles.sound}>
                    <span className={now ? styles.sung : undefined}
                      style={now ? { '--sung': `${sungFraction(line, time) * 100}%` } as CSSProperties : undefined}>{line.transliteration}</span>
                  </span>
                  <span lang={lang} className={styles.original}>{line.original}</span>
                  <span className={styles.translation}>{line.translation}</span>
                </li>
              );
            })}
          </ol>
          <div className={styles.buttons}>
            <button type="button" className={styles.hear} disabled={singing} onClick={hear}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={playing && !singing ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M8 5.5v13l11-6.5z'} fill="currentColor" /></svg>
              {playing && !singing ? 'Stop' : 'Hear it'}
            </button>
            <button type="button" className={styles.toggle} aria-pressed={slow} disabled={singing} onClick={() => {
              setSlow(!slow);
              if (audio.current) audio.current.playbackRate = slow ? 1 : 0.75;
            }}>Slower</button>
            <button type="button" className={styles.toggle} aria-pressed={withSong} disabled={singing} onClick={() => setWithSong(!withSong)}>
              With the song
            </button>
          </div>
        </div>

        {phase === 'ready' && <p className={styles.hint}>
          {withSong ? 'Tap the mic and sing along. Wear earphones so the mic hears only you.' : 'Tap the mic and sing as each line lights up.'}
        </p>}

        {singing && <p role="status" className={styles.recording}>
          <span className={styles.dot} aria-hidden="true" />
          Recording, {clock(Math.min(length, Math.max(0, Math.floor(time - verse.startTime))))} of {clock(length)}
        </p>}

        {(phase === 'review' || phase === 'scoring') && take && <section aria-label="Your take" className={styles.review}>
          <audio controls src={take.url} className={styles.take} />
          <button type="button" className={styles.score} disabled={phase === 'scoring' || credits < price} onClick={() => void submit(take.blob)}>
            {phase === 'scoring' ? 'Scoring your singing...' : `Score it, ${credit(price)}`}
          </button>
          <p role={phase === 'scoring' ? 'status' : undefined} className={credits < price ? styles.short : styles.price}>
            {credits < price ? `Scoring costs ${credit(price)} and you have ${credits}.` : `You have ${credit(credits)}. Singing again is free.`}
          </p>
        </section>}

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
          {summary.heard && <p className={styles.heard}><strong>We heard</strong>{summary.heard}</p>}
          {take && <audio controls src={take.url} className={styles.take} />}
        </section>}

        {error && <p role="alert" className={styles.error}>{error}</p>}
      </main>

      <div className={styles.footer}>
        <a href={songUrl} className={styles.side}>Song</a>
        <div className={styles.micColumn}>
          <button type="button" className={styles.mic} aria-label={singing ? 'Stop' : take ? 'Sing again' : 'Sing along'}
            disabled={phase === 'scoring'}
            onClick={() => { if (singing) recorder.current?.stop(); else void record(); }}>
            {singing ? <span className={styles.stop} /> : <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
          </button>
          <span aria-hidden="true">{singing ? 'Stop' : take ? 'Sing again' : 'Sing along'}</span>
        </div>
        {verseNumber < verseCount
          ? <Link href={`/songs/${analysisId}/lines/${verseNumber + 1}/practice`} className={styles.side}>Next verse</Link>
          : <a href={songUrl} className={styles.side}>Done</a>}
      </div>
    </div>
  );
}
