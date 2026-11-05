'use client';

import { useEffect, useRef, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import type { api } from '../../../api.ts';
import { clock, currentLine, lineLoopStart } from './playback.ts';
import styles from './player.module.css';

type Seed = InferResponseType<ReturnType<typeof api>['v1']['seeds'][':id']['$get'], 200>;
const spectrum = [8, 14, 20, 16, 11, 18, 20, 13, 9, 15, 12, 7, 10, 5];

export function Player({ seed, initialLine = -1 }: { seed: Seed; initialLine?: number }) {
  const { song, audioUrl, id, language } = seed;
  const { verses } = song;
  const audio = useRef<HTMLAudioElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [time, setTime] = useState(initialLine >= 0 ? verses[initialLine].startTime : 0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<number | null>(null);
  const [visible, setVisible] = useState({ script: true, sound: true, meaning: true });
  const [error, setError] = useState('');
  const active = currentLine(verses, time);
  const total = duration || Math.max(0, ...verses.map((verse) => verse.endTime));
  const lineLabel = verses.length ? `${active + 1} of ${verses.length}` : '0 of 0';
  const originalLanguage = song.originalLanguage.toLowerCase();
  const lang = originalLanguage.includes('hindi') ? 'hi' : originalLanguage.includes('tamil') ? 'ta' : undefined;

  useEffect(() => {
    const item = list.current?.children[active] as HTMLElement | undefined;
    if (!item || !list.current) return;
    list.current.scrollTo({
      top: item.offsetTop - (list.current.clientHeight - item.clientHeight) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [active, visible]);

  async function play() {
    if (!audio.current) return;
    try {
      await audio.current.play();
      setError('');
    } catch {
      setError('Audio could not play. Try again.');
    }
  }

  function seek(seconds: number, autoplay = false) {
    if (!audio.current) return;
    audio.current.currentTime = seconds;
    setTime(seconds);
    if (loop !== null) setLoop(currentLine(verses, seconds));
    if (autoplay) void play();
  }

  function pickLine(index: number) {
    const verse = verses[index];
    if (verse) seek(verse.startTime, true);
  }

  return (
    <div className={styles.player}>
      <audio ref={audio} src={audioUrl} preload="metadata"
        onLoadedMetadata={(event) => {
          const media = event.currentTarget;
          if (Number.isFinite(media.duration)) setDuration(media.duration);
          if (initialLine >= 0) media.currentTime = verses[initialLine].startTime;
        }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError('Audio could not load. Reload the page to try again.'); }}
        onEnded={() => {
          setPlaying(false);
          if (loop !== null) pickLine(loop);
        }}
        onTimeUpdate={(event) => {
          const media = event.currentTarget;
          const restart = lineLoopStart(loop === null ? undefined : verses[loop], media.currentTime);
          if (restart !== null) media.currentTime = restart;
          setTime(media.currentTime);
        }} />
      <header className={styles.header}>
        <a className={styles.back} href="/" aria-label="Back to home">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </a>
        <div className={styles.heading}><h1>{song.title}</h1><p>{song.originalLanguage}, translated to {language}</p></div>
        <span className={styles.brand}>BABELBACK</span>
        <span className={styles.language}>{language}</span>
      </header>
      <div className={styles.lcd}>
        <div><span className={styles.lcdTime}>{clock(time)}</span><div className={styles.spectrum} aria-hidden="true">{spectrum.map((height, index) => <span key={index} style={{ height }} />)}</div></div>
        <div className={styles.lcdTitle}><span>{song.title} *** {song.originalLanguage} TO {language} ***</span><small>Line {lineLabel}</small></div>
      </div>
      <div className={styles.chips} role="group" aria-label="Show on each line">
        {([['script', 'Script'], ['sound', 'Sounds like'], ['meaning', 'Meaning']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={visible[key]} onClick={() => setVisible({ ...visible, [key]: !visible[key] })}>{label}</button>
        ))}
      </div>
      <ol ref={list} className={styles.verses} aria-label="Song lines">
        {verses.map((verse, index) => (
          <li key={index} className={index === active ? styles.active : undefined}>
            <button type="button" onClick={() => pickLine(index)} aria-current={index === active ? 'true' : undefined} aria-label={`Play line ${index + 1}`}>
              {visible.script && <span lang={lang} className={styles.script}>{verse.original}</span>}
              {visible.sound && <span className={styles.sound}>{verse.transliteration}</span>}
              {visible.meaning && <span className={styles.meaning}>{verse.translation}</span>}
              {!visible.script && !visible.sound && !visible.meaning && <span>Line {index + 1}</span>}
            </button>
            {index === active && <a className={styles.detail} href={`/songs/${id}/lines/${index + 1}`}>What this line means <span aria-hidden="true">&gt;</span></a>}
          </li>
        ))}
        {!verses.length && <li className={styles.empty}>No lines are available for this song.</li>}
      </ol>
      <section className={styles.playback} aria-label="Playback">
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.seek}>
          <div className={styles.track} aria-hidden="true">
            {total > 0 && verses.map((verse, index) => <span key={index} className={index === active ? styles.segmentActive : undefined} style={{ left: `${verse.startTime / total * 100}%`, width: `${Math.max(0, Math.min(verse.endTime, total) - verse.startTime) / total * 100}%`, background: index <= active ? 'var(--accent)' : 'var(--edge)' }} />)}
          </div>
          <input aria-label="Seek audio" type="range" min="0" max={total || 1} step="0.1" value={Math.min(time, total)} disabled={!total} aria-valuetext={`${clock(time)} of ${clock(total)}`} onChange={(event) => seek(Number(event.target.value))} />
        </div>
        <div className={styles.times}><span>{clock(time)}</span><span>Line {lineLabel}</span><span>{clock(total)}</span></div>
        <div className={styles.controls}>
          <button type="button" aria-label="Loop this line" aria-pressed={loop !== null} disabled={!verses.length} onClick={() => {
            if (loop !== null) setLoop(null);
            else { setLoop(active); if (time < verses[active].startTime || time >= verses[active].endTime) seek(verses[active].startTime); }
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m17 2 3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-5v2a4 4 0 0 1-4 4H4" /></svg>
          </button>
          <button type="button" aria-label="Previous line" disabled={!verses.length || active === 0} onClick={() => pickLine(active - 1)}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5.5v13L9.5 12z" /></svg></button>
          <button className={styles.play} type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (playing) audio.current?.pause(); else void play(); }}><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={playing ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M8 5.5v13l11-6.5z'} /></svg></button>
          <button type="button" aria-label="Next line" disabled={!verses.length || active === verses.length - 1} onClick={() => pickLine(active + 1)}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5.5v13L14.5 12z" /></svg></button>
          <span className={styles.controlSpace} aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
