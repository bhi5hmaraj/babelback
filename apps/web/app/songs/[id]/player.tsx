'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { InferResponseType } from 'hono/client';
import type { api } from '../../../api.ts';
import { clock, currentLine, lineLoopStart, singLines, sungFraction } from './playback.ts';
import type { TimedLine } from './playback.ts';
import styles from './player.module.css';

type Seed = Pick<InferResponseType<ReturnType<typeof api>['v1']['seeds'][':id']['$get'], 200>, 'id' | 'song' | 'audioUrl' | 'language'>;
const spectrum = [8, 14, 20, 16, 11, 18, 20, 13, 9, 15, 12, 7, 10, 5];

export function Player({ seed, initialLine = -1, initialLoop = false }: { seed: Seed; initialLine?: number; initialLoop?: boolean }) {
  const { song, audioUrl, id, language } = seed;
  const { verses } = song;
  const lines = singLines(verses);
  const startVerse = initialLine >= 0 ? verses[initialLine] : undefined;
  const audio = useRef<HTMLAudioElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [time, setTime] = useState(startVerse?.startTime ?? 0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<TimedLine | null>(initialLoop && startVerse ? startVerse : null);
  const [visible, setVisible] = useState({ script: false, meaning: true });
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const active = currentLine(lines, time);
  const line = lines[active];
  const total = duration || Math.max(0, ...lines.map((item) => item.endTime));
  const lineLabel = line
    ? `Verse ${line.verse + 1} of ${verses.length}${line.count > 1 ? `, line ${line.n + 1} of ${line.count}` : ''}`
    : 'No lines';
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

  function follow(media: HTMLAudioElement) {
    const restart = lineLoopStart(loop ?? undefined, media.currentTime);
    if (restart !== null) media.currentTime = restart;
    setTime(media.currentTime);
  }

  // timeupdate fires about 4 times a second, too slow for a smooth sweep.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audio.current) follow(audio.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, loop]);

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
    if (loop && (seconds < loop.startTime || seconds >= loop.endTime)) setLoop(lines[currentLine(lines, seconds)] ?? null);
    if (autoplay) void play();
  }

  function pickLine(index: number) {
    const target = lines[index];
    if (target) seek(target.startTime, true);
  }

  return (
    <main className={styles.player}>
      <audio ref={audio} src={audioUrl} preload="metadata"
        onLoadedMetadata={(event) => {
          const media = event.currentTarget;
          if (Number.isFinite(media.duration)) setDuration(media.duration);
          if (startVerse) media.currentTime = startVerse.startTime;
        }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError('Audio could not load. Reload the page to try again.'); }}
        onEnded={() => {
          setPlaying(false);
          if (loop) seek(loop.startTime, true);
        }}
        onTimeUpdate={(event) => follow(event.currentTarget)} />
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
        <div className={styles.lcdTitle}><span>{song.title} *** {song.originalLanguage} TO {language} ***</span><small>{lineLabel}</small></div>
      </div>
      <div className={styles.chips} role="group" aria-label="Line options">
        {([['script', 'Script'], ['meaning', 'Meaning']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={visible[key]} onClick={() => setVisible({ ...visible, [key]: !visible[key] })}>{label}</button>
        ))}
        <button type="button" aria-pressed={slow} onClick={() => {
          if (audio.current) audio.current.playbackRate = slow ? 1 : 0.75;
          setSlow(!slow);
        }}>0.75x speed</button>
      </div>
      <ol ref={list} className={styles.verses} aria-label="Song lines">
        {lines.map((item, index) => {
          const now = index === active;
          return (
            <li key={index} className={now ? styles.active : index < active ? styles.past : undefined}>
              {item.n === 0 && <span className={styles.verseLabel}>Verse {item.verse + 1}</span>}
              <button type="button" onClick={() => pickLine(index)} aria-current={now ? 'true' : undefined}>
                {visible.script && <span lang={lang} className={styles.script}>{item.original}</span>}
                <span className={styles.sound}>
                  <span className={now ? styles.sung : undefined}
                    style={now ? { '--sung': `${sungFraction(item, time) * 100}%` } as CSSProperties : undefined}>{item.transliteration}</span>
                </span>
                {visible.meaning && <span className={styles.meaning}>{item.translation}</span>}
              </button>
              {now && <a className={styles.detail} href={`/songs/${id}/lines/${item.verse + 1}`}>What it means <span aria-hidden="true">&gt;</span></a>}
            </li>
          );
        })}
        {!lines.length && <li className={styles.empty}>No lines are available for this song.</li>}
      </ol>
      <section className={styles.playback} aria-label="Playback">
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.seek}>
          <div className={styles.track} aria-hidden="true">
            {total > 0 && lines.map((item, index) => <span key={index} className={index === active ? styles.segmentActive : undefined} style={{ left: `${item.startTime / total * 100}%`, width: `${Math.max(0, Math.min(item.endTime, total) - item.startTime) / total * 100}%`, background: index <= active ? 'var(--accent)' : 'var(--edge)' }} />)}
          </div>
          <input aria-label="Seek audio" type="range" min="0" max={total || 1} step="0.1" value={Math.min(time, total)} disabled={!total} aria-valuetext={`${clock(time)} of ${clock(total)}`} onChange={(event) => seek(Number(event.target.value))} />
        </div>
        <div className={styles.times}><span>{clock(time)}</span><span>{lineLabel}</span><span>{clock(total)}</span></div>
        <div className={styles.controls}>
          <button type="button" aria-label="Loop this line" aria-pressed={loop !== null} disabled={!line} onClick={() => {
            if (loop) setLoop(null);
            else if (line) { setLoop(line); if (time < line.startTime || time >= line.endTime) seek(line.startTime); }
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m17 2 3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-5v2a4 4 0 0 1-4 4H4" /></svg>
          </button>
          <button type="button" aria-label="Previous line" disabled={!line || active === 0} onClick={() => pickLine(active - 1)}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5.5v13L9.5 12z" /></svg></button>
          <button className={styles.play} type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (playing) audio.current?.pause(); else void play(); }}><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={playing ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M8 5.5v13l11-6.5z'} /></svg></button>
          <button type="button" aria-label="Next line" disabled={!line || active === lines.length - 1} onClick={() => pickLine(active + 1)}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5.5v13L14.5 12z" /></svg></button>
          {line ? <a className={styles.practise} href={`/songs/${id}/lines/${line.verse + 1}/practice`} aria-label="Practise this verse">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </a> : <span className={styles.controlSpace} aria-hidden="true" />}
        </div>
      </section>
    </main>
  );
}
