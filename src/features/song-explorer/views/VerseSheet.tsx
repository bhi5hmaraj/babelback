import * as React from 'react'
import type { Verse } from '@/types'

export interface VerseSheetProps {
  verse: Verse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VerseSheet({ verse, open, onOpenChange }: VerseSheetProps) {
  if (!open) return null
  return (
    <div data-testid="verse-sheet" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-black/30">
      <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Verse details</h3>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close">
            Close
          </button>
        </div>
        {verse ? (
          <div>
            <p className="text-base font-semibold">{verse.original}</p>
            <p className="mt-2 text-sm text-[#5c4d3f]">{verse.transliteration}</p>
            <p className="mt-1 text-sm text-[#5c4d3f]">{verse.translation}</p>
            <div className="mt-3 rounded-lg bg-[#fffaf2] p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#a67c52]">Meaning & Context</h4>
              <p className="text-sm text-[#4a3f35]">{verse.meaning || 'Meaning not available yet.'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#7d6b56]">Select a verse to view its details.</p>
        )}
      </div>
    </div>
  )
}

export default VerseSheet

