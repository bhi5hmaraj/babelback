export const THEMES = {
  night: { name: 'Night', accent: '#F5B83D' },
  day: { name: 'Day', accent: '#F5B83D' },
  retro: { name: 'Retro deck', accent: '#F2D13A' },
} as const;

export type Theme = keyof typeof THEMES;

export const ACCENTS = [
  { hex: '#F5B83D', name: 'Marigold' },
  { hex: '#F2D13A', name: 'Lemon' },
  { hex: '#F28C6B', name: 'Coral' },
  { hex: '#7DD3C0', name: 'Mint' },
  { hex: '#8FC7FF', name: 'Sky' },
  { hex: '#B9A6FF', name: 'Lilac' },
  { hex: '#3CFF5A', name: 'Phosphor' },
] as const;

export type Appearance = { theme: Theme; accent?: string };

type Cookies = { get(name: string): { value: string } | undefined };

// The cookies are user input that lands in a style attribute, so only known values pass.
export function readAppearance(cookies: Cookies): Appearance {
  const theme = cookies.get('theme')?.value ?? '';
  const accent = cookies.get('accent')?.value;
  return {
    theme: Object.hasOwn(THEMES, theme) ? (theme as Theme) : 'night',
    accent: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : undefined,
  };
}
