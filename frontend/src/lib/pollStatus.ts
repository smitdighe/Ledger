/**
 * Classify a live query's connection health so the UI can show last-known-good
 * data with a "stale" hint on transient poll failures, but escalate to
 * "disconnected" once failures are sustained (rather than showing stale data
 * forever).
 */

export type PollState = 'live' | 'stale' | 'disconnected'

/** Consecutive failed fetches before "stale" becomes "disconnected". */
export const DISCONNECT_THRESHOLD = 3

export interface PollQueryLike {
  isError: boolean
  data: unknown
  failureCount: number
}

export function pollState(q: PollQueryLike): PollState {
  const hasData = q.data != null
  if (q.isError) {
    if (!hasData || q.failureCount >= DISCONNECT_THRESHOLD)
      return 'disconnected'
    return 'stale'
  }
  return 'live'
}

export function isTerminalIncidentStatus(status: string | undefined): boolean {
  return status === 'resolved' || status === 'failed'
}
