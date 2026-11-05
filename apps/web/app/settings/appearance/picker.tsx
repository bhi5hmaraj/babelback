'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { ACCENTS, THEMES, type Appearance, type Theme } from '../../theme.ts';
import { saveAppearance } from './actions.ts';
import styles from './appearance.module.css';

export function Picker(initial: Appearance) {
  const [theme, setTheme] = useState(initial.theme);
  const [accent, setAccent] = useState(initial.accent);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chosen = accent ?? THEMES[theme].accent;

  function persist(value: Appearance) {
    startTransition(async () => {
      try { setError((await saveAppearance(value)).error); }
      catch { setError('Your appearance could not be saved. Please try again.'); }
    });
  }

  function pickTheme(id: Theme) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    persist({ theme: id, accent });
  }

  function pickAccent(hex: string | undefined) {
    setAccent(hex);
    if (hex) document.documentElement.style.setProperty('--accent', hex);
    else document.documentElement.style.removeProperty('--accent');
    persist({ theme, accent: hex });
  }

  return (
    <>
      <section role="group" aria-labelledby="theme-label" className={styles.group}>
        <h2 id="theme-label" className={styles.label}>Theme</h2>
        <div className={styles.themes}>
          {(Object.keys(THEMES) as Theme[]).map((id) => (
            <button key={id} type="button" disabled={pending} aria-pressed={id === theme} onClick={() => pickTheme(id)} className={styles.card}>
              <span
                aria-hidden="true"
                data-theme={id}
                className={styles.swatch}
                style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}
              >
                <span />
                <span>
                  <span />
                  <span />
                </span>
              </span>
              <span className={styles.name}>{THEMES[id].name}</span>
            </button>
          ))}
        </div>
      </section>

      <section role="group" aria-labelledby="accent-label" className={styles.group}>
        <div className={styles.row}>
          <h2 id="accent-label" className={styles.label}>Button colour</h2>
          <span className={styles.chosen}>{ACCENTS.find((a) => a.hex === chosen)?.name ?? 'Custom'}</span>
        </div>
        <div className={styles.accents}>
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              type="button"
              disabled={pending}
              aria-label={a.name}
              aria-pressed={a.hex === chosen}
              onClick={() => pickAccent(a.hex)}
              className={styles.accent}
              style={{ background: a.hex }}
            >
              {a.hex === chosen && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <button type="button" disabled={pending} onClick={() => pickAccent(undefined)} className={styles.reset}>
          Use the theme&apos;s own colour
        </button>
      </section>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
