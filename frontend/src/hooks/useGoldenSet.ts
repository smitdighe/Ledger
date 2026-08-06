import { useQuery } from '@tanstack/react-query'
import { getGoldenSet } from '../api/evals'
import type { AppApiError } from '../types/api'
import type { GoldenSetResponse } from '../types/eval'
import { queryKeys } from './queryKeys'
import { POLL, usePollInterval } from './usePolling'

/** Active golden-set version + entry count. Slowest cadence (rarely changes). */
export function useGoldenSet() {
  const refetchInterval = usePollInterval(POLL.goldenSet)
  return useQuery<GoldenSetResponse, AppApiError>({
    queryKey: queryKeys.evals.goldenSet,
    queryFn: () => getGoldenSet(),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}
