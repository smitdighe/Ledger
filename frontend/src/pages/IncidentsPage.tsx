import { PageHeader } from '../components/layout/PageHeader'
import { IncidentList } from '../features/incidents'

export default function IncidentsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Incidents"
        description="Diagnostic swarm results and human-review queue."
      />
      <IncidentList />
    </div>
  )
}
