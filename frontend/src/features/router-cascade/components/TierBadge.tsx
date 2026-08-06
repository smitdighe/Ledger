import { Badge } from '../../../components/Badge'
import { cn } from '../../../lib/cn'
import type { RouterTierConfig } from '../../../types/router'
import { tierState, tierStatusToken } from '../lib/tierState'

interface TierBadgeProps {
  tier: RouterTierConfig
  active?: boolean
}

/** Per-tier tile: status, priority, rate-limit (rpm/rpd) — no quality score. */
export function TierBadge({ tier, active = false }: TierBadgeProps) {
  const state = tierState(tier)
  const token = tierStatusToken(state)

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-card border bg-surface-raised px-3 py-2.5',
        active
          ? 'border-status-healthy/60 ring-1 ring-status-healthy/40'
          : 'border-surface-border',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">{tier.tier}</span>
          <Badge variant={token}>{state}</Badge>
          {active && (
            <span className="text-[11px] font-medium text-status-healthy">
              active
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-foreground-muted">
          {tier.role}
        </div>
      </div>

      {/* rate-limit signal (limits only — no live usage counter on backend);
          secondary metadata, hidden on narrow screens to keep tiles readable */}
      <div className="hidden shrink-0 text-right font-mono text-[11px] text-foreground-muted sm:block">
        <div>
          p{tier.priority} · {tier.rpm}rpm
        </div>
        <div>
          {tier.rpd == null ? '∞/day' : `${tier.rpd}/day`}
          {tier.last_latency_ms != null &&
            ` · ${Math.round(tier.last_latency_ms)}ms`}
        </div>
      </div>
    </div>
  )
}
