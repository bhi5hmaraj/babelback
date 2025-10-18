import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Verse } from '@/types'

export interface BasicViewProps {
  verses: Verse[]
  currentIndex: number
  windowSize?: number
  onSelectVerse: (index: number) => void
  className?: string
}

/**
 * Basic view: renders current verse with ±windowSize neighbors.
 * Pure presentational; no global state.
 */
export function BasicView({ verses, currentIndex, onSelectVerse, className }: BasicViewProps) {
  // window used only for auto-centering; render all verses
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
            data-testid="verse-item"
            data-index={absoluteIndex}
            data-active={isActive || undefined}
            ref={isActive ? activeRef : undefined}
            role="button"
            tabIndex={0}
            onClick={() => onSelectVerse(absoluteIndex)}
            className={cn(
              'cursor-pointer rounded-[28px] border text-center transition-all',
              isActive
                ? 'border-[#c0a080] bg-white shadow-lg px-5 py-4'
                : 'border-[#dbd0ba] bg-[#fffaf2] hover:border-[#c0a080] px-5 py-3'
            )}
          >
            <p className={cn('leading-relaxed verse-original mobile-serif', isActive ? 'text-lg' : 'text-base')}>{verse?.original ?? '…'}</p>
          </div>
        )
      })}
    </div>
  )
}

export default BasicView
