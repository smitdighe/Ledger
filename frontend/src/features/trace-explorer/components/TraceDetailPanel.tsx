import { useMemo } from 'react'
import { Badge } from '../../../components/Badge'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { formatDurationMs } from '../../../lib/format'
import { CountUpNumber } from '../../../components/CountUpNumber'
import { useTraceDetail } from '../../../hooks/useTraceDetail'
import type { TraceSpan } from '../../../types/trace'

interface SpanNode extends TraceSpan {
  children: SpanNode[]
  depth: number
}

/** Build a parent→child span tree; orphans/roots surface at depth 0. */
function buildTree(spans: TraceSpan[]): SpanNode[] {
  const byId = new Map<string, SpanNode>()
  for (const s of spans) byId.set(s.span_id, { ...s, children: [], depth: 0 })
  const roots: SpanNode[] = []
  for (const node of byId.values()) {
    const parent =
      node.parent_span_id && byId.get(node.parent_span_id)
        ? byId.get(node.parent_span_id)
        : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const assignDepth = (n: SpanNode, d: number) => {
    n.depth = d
    n.children.forEach((c) => assignDepth(c, d + 1))
  }
  roots.forEach((r) => assignDepth(r, 0))
  return roots
}

function flatten(nodes: SpanNode[]): SpanNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)])
}

function spanStatusVariant(status: string): 'healthy' | 'down' | 'neutral' {
  if (status === 'OK') return 'healthy'
  if (status === 'ERROR') return 'down'
  return 'neutral'
}

export function TraceDetailPanel({ traceId }: { traceId: string | undefined }) {
  const { data, isLoading, isError, error, refetch } = useTraceDetail(traceId)

  const rows = useMemo(
    () => (data ? flatten(buildTree(data.spans)) : []),
    [data],
  )

  // trace latency ≈ longest root span duration
  const rootLatencyMs = useMemo(
    () =>
      rows
        .filter((r) => r.depth === 0)
        .reduce((m, r) => Math.max(m, r.duration_ms), 0),
    [rows],
  )

  const header = (
    <span className="font-mono text-xs">
      trace <span className="text-foreground">{traceId ?? '—'}</span>
    </span>
  )

  if (isLoading) {
    // shaped like the final waterfall: staggered indent + shrinking bars
    const stair = [
      { indent: 0, width: 'w-3/4' },
      { indent: 1, width: 'w-2/3' },
      { indent: 2, width: 'w-1/2' },
      { indent: 2, width: 'w-5/12' },
      { indent: 1, width: 'w-7/12' },
      { indent: 3, width: 'w-1/3' },
    ]
    return (
      <Card header={header}>
        <div className="space-y-2" aria-hidden="true">
          {stair.map(({ indent, width }, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{ paddingLeft: `${indent * 16}px` }}
            >
              <Skeleton className={`h-6 ${width}`} />
              <Skeleton className="ml-auto h-4 w-12" />
            </div>
          ))}
        </div>
      </Card>
    )
  }
  if (isError) {
    return (
      <Card header={header}>
        <QueryError error={error} onRetry={() => refetch()} />
      </Card>
    )
  }
  if (!data) {
    return (
      <Card header={header}>
        <EmptyState message="No trace data." />
      </Card>
    )
  }

  return (
    <Card header={header}>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-foreground-muted">
        <span>
          spans{' '}
          <span className="font-mono text-foreground">{data.span_count}</span>
        </span>
        <span className="flex items-center gap-1">
          latency
          <span className="text-foreground">
            <CountUpNumber value={Math.round(rootLatencyMs)} />
          </span>
          ms
        </span>
      </div>

      {/* horizontal scroll on narrow screens so deep indentation can't crush rows */}
      <div className="overflow-x-auto">
        <ul className="min-w-[480px] space-y-1">
          {rows.map((s) => (
            <li
              key={s.span_id}
              style={{ paddingLeft: `${s.depth * 16}px` }}
              className="flex items-center gap-2 border-b border-surface-border/40 py-1.5"
            >
              <span className="text-foreground-muted" aria-hidden="true">
                {s.depth > 0 ? '└' : '▸'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {s.name || '(unnamed span)'}
              </span>
              <span className="font-mono text-xs text-foreground-muted">
                {formatDurationMs(s.duration_ms)}
              </span>
              <Badge variant={spanStatusVariant(s.status)}>{s.status}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
