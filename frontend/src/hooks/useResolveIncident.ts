import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveIncident } from '../api/incidents'
import type { AppApiError } from '../types/api'
import type {
  Incident,
  IncidentResolveRequest,
  IncidentResolveResponse,
  IncidentStatus,
} from '../types/incident'
import { queryKeys } from './queryKeys'

/**
 * PATCH /incidents/{id} — manual resolve. Cancels any in-flight poll for this
 * incident first (so a stale refetch can't stomp the result), writes the
 * server-confirmed terminal status into the cache, then invalidates so the
 * detail + list reconcile. Once terminal, detail polling stops on its own.
 */
export function useResolveIncident(incidentId: string) {
  const qc = useQueryClient()
  const detailKey = queryKeys.incidents.detail(incidentId)

  return useMutation<
    IncidentResolveResponse,
    AppApiError,
    IncidentResolveRequest
  >({
    mutationFn: (body) => resolveIncident(incidentId, body),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: detailKey })
    },
    onSuccess: (res) => {
      qc.setQueryData<Incident>(detailKey, (prev) =>
        prev
          ? {
              ...prev,
              status: res.status as IncidentStatus,
              resolved_at: res.resolved_at,
            }
          : prev,
      )
      qc.invalidateQueries({ queryKey: detailKey })
      qc.invalidateQueries({ queryKey: queryKeys.incidents.all })
    },
  })
}
