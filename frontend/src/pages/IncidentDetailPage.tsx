import { Link, useParams } from 'react-router-dom'
import { buttonClass } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { QueryError } from '../components/QueryError'
import { PageHeader } from '../components/layout/PageHeader'
import { IncidentResolvePanel } from '../features/incidents'
import { SwarmGraph, SwarmGraphSkeleton } from '../features/diagnostic-swarm'
import { useIncidentDetail } from '../hooks/useIncidentDetail'

export default function IncidentDetailPage() {
  const { incidentId } = useParams()
  const { data, isPending, isError, error, refetch } =
    useIncidentDetail(incidentId)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Incident Detail"
        description="Diagnostic swarm trail, root cause, and remediation."
        actions={
          <Link to="/incidents" className={buttonClass('ghost', 'sm')}>
            ← All incidents
          </Link>
        }
      />

      {/* swarm graph — primary view */}
      <Card header="Diagnostic Swarm">
        {!incidentId ? (
          <EmptyState message="No incident id." />
        ) : data ? (
          <SwarmGraph incident={data} />
        ) : isPending ? (
          <SwarmGraphSkeleton />
        ) : isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <EmptyState message="No incident data." />
        )}
      </Card>

      {/* summary + raw trail + resolve */}
      {incidentId && <IncidentResolvePanel incidentId={incidentId} />}
    </div>
  )
}
