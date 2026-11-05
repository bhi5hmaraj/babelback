'use client';

import { useState, type CSSProperties } from 'react';
import { ACCENTS, THEMES, type Appearance, type Theme } from '../../theme.ts';
import styles from './appearance.module.css';

const year = 60 * 60 * 24 * 365;

function save(name: string, value: string | undefined) {
  document.cookie = `${name}=${value ?? ''}; path=/; max-age=${value ? year : 0}; samesite=lax`;
}

export function Picker(initial: Appearance) {
  const [theme, setTheme] = useState(initial.theme);
  const [accent, setAccent] = useState(initial.accent);
  const chosen = accent ?? THEMES[theme].accent;

  function pickTheme(id: Theme) {
    setTheme(id);
    save('theme', id);
    document.documentElement.dataset.theme = id;
  }

  function pickAccent(hex: string | undefined) {
    setAccent(hex);
    save('accent', hex);
    if (hex) document.documentElement.style.setProperty('--accent', hex);
    else document.documentElement.style.removeProperty('--accent');
  }

  return (
    <>
      <section role="group" aria-labelledby="theme-label" className={styles.group}>
        <h2 id="theme-label" className={styles.label}>Theme</h2>
        <div className={styles.themes}>
          {(Object.keys(THEMES) as Theme[]).map((id) => (
            <button key={id} type="button" aria-pressed={id === theme} onClick={() => pickTheme(id)} className={styles.card}>
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
        <button type="button" onClick={() => pickAccent(undefined)} className={styles.reset}>
          Use the theme&apos;s own colour
        </button>
      </section>
    </>
  );
}
