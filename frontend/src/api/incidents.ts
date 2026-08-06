import { apiClient, parse } from './client'
import {
  incidentDetailSchema,
  incidentListResponseSchema,
  incidentResolveResponseSchema,
  incidentTriggerResultSchema,
  type Incident,
  type IncidentListResponse,
  type IncidentResolveRequest,
  type IncidentResolveResponse,
  type IncidentStatus,
  type IncidentTriggerRequest,
  type IncidentTriggerResult,
  type RootCause,
} from '../types/incident'

export interface ListIncidentsParams {
  root_cause?: RootCause
  status?: IncidentStatus
  limit?: number
}

/** GET /incidents — count-only list (no offset on this backend). */
export async function listIncidents(
  params: ListIncidentsParams = {},
): Promise<IncidentListResponse> {
  const { data } = await apiClient.get('/incidents', { params })
  return parse(incidentListResponseSchema, data, 'listIncidents')
}

/** GET /incidents/{id} — detail incl. full diagnostic trail. */
export async function getIncident(incidentId: string): Promise<Incident> {
  const { data } = await apiClient.get(
    `/incidents/${encodeURIComponent(incidentId)}`,
  )
  return parse(incidentDetailSchema, data, 'getIncident')
}

/**
 * PATCH /incidents/{id} — human close-out. Partial update: `resolution_note`
 * required, `status` optional (defaults to `resolved` server-side).
 */
export async function resolveIncident(
  incidentId: string,
  body: IncidentResolveRequest,
): Promise<IncidentResolveResponse> {
  const { data } = await apiClient.patch(
    `/incidents/${encodeURIComponent(incidentId)}`,
    body,
  )
  return parse(incidentResolveResponseSchema, data, 'resolveIncident')
}

/** POST /incidents/trigger — run the diagnostic swarm for a trace. */
export async function triggerIncident(
  body: IncidentTriggerRequest,
): Promise<IncidentTriggerResult> {
  const { data } = await apiClient.post('/incidents/trigger', body)
  return parse(incidentTriggerResultSchema, data, 'triggerIncident')
}
