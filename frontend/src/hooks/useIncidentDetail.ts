import { useQuery } from '@tanstack/react-query'
import { getIncident } from '../api/incidents'
import type { AppApiError } from '../types/api'
import type { Incident } from '../types/incident'
import { isTerminalIncidentStatus } from '../lib/pollStatus'
import { queryKeys } from './queryKeys'
import { POLL, useVisible } from './usePolling'

/**
 * Live single incident incl. diagnostic trail. Polls only while the incident is
 * non-terminal (trail still being appended); stops once resolved/failed so a
 * finished incident isn't hammered. Also paused while the tab is backgrounded.
 */
export function useIncidentDetail(incidentId: string | undefined) {
  const visible = useVisible()
  return useQuery<Incident, AppApiError>({
    queryKey: queryKeys.incidents.detail(incidentId ?? ''),
    queryFn: () => getIncident(incidentId as string),
    enabled: Boolean(incidentId),
    refetchInterval: (query) => {
      if (!visible) return false
      const status = query.state.data?.status
      return isTerminalIncidentStatus(status) ? false : POLL.incidentDetail
    },
    refetchIntervalInBackground: false,
  })
}
