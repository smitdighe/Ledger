import { useState } from 'react'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { formatScore, formatTimestamp, shortId } from '../../../lib/format'
import { pollState } from '../../../lib/pollStatus'
import { useEvals } from '../../../hooks/useEvals'

const PAGE_SIZE = 25

export function EvalResultsTable() {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { data, isLoading, isError, error, refetch, isFetching, failureCount } =
    useEvals({ limit })
  const canLoadMore = (data?.count ?? 0) >= limit
  const feed = pollState({ isError, data, failureCount })

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <span>Eval Results</span>
          {data && <PollIndicator state={feed} />}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">✓</span>}
          message="No eval results yet."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-foreground-muted">
                  <th className="px-3 py-2 font-medium">eval type</th>
                  <th className="px-3 py-2 font-medium">score</th>
                  <th className="px-3 py-2 font-medium">trace</th>
                  <th className="px-3 py-2 font-medium">generator</th>
                  <th className="px-3 py-2 font-medium">drift</th>
                  <th className="px-3 py-2 font-medium">created</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.id} className="border-b border-surface-border/50">
                    <td className="px-3 py-2 text-foreground">{r.eval_type}</td>
                    <td className="px-3 py-2 font-mono">
                      {formatScore(r.score)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground-muted">
                      {shortId(r.trace_id, 12)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground-muted">
                      {r.generator_model ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.drift_flagged ? (
                        <Badge variant="degraded">drift</Badge>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground-muted">
                      {formatTimestamp(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-center border-t border-surface-border pt-4">
            <Button
              disabled={!canLoadMore || isFetching}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              aria-label="Load more eval results"
            >
              {isFetching ? 'Loading…' : canLoadMore ? 'Load more' : 'No more'}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
