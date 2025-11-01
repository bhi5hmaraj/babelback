import { cn } from '@/lib/utils'
import * as React from 'react'

export type ViewTier = 'basic' | 'advanced' | 'snapshot'

export interface ViewTabsProps {
  active: ViewTier
  onChange: (tier: ViewTier) => void
  className?: string
}

/**
 * Small, dependency-free tabs used by both mobile and desktop.
 * Styling is minimal here; consumers can wrap with theme classes.
 */
export function ViewTabs({ active, onChange, className }: ViewTabsProps) {
  const tiers: ViewTier[] = ['basic', 'advanced', 'snapshot']
  return (
    <div
      data-testid="view-tabs"
      className={cn(
        'inline-flex rounded-full border border-[#c0a080]/60 bg-[#f5efe0]/80 p-0.5 shadow-inner gap-1',
        className,
      )}
    >
      {tiers.map((tier) => (
        <button
          key={tier}
          type="button"
          aria-pressed={active === tier}
          data-active={active === tier || undefined}
          onClick={() => onChange(tier)}
          className={cn(
            'px-4 py-1.5 text-[13px] font-semibold capitalize rounded-full transition',
            active === tier ? 'bg-[#a67c52] text-white shadow-lg' : 'text-[#7d6b56] hover:text-[#4a3f35]'
          )}
        >
          {tier}
        </button>
      ))}
    </div>
  )}

export default ViewTabs
