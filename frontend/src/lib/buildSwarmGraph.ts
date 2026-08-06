import type {
  DiagnosticTrail,
  Finding,
  Incident,
  NodeType,
  TrailEntry,
} from '../types/incident'
import { normalizeNodeType } from '../types/incident'
import { deriveSeverity, severityToStatus } from './deriveSeverity'

export type StatusToken =
  'healthy' | 'degraded' | 'down' | 'critical' | 'neutral'

export interface SwarmNode {
  id: string
  nodeType: NodeType
  label: string
  status: StatusToken
  /** reasoning / output text for the node */
  summary: string
  /** reveal order for progressive animation (0 = classifier, first shown) */
  revealIndex: number
  position: { x: number; y: number }
  /** classifier awaiting classification (empty trail) */
  pending: boolean
  rootCauseCandidate: string | null
  confidence: number | null
  isCulprit: boolean
}

export interface SwarmEdge {
  id: string
  source: string
  target: string
  /** reveal order = target node's revealIndex */
  revealIndex: number
}

export interface SwarmGraphModel {
  nodes: SwarmNode[]
  edges: SwarmEdge[]
  /** total revealable nodes; scrubber goes 1..totalSteps */
  totalSteps: number
}

const DIAGNOSTIC_TYPES: NodeType[] = ['retrieval', 'prompt', 'model', 'index']
const X_SPACING = 260
const Y_CLASSIFIER = 0
const Y_DIAGNOSTIC = 170
const Y_TERMINAL = 340

const LABELS: Record<NodeType, string> = {
  classifier: 'Classifier',
  retrieval: 'Retrieval',
  prompt: 'Prompt',
  model: 'Model',
  index: 'Index',
  remediation: 'Remediation',
  unclassified: 'Human Review',
}

function findingFor(node: string, findings: Finding[]): Finding | undefined {
  return findings.find((f) => f.node === node)
}

/** Diagnostic node status from findings + which root cause was chosen. */
function diagnosticStatus(
  entry: TrailEntry,
  trail: DiagnosticTrail,
): {
  status: StatusToken
  isCulprit: boolean
  candidate: string | null
  confidence: number | null
} {
  const finding = findingFor(entry.node, trail.findings)
  const candidate = finding?.root_cause_candidate ?? null
  const confidence = finding?.confidence ?? null
  const isCulprit =
    trail.chosen_root_cause != null && candidate === trail.chosen_root_cause

  let status: StatusToken = 'neutral'
  if (isCulprit)
    status = 'down' // this branch identified the failure
  else if (candidate != null) status = 'degraded' // ran, produced a suspect
  return { status, isCulprit, candidate, confidence }
}

/** Remediation node status from incident lifecycle + tool result. */
function remediationStatus(incident: Incident): StatusToken {
  if (incident.status === 'resolved') return 'healthy'
  if (incident.status === 'failed') return 'down'
  const tr = incident.diagnostic_trail?.tool_result
  if (tr && typeof tr === 'object' && 'error' in tr && tr.error) return 'down'
  return 'degraded' // remediating / applied but not yet resolved
}

/**
 * Pure transform: Incident (with diagnostic trail) → React-Flow-ready nodes +
 * edges. Topology:
 *   classifier → parallel diagnostics (only those that ran) → terminal
 * where terminal is a remediation node when a confident classification exists,
 * otherwise a distinct "Human Review" (unclassified) node. An empty trail
 * renders just a pending classifier node (no edges).
 */
export function buildSwarmGraph(incident: Incident): SwarmGraphModel {
  const trail = incident.diagnostic_trail
  const entries: TrailEntry[] = trail?.trail ?? []

  // classifier — reuse deriveSeverity so the graph agrees with cards/list.
  const classifierStatus = severityToStatus(deriveSeverity(incident))
  const classifierEntry = entries.find(
    (e) => normalizeNodeType(e.node) === 'classifier',
  )
  const hasAnyEntries = entries.length > 0
  const emptyTrail = !trail || entries.length === 0

  const nodes: SwarmNode[] = []
  const edges: SwarmEdge[] = []

  // --- classifier (always present) ---
  const classifierSummary = emptyTrail
    ? 'Awaiting classification — needs human review.'
    : (classifierEntry?.summary ?? 'Signal classified.')

  // --- diagnostics that actually ran (in trail order) ---
  const diagnosticEntries = entries.filter((e) =>
    DIAGNOSTIC_TYPES.includes(normalizeNodeType(e.node)),
  )

  // --- terminal decision ---
  const remediationEntry = entries.find(
    (e) => normalizeNodeType(e.node) === 'remediation',
  )
  const humanReviewEntry = entries.find(
    (e) => normalizeNodeType(e.node) === 'unclassified',
  )
  const confidentClassification =
    trail != null &&
    trail.chosen_root_cause != null &&
    !trail.needs_human_review

  let terminal: 'remediation' | 'unclassified' | null = null
  if (!emptyTrail) {
    if (remediationEntry && confidentClassification) terminal = 'remediation'
    else if (
      humanReviewEntry ||
      trail?.needs_human_review ||
      !trail?.chosen_root_cause
    )
      terminal = 'unclassified'
    else if (remediationEntry) terminal = 'remediation'
    else if (hasAnyEntries) terminal = 'unclassified'
  }

  // --- positions ---
  const d = diagnosticEntries.length
  const centerX = d > 0 ? ((d - 1) * X_SPACING) / 2 : 0

  // classifier node
  nodes.push({
    id: 'classifier',
    nodeType: 'classifier',
    label: LABELS.classifier,
    status: classifierStatus,
    summary: classifierSummary,
    revealIndex: 0,
    position: { x: centerX, y: Y_CLASSIFIER },
    pending: emptyTrail,
    rootCauseCandidate: trail?.chosen_root_cause ?? incident.root_cause ?? null,
    confidence:
      incident.classification_confidence ?? trail?.chosen_confidence ?? null,
    isCulprit: false,
  })

  // diagnostic nodes
  let reveal = 1
  diagnosticEntries.forEach((entry, i) => {
    const nt = normalizeNodeType(entry.node)
    const { status, isCulprit, candidate, confidence } = diagnosticStatus(
      entry,
      trail as DiagnosticTrail,
    )
    const id = `diag-${entry.node}`
    nodes.push({
      id,
      nodeType: nt,
      label: LABELS[nt],
      status,
      summary: entry.summary,
      revealIndex: reveal,
      position: { x: i * X_SPACING, y: Y_DIAGNOSTIC },
      pending: false,
      rootCauseCandidate: candidate,
      confidence,
      isCulprit,
    })
    edges.push({
      id: `e-classifier-${id}`,
      source: 'classifier',
      target: id,
      revealIndex: reveal,
    })
    reveal += 1
  })

  // terminal node
  if (terminal) {
    const isRemediation = terminal === 'remediation'
    const entry = isRemediation ? remediationEntry : humanReviewEntry
    const status: StatusToken = isRemediation
      ? remediationStatus(incident)
      : 'degraded'
    const id = 'terminal'
    nodes.push({
      id,
      nodeType: isRemediation ? 'remediation' : 'unclassified',
      label: isRemediation ? LABELS.remediation : LABELS.unclassified,
      status,
      summary:
        entry?.summary ??
        (isRemediation
          ? (incident.remediation_action ?? 'Remediation applied.')
          : 'Unclassified — needs human review.'),
      revealIndex: reveal,
      position: { x: centerX, y: Y_TERMINAL },
      pending: false,
      rootCauseCandidate: trail?.chosen_root_cause ?? null,
      confidence: trail?.chosen_confidence ?? null,
      isCulprit: false,
    })
    // converge: every diagnostic → terminal (or classifier → terminal if none)
    if (diagnosticEntries.length === 0) {
      edges.push({
        id: `e-classifier-${id}`,
        source: 'classifier',
        target: id,
        revealIndex: reveal,
      })
    } else {
      diagnosticEntries.forEach((entry2) => {
        edges.push({
          id: `e-diag-${entry2.node}-${id}`,
          source: `diag-${entry2.node}`,
          target: id,
          revealIndex: reveal,
        })
      })
    }
    reveal += 1
  }

  return { nodes, edges, totalSteps: nodes.length }
}
