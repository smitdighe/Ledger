import { Card } from '../../../components/Card'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { pollState } from '../../../lib/pollStatus'
import { useGoldenSet } from '../../../hooks/useGoldenSet'

/** Golden set exposes only {active_version, entry_count} — no entry table. */
export function GoldenSetSummary() {
  const { data, isLoading, isError, error, refetch, failureCount } =
    useGoldenSet()
  const feed = pollState({ isError, data, failureCount })

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <span>Golden Set</span>
          {data && <PollIndicator state={feed} />}
        </div>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : isError && !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-card border border-surface-border p-4">
            <div className="text-xs uppercase tracking-wide text-foreground-muted">
              Active version
            </div>
            <div className="mt-1 font-mono text-lg text-foreground">
              {data?.active_version ?? '—'}
            </div>
          </div>
          <div className="rounded-card border border-surface-border p-4">
            <div className="text-xs uppercase tracking-wide text-foreground-muted">
              Entry count
            </div>
            <div className="mt-1 font-mono text-lg text-foreground">
              {data?.entry_count ?? '—'}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
