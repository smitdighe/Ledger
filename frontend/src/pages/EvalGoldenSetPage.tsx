import { PageHeader } from '../components/layout/PageHeader'
import { EvalResultsTable, GoldenSetSummary } from '../features/evals'

export default function EvalGoldenSetPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Evals / Golden Set"
        description="Eval results (faithfulness, precision, relevance, drift) and the active golden set."
      />
      <GoldenSetSummary />
      <EvalResultsTable />
    </div>
  )
}
