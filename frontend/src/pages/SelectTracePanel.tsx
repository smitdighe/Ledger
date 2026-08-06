import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'

/** Shown at /traces (no trace selected). */
export default function SelectTracePanel() {
  return (
    <Card header="Trace Detail">
      <EmptyState
        icon={<span className="text-2xl">←</span>}
        message="Select a trace to inspect its span waterfall."
      />
    </Card>
  )
}
