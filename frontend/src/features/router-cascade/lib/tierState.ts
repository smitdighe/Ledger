import type { RouterTierConfig } from '../../../types/router'
import type { StatusToken } from '../../../lib/buildSwarmGraph'

export type TierState = 'up' | 'down' | 'unknown' | 'disabled' | 'unavailable'

/** Derive a tier's state from real fields (enabled/available/cached_health). */
export function tierState(t: RouterTierConfig): TierState {
  if (!t.enabled) return 'disabled'
  if (!t.available) return 'unavailable'
  if (t.cached_health === true) return 'up'
  if (t.cached_health === false) return 'down'
  return 'unknown' // probe expired / never run
}

export function tierStatusToken(state: TierState): StatusToken {
  switch (state) {
    case 'up':
      return 'healthy'
    case 'down':
      return 'down'
    case 'unknown':
      return 'degraded'
    case 'disabled':
    case 'unavailable':
      return 'neutral'
  }
}

/** A tier can serve traffic if enabled, available, and not a failed probe. */
export function isUsable(t: RouterTierConfig): boolean {
  const s = tierState(t)
  return s === 'up' || s === 'unknown'
}

/** Tiers sorted by fallback order (priority asc), + the active (first usable). */
export function orderCascade(tiers: RouterTierConfig[]): {
  ordered: RouterTierConfig[]
  activeIndex: number // -1 when none usable (all down)
} {
  const ordered = [...tiers].sort((a, b) => a.priority - b.priority)
  const activeIndex = ordered.findIndex(isUsable)
  return { ordered, activeIndex }
}
