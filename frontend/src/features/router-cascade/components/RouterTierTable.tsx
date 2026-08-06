import { useState } from 'react'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { AppApiError } from '../../../types/api'
import { formatTimestamp } from '../../../lib/format'
import { pollState } from '../../../lib/pollStatus'
import { useRouterConfig } from '../../../hooks/useRouterConfig'
import {
  usePatchTier,
  useRunHealthCheck,
} from '../../../hooks/useRouterMutations'
import type { RouterTierConfig } from '../../../types/router'

function healthBadge(tier: RouterTierConfig) {
  if (!tier.available) return <Badge variant="neutral">n/a</Badge>
  if (tier.cached_health === true) return <Badge variant="healthy">up</Badge>
  if (tier.cached_health === false) return <Badge variant="down">down</Badge>
  return <Badge variant="neutral">unknown</Badge>
}

interface EditState {
  tierName: string
  is_enabled: boolean
  priority_order: number
}

export function RouterTierTable() {
  const { data, isLoading, isError, error, refetch, failureCount } =
    useRouterConfig()
  const patch = usePatchTier()
  const healthCheck = useRunHealthCheck()
  const [edit, setEdit] = useState<EditState | null>(null)
  const feed = pollState({ isError, data, failureCount })

  const startEdit = (t: RouterTierConfig) =>
    setEdit({
      tierName: t.tier,
      is_enabled: t.enabled,
      priority_order: t.priority,
    })

  const saveEdit = () => {
    if (!edit) return
    patch.mutate(
      {
        tierName: edit.tierName,
        body: {
          is_enabled: edit.is_enabled,
          priority_order: edit.priority_order,
        },
      },
      { onSuccess: () => setEdit(null) },
    )
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Tiers</span>
            {data && <PollIndicator state={feed} />}
          </div>
          <Button
            disabled={healthCheck.isPending}
            onClick={() => healthCheck.mutate()}
            aria-label="Run router health check"
          >
            {healthCheck.isPending ? 'Probing…' : 'Run health check'}
          </Button>
        </div>
      }
    >
      {healthCheck.isError && (
        <p className="mb-2 text-xs text-status-down">
          {healthCheck.error instanceof AppApiError
            ? healthCheck.error.message
            : 'Health check failed.'}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-foreground-muted">
                {[
                  'tier',
                  'role',
                  'priority',
                  'enabled',
                  'available',
                  'health',
                  'last check',
                  'latency',
                  'rpm',
                  'rpd',
                  'model',
                  '',
                ].map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-2 py-2 font-medium"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.tiers.map((t) => {
                const editing = edit?.tierName === t.tier
                return (
                  <tr
                    key={t.tier}
                    className="border-b border-surface-border/50 align-middle"
                  >
                    <td className="px-2 py-2 font-mono text-foreground">
                      {t.tier}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-2 py-2 text-xs text-foreground-muted"
                      title={t.role}
                    >
                      {t.role}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {editing ? (
                        <input
                          type="number"
                          min={1}
                          value={edit.priority_order}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              priority_order: Number(e.target.value),
                            })
                          }
                          aria-label={`Priority for ${edit.tierName}`}
                          className="w-16 rounded border border-surface-border bg-surface px-1 py-0.5"
                        />
                      ) : (
                        t.priority
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editing ? (
                        <input
                          type="checkbox"
                          checked={edit.is_enabled}
                          onChange={(e) =>
                            setEdit({ ...edit, is_enabled: e.target.checked })
                          }
                          aria-label={`Enabled for ${edit.tierName}`}
                        />
                      ) : t.enabled ? (
                        <Badge variant="healthy">on</Badge>
                      ) : (
                        <Badge variant="neutral">off</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {t.available ? (
                        <Badge variant="healthy">yes</Badge>
                      ) : (
                        <Badge variant="neutral">no</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2">{healthBadge(t)}</td>
                    <td className="px-2 py-2 font-mono text-xs text-foreground-muted">
                      {formatTimestamp(t.last_health_check)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {t.last_latency_ms == null
                        ? '—'
                        : `${Math.round(t.last_latency_ms)}ms`}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{t.rpm}</td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {t.rpd ?? '∞'}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-2 py-2 font-mono text-xs text-foreground-muted"
                      title={t.default_model}
                    >
                      {t.default_model}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs">
                      {editing ? (
                        <span className="flex gap-1">
                          <Button
                            variant="accent"
                            size="xs"
                            onClick={saveEdit}
                            disabled={patch.isPending}
                            aria-label={`Save tier ${t.tier}`}
                          >
                            {patch.isPending ? '…' : 'Save'}
                          </Button>
                          <Button
                            size="xs"
                            onClick={() => setEdit(null)}
                            aria-label={`Cancel editing tier ${t.tier}`}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="xs"
                          onClick={() => startEdit(t)}
                          aria-label={`Edit tier ${t.tier}`}
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {patch.isError && (
        <p className="mt-2 text-xs text-status-down">
          {patch.error instanceof AppApiError
            ? patch.error.message
            : 'Edit failed.'}
        </p>
      )}
    </Card>
  )
}
