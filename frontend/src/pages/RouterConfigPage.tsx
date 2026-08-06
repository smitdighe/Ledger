import { PageHeader } from '../components/layout/PageHeader'
import { RouterTierTable, TierCascade } from '../features/router-cascade'

export default function RouterConfigPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Router Config"
        description="4-tier LLM router: priority, enable/disable, and live health."
      />
      <TierCascade />
      <RouterTierTable />
    </div>
  )
}
