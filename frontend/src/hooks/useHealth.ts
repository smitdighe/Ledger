import { useQuery } from '@tanstack/react-query'
import { getHealth, getHealthTiers } from '../api/health'
import type { AppApiError } from '../types/api'
import type { HealthTiersResponse, Liveness } from '../types/health'
import { queryKeys } from './queryKeys'
import { POLL, usePollInterval } from './usePolling'

/** GET /health — unauthenticated liveness. Polled continuously. */
export function useHealthLiveness() {
  const refetchInterval = usePollInterval(POLL.health)
  return useQuery<Liveness, AppApiError>({
    queryKey: queryKeys.health.liveness,
    queryFn: () => getHealth(),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/** GET /health/tiers — per-tier cached health. Polled continuously. */
export function useHealthTiers() {
  const refetchInterval = usePollInterval(POLL.health)
  return useQuery<HealthTiersResponse, AppApiError>({
    queryKey: queryKeys.health.tiers,
    queryFn: () => getHealthTiers(),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}
