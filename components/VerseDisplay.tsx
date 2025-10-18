"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import type { Verse, PanelVisibility } from "../types"
import Icon from "./Icon"

interface VerseDisplayCardProps {
  title: string
  content: string | React.ReactNode
  language?: string
  isVisible: boolean
  iconName?: string
  iconColorClass?: string
}

const VerseDisplayCard: React.FC<VerseDisplayCardProps> = ({
  title,
  content,
  language,
  isVisible,
  iconName,
  iconColorClass = "text-secondary",
}) => {
  if (!isVisible) return null

  return (
    <div className="bg-surface/90 backdrop-blur-sm p-4 rounded-lg shadow-lg mt-4 transition-all duration-300 ease-in-out border border-border">
      <h3
        className={`text-sm font-semibold ${iconColorClass} mb-1 tracking-wide flex items-center`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {iconName && <Icon name={iconName} weight="bold" className="mr-2" />}
        {title} {language && <span className="text-xs text-foreground-subtle">({language})</span>}
      </h3>
      {typeof content === "string" ? (
        <p className="text-foreground whitespace-pre-wrap leading-relaxed text-base">{content || "N/A"}</p>
      ) : (
        <div className="text-foreground leading-relaxed text-base">{content || "N/A"}</div>
      )}
    </div>
  )
}

/** Props for the synchronized verse view. */
interface VerseDisplayProps {
  verse: Verse
  targetLanguage: string
  originalLanguageLabel: string
  panelVisibility: PanelVisibility
  currentTime: number
  isKaraokeMode: boolean
}

// Render a plain lyric line with native spacing and wrapping (fixes cramped words on mobile).
const renderLineText = (lineText: string) => (
  <span className="whitespace-pre-wrap break-words">{lineText && lineText.length > 0 ? lineText : "\u00A0"}</span>
)

/**
 * Renders the current verse with synchronized lines.
 * - In Karaoke mode, highlights phrase timings and auto-centers the active line.
 * - On mobile, words render inline for readability (no chips).
 */
const VerseDisplay: React.FC<VerseDisplayProps> = ({
  verse,
  targetLanguage,
  originalLanguageLabel,
  panelVisibility,
  currentTime,
  isKaraokeMode,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeLinePairRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isKaraokeMode) return
    const container = scrollContainerRef.current
    const activeEl = activeLinePairRef.current
    if (!container || !activeEl) return

    // Keep the active line centered at ~40% from top (better for reading flow)
    const containerHeight = container.clientHeight
    const elTop = activeEl.offsetTop
    const elHeight = activeEl.offsetHeight
    const targetScrollTop = Math.max(0, elTop - containerHeight * 0.4 + elHeight / 2)

    // Only adjust if we're far enough from the target to avoid jitter
    const delta = Math.abs(container.scrollTop - targetScrollTop)
    if (delta > 20) {
      container.scrollTo({ top: targetScrollTop, behavior: "smooth" })
    }
  }, [currentTime, isKaraokeMode, verse])

  if (!verse) {
    return <div className="text-center text-foreground-subtle py-8">No verse data available.</div>
  }

  const isInstrumentalSong = originalLanguageLabel === "Instrumental"

  const renderLyricPairs = () => {
    const linePairs: {
      translit: string | null
      translat: string | null
      isActiveTlit: boolean
      isActiveTlat: boolean
      startTime?: number
      endTime?: number
    }[] = []

    if (isKaraokeMode && verse.transliterationSegments && verse.translationSegments) {
      const numTranslitSegments = verse.transliterationSegments.length
      const numTranslatSegments = verse.translationSegments.length

      const maxLength = Math.max(numTranslitSegments, numTranslatSegments)

      for (let i = 0; i < maxLength; i++) {
        const tlitSeg = verse.transliterationSegments[i]
        const tlatSeg =
          verse.translationSegments && verse.translationSegments.length > i ? verse.translationSegments[i] : null

        const pair: {
          translit: string | null
          translat: string | null
          isActiveTlit: boolean
          isActiveTlat: boolean
          startTime?: number
          endTime?: number
        } = {
          translit: null,
          translat: null,
          isActiveTlit: false,
          isActiveTlat: false,
        }

        if (tlitSeg) {
          pair.translit = tlitSeg.text
          pair.startTime = tlitSeg.startTime
          pair.endTime = tlitSeg.endTime
          pair.isActiveTlit = currentTime >= tlitSeg.startTime && currentTime < tlitSeg.endTime
        }

        if (tlatSeg) {
          pair.translat = tlatSeg.text
          if (!pair.startTime && tlatSeg.startTime) pair.startTime = tlatSeg.startTime
          if (!pair.endTime && tlatSeg.endTime) pair.endTime = tlatSeg.endTime
          pair.isActiveTlat =
            pair.startTime !== undefined &&
            pair.endTime !== undefined &&
            currentTime >= pair.startTime &&
            currentTime < pair.endTime
        } else if (tlitSeg) {
          pair.isActiveTlat = pair.isActiveTlit
        }

        if (pair.translit || pair.translat) {
          linePairs.push(pair)
        }
      }
      if (linePairs.length === 0 && (verse.transliteration || verse.translation)) {
        linePairs.push({
          translit: verse.transliteration || "Transliteration segments missing.",
          translat: verse.translation || "Translation segments missing.",
          isActiveTlit: false,
          isActiveTlat: false,
        })
      }
    } else {
      // Non-Karaoke Mode
      const translitLines = (verse.transliteration || "").split("\n")
      const translatLines = (verse.translation || "").split("\n")
      const maxLength = Math.max(translitLines.length, translatLines.length)

      for (let i = 0; i < maxLength; i++) {
        linePairs.push({
          translit: translitLines[i] !== undefined ? translitLines[i] : null,
          translat: translatLines[i] !== undefined ? translatLines[i] : null,
          isActiveTlit: false,
          isActiveTlat: false,
        })
      }
    }

    if (isInstrumentalSong && linePairs.every((p) => !p.translit && !p.translat)) {
      return (
        <div className="lyric-line-pair">
          <div className="translit-segment lyric-line-transliteration">{renderLineText("Instrumental Section")}</div>
        </div>
      )
    }
    if (linePairs.length === 0) {
      return (
        <div className="lyric-line-pair">
          <div className="translit-segment lyric-line-transliteration">
            {renderLineText("Lyrics not available for this verse.")}
          </div>
        </div>
      )
    }

    return linePairs.map((pair, index) => {
      const isOverallActivePair = pair.isActiveTlit || pair.isActiveTlat
      return (
        <div
          key={`line-pair-${index}`}
          className="lyric-line-pair"
          ref={isOverallActivePair ? activeLinePairRef : null}
        >
          {pair.translit !== null && (
            <div
              className={`lyric-line-transliteration translit-segment ${pair.isActiveTlit ? "active-translit-segment" : ""}`}
            >
              {renderLineText(pair.translit)}
            </div>
          )}
          {pair.translat !== null && (
            <div
              className={`lyric-line-translation translation-segment ${pair.isActiveTlat ? "active-translation-segment" : ""}`}
            >
              {renderLineText(pair.translat)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="bg-surface/90 backdrop-blur-sm p-3 md:p-6 rounded-xl shadow-xl border border-border current-verse-display-wrapper">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg md:text-2xl font-bold text-primary" style={{ fontFamily: "var(--font-mono)" }}>
          Verse {verse.verseNumber}
        </h2>
        <p className="text-xs text-foreground-subtle">
          {new Date(verse.startTime * 1000).toISOString().substr(14, 5)} -{" "}
          {new Date(verse.endTime * 1000).toISOString().substr(14, 5)}
        </p>
      </div>
      <p className="text-xs text-foreground-muted mb-3">
        {originalLanguageLabel} → {targetLanguage}
      </p>
      <div className="border-b border-border mb-3"></div>

      {panelVisibility.lyrics && (
        <div className="bg-background p-3 md:p-4 rounded-lg shadow-lg mb-4 border border-border">
          <h3
            className="text-sm font-semibold text-secondary mb-2 tracking-wide flex items-center"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <Icon name={isKaraokeMode ? "microphone-stage" : "list-dashes"} weight="bold" className="mr-2" />
            {isKaraokeMode ? "Synced Lyrics" : "Lyrics"}
          </h3>
          <div ref={scrollContainerRef} className="lyrics-scroll-container">
            {renderLyricPairs()}
          </div>
        </div>
      )}

      <VerseDisplayCard
        title="Literal Translation"
        content={verse.literalTranslation}
        language={targetLanguage}
        isVisible={panelVisibility.literalTranslation}
        iconName="translate"
        iconColorClass="text-accent-blue"
      />

      <VerseDisplayCard
        title="Meaning & Context"
        content={verse.meaning}
        language={targetLanguage}
        isVisible={panelVisibility.meaning}
        iconName="lightbulb"
        iconColorClass="text-accent-yellow"
      />
    </div>
  )
}

export default VerseDisplay
