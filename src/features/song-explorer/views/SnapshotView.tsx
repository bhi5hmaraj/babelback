import * as React from 'react'

export interface SnapshotViewProps {
  title?: string | null
  summary?: string | null
  defaultExpanded?: boolean
  onToggleExpanded?: (expanded: boolean) => void
}

const FALLBACK = 'Upload a track to translate, transliterate, and practice with AI guidance.'

export function SnapshotView({ title, summary, defaultExpanded = false, onToggleExpanded }: SnapshotViewProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const text = (summary && summary.trim()) || FALLBACK
  const short = text.length > 180 ? text.slice(0, 180) + '…' : text

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    onToggleExpanded?.(next)
  }

  return (
    <div data-testid="snapshot-view" className="parchment-card p-4">
      {title && <h3 className="mb-1 text-sm font-semibold">{title}</h3>}
      <p data-testid="snapshot-text" className="text-sm text-[#4a3f35] mobile-serif">
        {expanded ? text : short}
      </p>
      <div className="mt-2">
        <button type="button" onClick={handleToggle} aria-label={expanded ? 'Show less' : 'Show more'}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      </div>
    </div>
  )
}

export default SnapshotView
