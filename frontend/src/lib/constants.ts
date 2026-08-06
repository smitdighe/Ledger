/**
 * Placeholder constants only — shape future phases will fill in.
 * No real thresholds or business rules yet.
 */

export type StatusLevel =
  'healthy' | 'degraded' | 'down' | 'critical' | 'neutral'

export const STATUS_LEVELS: readonly StatusLevel[] = [
  'healthy',
  'degraded',
  'down',
  'critical',
  'neutral',
] as const

/**
 * Hex mirrors of the Tailwind status/surface tokens for SVG/canvas contexts
 * (gauge arcs, React Flow background, edge strokes) where utility classes
 * don't reach. Keep in sync with tailwind.config.ts.
 */
export const STATUS_HEX: Record<StatusLevel, string> = {
  healthy: '#22c55e',
  degraded: '#eab308',
  down: '#ef4444',
  critical: '#b91c1c',
  neutral: '#94a3b8',
}

export const SURFACE_HEX = {
  base: '#0b0e14',
  raised: '#12161f',
  border: '#1e2530',
} as const

export type SeverityLevel = 'info' | 'warning' | 'error' | 'critical'

export const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  'info',
  'warning',
  'error',
  'critical',
] as const

export type TierName = 'cerebras' | 'groq' | 'gemini' | 'ollama'

export const TIER_NAMES: readonly TierName[] = [
  'cerebras',
  'groq',
  'gemini',
  'ollama',
] as const

/**
 * Status thresholds — placeholder shape, real values arrive in a later phase.
 */
export const STATUS_THRESHOLDS: Record<string, number | null> = {
  latencyDegradedMs: null,
  latencyDownMs: null,
  errorRateDegraded: null,
  errorRateCritical: null,
}
