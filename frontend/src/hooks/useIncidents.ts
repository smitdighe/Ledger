import { useQuery } from '@tanstack/react-query'
import { listIncidents, type ListIncidentsParams } from '../api/incidents'
import type { AppApiError } from '../types/api'
import type { IncidentListResponse } from '../types/incident'
import { queryKeys } from './queryKeys'
import { POLL, usePollInterval } from './usePolling'

/** Live incident list (limit-only; grow limit to load more). Polled continuously. */
export function useIncidents(params: ListIncidentsParams = {}) {
  const refetchInterval = usePollInterval(POLL.incidentsList)
  return useQuery<IncidentListResponse, AppApiError>({
    queryKey: queryKeys.incidents.list(params),
    queryFn: () => listIncidents(params),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}
