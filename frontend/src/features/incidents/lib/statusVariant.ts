import type { IncidentStatus } from '../../../types/incident'

/** Incident lifecycle status → semantic Badge variant. */
export function incidentStatusVariant(
  status: IncidentStatus,
): 'healthy' | 'degraded' | 'down' | 'critical' | 'neutral' {
  switch (status) {
    case 'resolved':
      return 'healthy'
    case 'remediating':
    case 'classifying':
      return 'degraded'
    case 'failed':
      return 'down'
    case 'open':
      return 'neutral'
  }
}
