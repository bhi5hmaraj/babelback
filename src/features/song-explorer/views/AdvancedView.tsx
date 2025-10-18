import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Verse } from '@/types'

export interface AdvancedOptions {
  transliteration: boolean
  translation: boolean
  meaning: boolean
}

export interface AdvancedViewProps {
  verses: Verse[]
  currentIndex: number
  options: AdvancedOptions
  windowSize?: number
  onSelectVerse: (index: number) => void
  className?: string
}

export function AdvancedView({ verses, currentIndex, options, onSelectVerse, className }: AdvancedViewProps) {
  // Render all verses; auto-center active via ref
  const activeRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (activeRef.current?.scrollIntoView) {
      try {
        activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {}
    }
  }, [currentIndex])

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {verses.map((verse, absoluteIndex) => {
        const isActive = absoluteIndex === currentIndex
        return (
          <div
            key={verse.verseNumber ?? absoluteIndex}
            data-testid="adv-verse-item"
            data-index={absoluteIndex}
            data-active={isActive || undefined}
            ref={isActive ? activeRef : undefined}
            role="button"
            tabIndex={0}
            onClick={() => onSelectVerse(absoluteIndex)}
            className={cn(
              'cursor-pointer rounded-2xl border px-4 py-4 text-left',
              isActive ? 'border-[#c0a080] bg-white shadow-lg' : 'border-transparent bg-white/70 hover:border-[#dbd0ba]'
            )}
          >
            {/* Original is always shown */}
            <p data-testid="adv-original" className={cn('leading-relaxed verse-original mobile-serif', isActive ? 'text-lg' : 'text-base')}>
              {verse?.original ?? '…'}
            </p>

            {options.transliteration && (
              <p data-testid="adv-transliteration" className="mt-1 text-sm verse-transliteration">
                {verse?.transliteration ?? ''}
              </p>
            )}
            {options.translation && (
              <p data-testid="adv-translation" className="mt-1 text-sm verse-translation">
                {verse?.translation ?? ''}
              </p>
            )}
            {options.meaning && (
              <p data-testid="adv-meaning" className="mt-2 text-sm verse-meaning">
                {verse?.meaning ?? ''}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default AdvancedView
