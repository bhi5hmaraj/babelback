import type React from "react"
import { Analytics } from "@vercel/analytics/react"
import { ThemeProvider } from "./components/theme-provider"

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="light">
      {children}
      <Analytics />
    </ThemeProvider>
  )
}
