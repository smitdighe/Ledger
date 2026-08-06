import { useNavigate } from 'react-router-dom'
import { Badge } from '../../../components/Badge'
import { TypewriterText } from '../../../components/TypewriterText'
import { cn } from '../../../lib/cn'
import { formatTimestamp, shortId } from '../../../lib/format'
import { deriveSeverity, severityToStatus } from '../../../lib/deriveSeverity'
import type { IncidentListItem } from '../../../types/incident'
import { incidentStatusVariant } from '../lib/statusVariant'

interface IncidentCardProps {
  incident: IncidentListItem
  className?: string
}

/** Compact incident summary — used in the list and the Dashboard slot. */
export function IncidentCard({ incident, className }: IncidentCardProps) {
  const navigate = useNavigate()
  const severity = deriveSeverity(incident)

  return (
    <button
      type="button"
      onClick={() => navigate(`/incidents/${incident.id}`)}
      className={cn(
        'w-full rounded-card border border-surface-border bg-surface-raised p-3 text-left transition-colors hover:border-status-neutral/50',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Badge variant={severityToStatus(severity)}>{severity}</Badge>
        <Badge variant={incidentStatusVariant(incident.status)}>
          {incident.status}
        </Badge>
        <span className="ml-auto font-mono text-xs text-foreground-muted">
          {formatTimestamp(incident.created_at)}
        </span>
      </div>

      <div className="mt-2 font-mono text-sm text-foreground">
        {incident.root_cause ? (
          <TypewriterText text={incident.root_cause} />
        ) : (
          <span className="font-sans text-foreground-muted">
            unclassified — needs review
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-3 text-xs text-foreground-muted">
        <span className="font-mono">
          trace {shortId(incident.trace_id, 12)}
        </span>
        {incident.remediation_action && (
          <span className="font-mono">{incident.remediation_action}</span>
        )}
      </div>
    </button>
  )
}
