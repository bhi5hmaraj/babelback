"use client"

import type React from "react"
import Icon from "./Icon"
import { Button } from "./ui/button"

interface PlayerControlsProps {
  currentVerseIndex: number
  totalVerses: number
  onSeekToVerse: (idx: number) => void
  onPrevVerseClick: () => void
  onNextVerseClick: () => void
  disabled?: boolean
  compact?: boolean
}

/**
 * Verse navigation controls for the player bar.
 * Shows prev/next buttons and verse indicator.
 */
const PlayerControls: React.FC<PlayerControlsProps> = ({
  currentVerseIndex,
  totalVerses,
  onSeekToVerse,
  onPrevVerseClick,
  onNextVerseClick,
  disabled,
  compact,
}) => {
  if (totalVerses === 0) return null

  return (
    <div className={`flex items-center justify-between ${compact ? "mt-2" : "mt-3"}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrevVerseClick}
        disabled={disabled || currentVerseIndex === 0}
        className="text-secondary hover:text-primary hover:bg-surface disabled:opacity-30"
        aria-label="Previous verse"
      >
        <Icon name="caret-left" weight="bold" className="mr-1" />
        Prev
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground-subtle">
          Verse {currentVerseIndex + 1} of {totalVerses}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onNextVerseClick}
        disabled={disabled || currentVerseIndex >= totalVerses - 1}
        className="text-secondary hover:text-primary hover:bg-surface disabled:opacity-30"
        aria-label="Next verse"
      >
        Next
        <Icon name="caret-right" weight="bold" className="ml-1" />
      </Button>
    </div>
  )
}

export default PlayerControls
