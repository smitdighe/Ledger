import { z } from 'zod'

/**
 * Incident + diagnostic-trail schemas — verified against backend source:
 *   app/api/v1/endpoints/incidents.py, app/agents/_incident.py,
 *   app/agents/state.py, app/db/postgres/models.py.
 *
 * The diagnostic trail models the LangGraph swarm: `write_incident` persists an
 * object with `trail` (per-node entries), `findings`, `classification`, chosen
 * root cause + confidence, and the human-review flag. A manual resolve (PATCH)
 * merges a `resolution` key in.
 */

// --- enums -----------------------------------------------------------------
export const rootCauseSchema = z.enum([
  'retrieval_failure',
  'prompt_regression',
  'model_degradation',
  'index_staleness',
])
export type RootCause = z.infer<typeof rootCauseSchema>

export const incidentStatusSchema = z.enum([
  'open',
  'classifying',
  'remediating',
  'resolved',
  'failed',
])
export type IncidentStatus = z.infer<typeof incidentStatusSchema>

/**
 * Severity is NOT a backend field — incidents carry status +
 * classification_confidence + root_cause only. This is a frontend-derived
 * concept for later UI (badge coloring). Nothing is parsed from a response
 * with this schema; flagged as an assumption.
 */
export const incidentSeveritySchema = z.enum([
  'info',
  'warning',
  'error',
  'critical',
])
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>

// --- diagnostic trail (LangGraph swarm) ------------------------------------
/**
 * Canonical diagnostic node type for graph reconstruction. Backend trail
 * entries use longer node names (e.g. `retrieval_diagnostic`, `human_review`);
 * use `normalizeNodeType` to map raw names to this taxonomy.
 */
export const nodeTypeSchema = z.enum([
  'classifier',
  'retrieval',
  'prompt',
  'model',
  'index',
  'remediation',
  'unclassified',
])
export type NodeType = z.infer<typeof nodeTypeSchema>

const NODE_TYPE_MAP: Record<string, NodeType> = {
  classifier: 'classifier',
  retrieval_diagnostic: 'retrieval',
  prompt_diagnostic: 'prompt',
  model_diagnostic: 'model',
  index_diagnostic: 'index',
  remediation: 'remediation',
  human_review: 'unclassified',
}

/** Map a raw backend node name to the canonical NodeType. */
export function normalizeNodeType(rawNode: string): NodeType {
  return NODE_TYPE_MAP[rawNode] ?? 'unclassified'
}

/** One entry in the trail (app/agents/state.py TrailEntry). */
export const trailEntrySchema = z.object({
  node: z.string(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
})
export type TrailEntry = z.infer<typeof trailEntrySchema>

/** One diagnostic finding (app/agents/state.py Finding). */
export const findingSchema = z.object({
  node: z.string(),
  root_cause_candidate: z.string().nullable(),
  confidence: z.number(),
  supporting_evidence: z.record(z.string(), z.unknown()).default({}),
})
export type Finding = z.infer<typeof findingSchema>

/** Classifier output — known fields plus anything else the node emits. */
export const classificationSchema = z.looseObject({
  candidates: z.array(z.string()).optional(),
  targets: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  ambiguous: z.boolean().optional(),
  retrieval_strength: z.number().optional(),
  generation_strength: z.number().optional(),
  llm_opinion: z.string().nullable().optional(),
})
export type Classification = z.infer<typeof classificationSchema>

/** Human resolution merged in by PATCH /incidents/{id}. */
export const resolutionSchema = z.object({
  note: z.string(),
  status: z.string(),
  at: z.string(),
  by: z.string(),
})
export type Resolution = z.infer<typeof resolutionSchema>

/**
 * Full persisted diagnostic trail object. Every field is defensive: an
 * unclassified incident that went straight to human review has an empty
 * `findings`/`trail` and `needs_human_review: true`.
 */
export const diagnosticTrailSchema = z.looseObject({
  trail: z.array(trailEntrySchema).default([]),
  findings: z.array(findingSchema).default([]),
  classification: classificationSchema.default({}),
  chosen_root_cause: z.string().nullable().default(null),
  chosen_confidence: z.number().default(0),
  needs_human_review: z.boolean().default(false),
  tool_result: z.unknown().nullable().optional(),
  resolution: resolutionSchema.optional(),
})
export type DiagnosticTrail = z.infer<typeof diagnosticTrailSchema>

/** True when the swarm produced no findings — needs human review. */
export function isEmptyTrail(
  trail: DiagnosticTrail | null | undefined,
): boolean {
  if (!trail) return true
  return (trail.findings?.length ?? 0) === 0 && (trail.trail?.length ?? 0) === 0
}

// --- incident records ------------------------------------------------------
/** Item in GET /incidents `incidents[]`. */
export const incidentListItemSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  root_cause: rootCauseSchema.nullable(),
  status: incidentStatusSchema,
  classification_confidence: z.number().nullable(),
  remediation_action: z.string().nullable(),
  created_at: z.string().nullable(),
})
export type IncidentListItem = z.infer<typeof incidentListItemSchema>

/** GET /incidents — count-only list (no offset on this backend). */
export const incidentListResponseSchema = z.object({
  count: z.number(),
  incidents: z.array(incidentListItemSchema),
})
export type IncidentListResponse = z.infer<typeof incidentListResponseSchema>

/** GET /incidents/{id} — detail incl. full diagnostic trail. */
export const incidentDetailSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  root_cause: rootCauseSchema.nullable(),
  status: incidentStatusSchema,
  classification_confidence: z.number().nullable(),
  remediation_action: z.string().nullable(),
  created_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  // JSONB — object in practice; null when never populated.
  diagnostic_trail: diagnosticTrailSchema.nullable(),
})
export type Incident = z.infer<typeof incidentDetailSchema>

/** POST /incidents/trigger result. */
export const incidentTriggerResultSchema = z.object({
  trace_id: z.string(),
  incident_id: z.string().nullable(),
  chosen_root_cause: z.string().nullable(),
  chosen_confidence: z.number().nullable(),
  needs_human_review: z.boolean(),
  remediation_action: z.string().nullable(),
  nodes_ran: z.array(z.string()),
})
export type IncidentTriggerResult = z.infer<typeof incidentTriggerResultSchema>

/** PATCH /incidents/{id} response. */
export const incidentResolveResponseSchema = z.object({
  id: z.string(),
  status: incidentStatusSchema,
  resolved_at: z.string(),
  resolution_note: z.string(),
})
export type IncidentResolveResponse = z.infer<
  typeof incidentResolveResponseSchema
>

// --- request bodies --------------------------------------------------------
/**
 * PATCH /incidents/{id} body — human close-out. `resolution_note` is required
 * (backend enforces min length 3); `status` is a partial choice defaulting to
 * `resolved` server-side.
 */
export const incidentResolveRequestSchema = z.object({
  resolution_note: z.string().min(3),
  status: z.enum(['resolved', 'failed']).optional(),
})
export type IncidentResolveRequest = z.infer<
  typeof incidentResolveRequestSchema
>

/** POST /incidents/trigger body. */
export const incidentTriggerRequestSchema = z.object({
  trace_id: z.string(),
  signal: z.string().optional(),
  use_llm: z.boolean().optional(),
})
export type IncidentTriggerRequest = z.infer<
  typeof incidentTriggerRequestSchema
>
