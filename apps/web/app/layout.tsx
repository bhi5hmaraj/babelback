import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { account, clerkEnabled } from '../auth.ts';
import { readAppearance } from './theme.ts';
import './globals.css';

export const metadata = { title: 'Babelback' };

const fonts =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Sans+Tamil:wght@400;600&family=VT323&display=swap';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const user = await account();
  const { theme, accent } = readAppearance(user?.theme ? {
    get: (name) => ({ value: (name === 'theme' ? user.theme : user.accent) ?? '' }),
  } : cookieStore);
  return (
    <html lang="en" data-theme={theme} style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fonts} />
      </head>
      <body>{clerkEnabled() ? <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-in">{children}</ClerkProvider> : children}</body>
    </html>
  );
}
