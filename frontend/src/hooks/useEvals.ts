import { useQuery } from '@tanstack/react-query'
import { listEvals, type ListEvalsParams } from '../api/evals'
import type { AppApiError } from '../types/api'
import type { EvalListResponse } from '../types/eval'
import { queryKeys } from './queryKeys'
import { POLL, usePollInterval } from './usePolling'

/** Live eval results (limit-only). Slower cadence — evals change infrequently. */
export function useEvals(params: ListEvalsParams = {}) {
  const refetchInterval = usePollInterval(POLL.evals)
  return useQuery<EvalListResponse, AppApiError>({
    queryKey: queryKeys.evals.list(params),
    queryFn: () => listEvals(params),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}
