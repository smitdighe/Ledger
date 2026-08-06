import { useState } from 'react'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { AppApiError } from '../../../types/api'
import { formatScore, formatTimestamp, shortId } from '../../../lib/format'
import { deriveSeverity, severityToStatus } from '../../../lib/deriveSeverity'
import { normalizeNodeType } from '../../../types/incident'
import { useIncidentDetail } from '../../../hooks/useIncidentDetail'
import { useResolveIncident } from '../../../hooks/useResolveIncident'
import { incidentStatusVariant } from '../lib/statusVariant'

function ResolveForm({ incidentId }: { incidentId: string }) {
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'resolved' | 'failed'>('resolved')
  const mutation = useResolveIncident(incidentId)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (note.trim().length < 3) return
    mutation.mutate({ resolution_note: note.trim(), status })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (required, min 3 chars)…"
        aria-label="Resolution note"
        rows={3}
        className="w-full rounded border border-surface-border bg-surface p-2 text-sm text-foreground outline-none focus:border-status-neutral"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'resolved' | 'failed')}
          aria-label="Resolution status"
          className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          <option value="resolved">resolved</option>
          <option value="failed">failed</option>
        </select>
        <Button
          type="submit"
          variant="accent"
          size="md"
          disabled={note.trim().length < 3 || mutation.isPending}
        >
          {mutation.isPending ? 'Resolving…' : 'Resolve incident'}
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-status-down">
          {mutation.error instanceof AppApiError
            ? mutation.error.message
            : 'Failed to resolve.'}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="text-xs text-status-healthy">Resolved.</p>
      )}
    </form>
  )
}

export function IncidentResolvePanel({ incidentId }: { incidentId: string }) {
  const { data, isLoading, isError, error, refetch } =
    useIncidentDetail(incidentId)

  if (!data && isLoading) {
    return (
      <Card header="Incident">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </Card>
    )
  }
  if (!data && isError) {
    return (
      <Card header="Incident">
        <QueryError error={error} onRetry={() => refetch()} />
      </Card>
    )
  }
  if (!data) {
    return (
      <Card header="Incident">
        <EmptyState message="No incident data." />
      </Card>
    )
  }

  const severity = deriveSeverity(data)
  const trail = data.diagnostic_trail
  const trailEntries = trail?.trail ?? []
  const findings = trail?.findings ?? []
  const isTerminal = data.status === 'resolved' || data.status === 'failed'

  return (
    <div className="space-y-4">
      {/* summary */}
      <Card header="Summary">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={severityToStatus(severity)}>{severity}</Badge>
          <Badge variant={incidentStatusVariant(data.status)}>
            {data.status}
          </Badge>
          {trail?.needs_human_review && (
            <Badge variant="degraded">needs human review</Badge>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm [&>dd]:break-words">
          <dt className="text-foreground-muted">Root cause</dt>
          {/* mono to match IncidentCard — root cause is a machine slug */}
          <dd className="font-mono text-foreground">
            {data.root_cause ?? 'unclassified'}
          </dd>
          <dt className="text-foreground-muted">Confidence</dt>
          <dd className="font-mono text-foreground">
            {formatScore(data.classification_confidence)}
          </dd>
          <dt className="text-foreground-muted">Remediation</dt>
          <dd className="font-mono text-foreground">
            {data.remediation_action ?? '—'}
          </dd>
          <dt className="text-foreground-muted">Trace</dt>
          <dd className="font-mono text-foreground">
            {shortId(data.trace_id, 16)}
          </dd>
          <dt className="text-foreground-muted">Created</dt>
          <dd className="font-mono text-foreground">
            {formatTimestamp(data.created_at)}
          </dd>
          <dt className="text-foreground-muted">Resolved</dt>
          <dd className="font-mono text-foreground">
            {formatTimestamp(data.resolved_at)}
          </dd>
        </dl>
      </Card>

      {/* raw diagnostic trail — plain list, no graph (Phase 5) */}
      <Card header="Diagnostic Trail (raw)">
        {trailEntries.length === 0 && findings.length === 0 ? (
          <EmptyState message="Empty trail — went straight to human review." />
        ) : (
          <div className="space-y-4">
            {trailEntries.length > 0 && (
              <ol className="space-y-2">
                {trailEntries.map((entry, i) => (
                  <li
                    key={`${entry.node}-${i}`}
                    className="rounded border border-surface-border/60 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">
                        {normalizeNodeType(entry.node)}
                      </Badge>
                      <span className="font-mono text-xs text-foreground-muted">
                        {entry.node}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {entry.summary}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {findings.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-foreground-muted">
                  Findings
                </div>
                <ul className="space-y-1">
                  {findings.map((f, i) => (
                    <li
                      key={`${f.node}-${i}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Badge variant="neutral">
                        {normalizeNodeType(f.node)}
                      </Badge>
                      <span className="text-foreground">
                        {f.root_cause_candidate ?? '—'}
                      </span>
                      <span className="ml-auto font-mono text-xs text-foreground-muted">
                        {formatScore(f.confidence)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* resolve action */}
      <Card header="Resolve">
        {isTerminal ? (
          <p className="text-sm text-foreground-muted">
            Incident already {data.status}
            {trail?.resolution?.note ? `: “${trail.resolution.note}”` : '.'}
          </p>
        ) : (
          <ResolveForm incidentId={incidentId} />
        )}
      </Card>
    </div>
  )
}
