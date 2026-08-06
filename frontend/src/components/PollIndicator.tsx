import { cn } from '../lib/cn'
import type { PollState } from '../lib/pollStatus'

const MAP: Record<PollState, { color: string; label: string }> = {
  live: { color: 'bg-status-healthy', label: 'live' },
  stale: { color: 'bg-status-degraded', label: 'stale' },
  disconnected: { color: 'bg-status-down', label: 'disconnected' },
}

/** Tiny dot + label reflecting live/stale/disconnected poll health. */
export function PollIndicator({
  state,
  className,
}: {
  state: PollState
  className?: string
}) {
  const { color, label } = MAP[state]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] text-foreground-muted',
        className,
      )}
      title={`data feed: ${label}`}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', color)}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
