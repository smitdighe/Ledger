import { useSyncExternalStore } from 'react'

/** Base poll interval from env (ms), with a sane fallback. */
const parsed = Number(import.meta.env.VITE_POLL_INTERVAL_MS)
export const POLL_BASE_MS =
  Number.isFinite(parsed) && parsed > 0 ? parsed : 5000

/**
 * Per-domain cadences. Health/incidents/router change fast → base interval.
 * Evals/golden-set change slowly → slower cadence to spare free-tier limits.
 */
export const POLL = {
  health: POLL_BASE_MS,
  incidentsList: POLL_BASE_MS,
  incidentDetail: POLL_BASE_MS,
  routerConfig: POLL_BASE_MS,
  tracesList: POLL_BASE_MS,
  traceDetail: POLL_BASE_MS,
  evals: POLL_BASE_MS * 4,
  goldenSet: POLL_BASE_MS * 6,
} as const

/** A trace is "in-flight" (worth polling) only if a span ended this recently. */
export const TRACE_RECENT_MS = 2 * 60_000

// --- tab visibility (pause polling when backgrounded) ----------------------
function subscribe(cb: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
function getSnapshot(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

/** True while the tab is foregrounded. */
export function useVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

/**
 * Resolve a poll interval gated by tab visibility. Returns `false` (no polling)
 * when the tab is hidden or the domain-specific `enabled` gate is false.
 */
export function usePollInterval(
  intervalMs: number,
  enabled = true,
): number | false {
  const visible = useVisible()
  return visible && enabled ? intervalMs : false
}
