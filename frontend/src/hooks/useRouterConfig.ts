import { useQuery } from '@tanstack/react-query'
import { getRouterConfig } from '../api/router'
import type { AppApiError } from '../types/api'
import type { RouterConfigResponse } from '../types/router'
import { queryKeys } from './queryKeys'
import { POLL, usePollInterval } from './usePolling'

/** Live router tier config + cached health (drives the cascade). Polled. */
export function useRouterConfig() {
  const refetchInterval = usePollInterval(POLL.routerConfig)
  return useQuery<RouterConfigResponse, AppApiError>({
    queryKey: queryKeys.router.config,
    queryFn: () => getRouterConfig(),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}
