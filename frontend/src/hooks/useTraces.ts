import { useQuery } from '@tanstack/react-query'
import { listTraces, type ListTracesParams } from '../api/traces'
import type { AppApiError } from '../types/api'
import type { TraceListResponse } from '../types/trace'
import { queryKeys } from './queryKeys'
import { POLL, usePollInterval } from './usePolling'

/** Live paginated trace list (limit + offset). Polled continuously. */
export function useTraces(params: ListTracesParams = {}) {
  const refetchInterval = usePollInterval(POLL.tracesList)
  return useQuery<TraceListResponse, AppApiError>({
    queryKey: queryKeys.traces.list(params),
    queryFn: () => listTraces(params),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}
