import type React from "react"
import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import "./globals.css"
import { Libre_Baskerville, IBM_Plex_Mono, Lora } from 'next/font/google'

import App from "../App";

const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'], variable: '--mobile-font-sans' })
const lora = Lora({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--mobile-font-serif' })
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--mobile-font-mono' })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = cookies()
  const debugCookie = cookieStore.get('bb_debug')?.value === '1'
  const debugEnv =
    process.env.BB_DEBUG === '1' ||
    process.env.BB_DEBUG_DEFAULT === '1' ||
    process.env.NEXT_PUBLIC_BB_DEBUG === '1' ||
    process.env.NEXT_PUBLIC_BB_DEBUG_DEFAULT === '1'

  const enableDebugBootstrap = debugCookie || debugEnv
  const bootstrapScript = enableDebugBootstrap
    ? `;(function(){try{localStorage.setItem('bb:debug','1')}catch(e){};window.__BB_DEBUG__=true;document.cookie='bb_debug=1;path=/';})();`
    : null

  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className={`font-sans antialiased ${libreBaskerville.variable} ${lora.variable} ${ibmPlexMono.variable}`}>
        {bootstrapScript ? (
          <script
            dangerouslySetInnerHTML={{ __html: bootstrapScript }}
          />
        ) : null}
        <App>{children}</App>
      </body>
    </html>
  )
}
