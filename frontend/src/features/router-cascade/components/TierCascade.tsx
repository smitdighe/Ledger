import { Card } from '../../../components/Card'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { useRouterConfig } from '../../../hooks/useRouterConfig'
import { pollState } from '../../../lib/pollStatus'
import { TierBadge } from './TierBadge'
import { FallbackAnimation } from './FallbackAnimation'
import { orderCascade } from '../lib/tierState'

const ROW_HEIGHT = 84

export function TierCascade() {
  const reducedMotion = useReducedMotion()
  const { data, isLoading, isError, error, refetch, failureCount } =
    useRouterConfig()

  const ordered = data ? orderCascade(data.tiers) : null
  const target = ordered
    ? ordered.activeIndex >= 0
      ? ordered.activeIndex
      : ordered.ordered.length - 1
    : -1

  const feed = pollState({ isError, data, failureCount })

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <span>Tier Cascade</span>
          {data && <PollIndicator state={feed} />}
        </div>
      }
    >
      {isLoading ? (
        // shaped like the final cascade: left signal rail + stacked tier tiles
        <div className="relative space-y-2 pl-8" aria-hidden="true">
          <div className="absolute bottom-2 left-3 top-2 w-px bg-surface-border" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : isError && !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : !ordered || ordered.ordered.length === 0 ? (
        <p className="text-sm text-foreground-muted">No tiers configured.</p>
      ) : (
        <div
          className="relative pl-8"
          style={{ height: ordered.ordered.length * ROW_HEIGHT }}
        >
          {/* key remounts only on a real status transition, replaying the
              fall exactly once; identical poll ticks keep the instance
              mounted so nothing re-animates */}
          <FallbackAnimation
            key={target}
            count={ordered.ordered.length}
            targetIndex={target}
            rowHeight={ROW_HEIGHT}
            reducedMotion={reducedMotion}
            animate
          />
          {ordered.ordered.map((tier, i) => (
            <div
              key={tier.tier}
              className="flex items-center"
              style={{ height: ROW_HEIGHT }}
            >
              <TierBadge tier={tier} active={i === ordered.activeIndex} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
