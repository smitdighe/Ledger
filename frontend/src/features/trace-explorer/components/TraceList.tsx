import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { cn } from '../../../lib/cn'
import { formatTimestamp, shortId } from '../../../lib/format'
import { pollState } from '../../../lib/pollStatus'
import { useTraces } from '../../../hooks/useTraces'

const PAGE_SIZE = 25

function statusVariant(status: string): 'healthy' | 'down' | 'neutral' {
  if (status === 'OK') return 'healthy'
  if (status === 'ERROR') return 'down'
  return 'neutral'
}

export function TraceList() {
  const navigate = useNavigate()
  const { traceId: activeId } = useParams()
  const [offset, setOffset] = useState(0)

  const { data, isLoading, isError, error, refetch, isFetching, failureCount } =
    useTraces({ limit: PAGE_SIZE, offset })
  const feed = pollState({ isError, data, failureCount })

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Traces</span>
            {data && <PollIndicator state={feed} />}
          </div>
          <div className="flex items-center gap-1 text-xs text-foreground-muted">
            <Button
              size="xs"
              disabled={offset === 0 || isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              aria-label="Previous page of traces"
            >
              Prev
            </Button>
            <span className="px-1 font-mono">offset {offset}</span>
            <Button
              size="xs"
              disabled={(data?.count ?? 0) < PAGE_SIZE || isFetching}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              aria-label="Next page of traces"
            >
              Next
            </Button>
          </div>
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
      ) : !data || data.traces.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">≣</span>}
          message="No traces found."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-foreground-muted">
                <th className="px-3 py-2 font-medium">trace id</th>
                <th className="px-3 py-2 font-medium">spans</th>
                <th className="px-3 py-2 font-medium">status</th>
                <th className="px-3 py-2 font-medium">incident</th>
                <th className="px-3 py-2 font-medium">started</th>
              </tr>
            </thead>
            <tbody>
              {data.traces.map((t) => (
                <tr
                  key={t.trace_id}
                  onClick={() => navigate(`/traces/${t.trace_id}`)}
                  className={cn(
                    'cursor-pointer border-b border-surface-border/50 hover:bg-surface-border/30',
                    activeId === t.trace_id && 'bg-status-neutral-muted',
                  )}
                >
                  <td className="px-3 py-2 font-mono text-xs text-foreground">
                    {/* real link so the row is keyboard-reachable (row onClick
                        is pointer convenience only) */}
                    <Link
                      to={`/traces/${t.trace_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {shortId(t.trace_id, 16)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono">{t.span_count}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {t.has_incident ? (
                      <Badge variant="degraded">incident</Badge>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground-muted">
                    {formatTimestamp(t.started_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
