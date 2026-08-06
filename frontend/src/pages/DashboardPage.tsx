import { Card } from '../components/Card'
import { PageHeader } from '../components/layout/PageHeader'
import { RecentIncidents } from '../features/incidents'
import { TierCascade } from '../features/router-cascade'
import { HealthGauge } from '../features/health-score'

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Dashboard"
        description="Live health, router tier cascade, and recent incidents."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* health gauge — wired */}
        <Card header="System Health" className="lg:col-span-1">
          <HealthGauge variant="full" />
        </Card>

        {/* tier cascade — wired (renders its own Card) */}
        <div className="lg:col-span-2">
          <TierCascade />
        </div>
      </div>

      {/* recent incidents */}
      <RecentIncidents limit={5} />
    </div>
  )
}
