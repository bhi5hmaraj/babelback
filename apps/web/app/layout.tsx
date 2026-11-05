import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Babelback' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/">Babelback</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
