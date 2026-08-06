import { Outlet } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TraceList } from '../features/trace-explorer'

export default function TraceExplorerPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Trace Explorer"
        description="Browse ingested traces and inspect their spans."
      />

      {/* minmax(0,…) on every breakpoint so wide tables scroll inside their
          card instead of blowing out the grid track on mobile */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* list region — real data + offset paging */}
        <TraceList />

        {/* detail panel region — nested route renders here */}
        <Outlet />
      </div>
    </div>
  )
}
