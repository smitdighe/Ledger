import type {
  IncidentStatus,
  RootCause,
  DiagnosticTrail,
} from '../types/incident'
import { isEmptyTrail } from '../types/incident'
import type { IncidentSeverity } from '../types/incident'

/**
 * Severity is NOT a backend field (see Phase 2 findings). Derive it in ONE
 * place from real incident fields so list rows, cards, and the swarm graph all
 * agree. Works from either a list item (status + root_cause + confidence, no
 * trail) or a detail record (with diagnostic_trail).
 */
export interface SeverityInput {
  status: IncidentStatus
  root_cause?: RootCause | null
  classification_confidence?: number | null
  diagnostic_trail?: DiagnosticTrail | null
}

const CONFIDENT = 0.75

export function deriveSeverity(incident: SeverityInput): IncidentSeverity {
  const { status, root_cause, classification_confidence, diagnostic_trail } =
    incident

  if (status === 'resolved') return 'info'
  if (status === 'failed') return 'critical'

  // active: open | classifying | remediating
  const needsHumanReview =
    diagnostic_trail?.needs_human_review ??
    (diagnostic_trail !== undefined
      ? isEmptyTrail(diagnostic_trail)
      : !root_cause)

  if (needsHumanReview || !root_cause) return 'warning'

  const confidence =
    classification_confidence ?? diagnostic_trail?.chosen_confidence ?? 0
  return confidence >= CONFIDENT ? 'error' : 'warning'
}

/** Severity → semantic status token (for Badge variant / coloring). */
export function severityToStatus(
  severity: IncidentSeverity,
): 'healthy' | 'degraded' | 'down' | 'critical' | 'neutral' {
  switch (severity) {
    case 'info':
      return 'neutral'
    case 'warning':
      return 'degraded'
    case 'error':
      return 'down'
    case 'critical':
      return 'critical'
  }
}
