import { useQuery } from '@tanstack/react-query'
import { getTrace } from '../api/traces'
import type { AppApiError } from '../types/api'
import type { TraceDetail } from '../types/trace'
import { queryKeys } from './queryKeys'
import { POLL, TRACE_RECENT_MS, useVisible } from './usePolling'

function latestSpanEnd(trace: TraceDetail | undefined): number {
  if (!trace) return 0
  let max = 0
  for (const s of trace.spans) {
    const t = Date.parse(s.end_time)
    if (Number.isFinite(t) && t > max) max = t
  }
  return max
}

/**
 * Live single-trace spans. A trace is immutable once written, so only poll
 * while it's still "in-flight" (a span ended within the recency window);
 * historical trace detail doesn't poll. Paused when backgrounded.
 */
export function useTraceDetail(traceId: string | undefined) {
  const visible = useVisible()
  return useQuery<TraceDetail, AppApiError>({
    queryKey: queryKeys.traces.detail(traceId ?? ''),
    queryFn: () => getTrace(traceId as string),
    enabled: Boolean(traceId),
    refetchInterval: (query) => {
      if (!visible) return false
      const data = query.state.data
      if (!data) return false
      const recent = Date.now() - latestSpanEnd(data) < TRACE_RECENT_MS
      return recent ? POLL.traceDetail : false
    },
    refetchIntervalInBackground: false,
  })
}
