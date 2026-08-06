import type { HealthTiersResponse, TierHealth } from '../types/health'
import { TIER_NAMES } from './constants'
import type { StatusToken } from './buildSwarmGraph'

/**
 * FRONTEND-SIDE AGGREGATION — the backend exposes no single health-score field.
 * Computed from GET /health/tiers (per-tier `available` + `cached_health`),
 * priority-weighted so the primary tier dominates.
 *
 * Per-tier value:
 *   available && cached_health === true  → 1.0  (up)
 *   available && cached_health === null   → 0.5  (unknown — probe expired/never run)
 *   otherwise                             → 0.0  (down / unavailable)
 *
 * Priority weight = 1 / priority, where priority is the tier's fallback rank.
 * NOTE: /health/tiers carries no `priority`, so rank is taken from the known
 * TIER_NAMES order (cerebras=1 … ollama=4) — a frontend assumption aligned with
 * the router config. Unknown tier names fall to lowest priority.
 *
 *   score = 100 * Σ(weight_i * value_i) / Σ(weight_i)
 *
 * Band thresholds match the semantic status tokens used elsewhere.
 */

export interface HealthScore {
  score: number // 0..100, rounded
  band: StatusToken
  tiersUp: number
  tiersTotal: number
  livenessOk: boolean
}

function tierValue(tier: TierHealth): number {
  if (tier.available && tier.cached_health === true) return 1
  if (tier.available && tier.cached_health === null) return 0.5
  return 0
}

function priorityFor(tierName: string): number {
  const idx = TIER_NAMES.indexOf(tierName as (typeof TIER_NAMES)[number])
  return idx >= 0 ? idx + 1 : TIER_NAMES.length + 1
}

export function scoreBand(score: number): StatusToken {
  if (score >= 80) return 'healthy'
  if (score >= 50) return 'degraded'
  if (score >= 25) return 'down'
  return 'critical'
}

export function computeHealthScore(
  tiers: HealthTiersResponse | undefined,
  livenessOk: boolean,
): HealthScore {
  const list = tiers?.tiers ?? []

  // If the app itself is down, the score is 0 regardless of tier data.
  if (!livenessOk) {
    return {
      score: 0,
      band: 'critical',
      tiersUp: 0,
      tiersTotal: list.length,
      livenessOk,
    }
  }
  if (list.length === 0) {
    return { score: 0, band: 'critical', tiersUp: 0, tiersTotal: 0, livenessOk }
  }

  let weighted = 0
  let weightSum = 0
  let up = 0
  for (const tier of list) {
    const w = 1 / priorityFor(tier.tier)
    const v = tierValue(tier)
    weighted += w * v
    weightSum += w
    if (v === 1) up += 1
  }
  const score = Math.round((100 * weighted) / weightSum)
  return {
    score,
    band: scoreBand(score),
    tiersUp: up,
    tiersTotal: list.length,
    livenessOk,
  }
}
