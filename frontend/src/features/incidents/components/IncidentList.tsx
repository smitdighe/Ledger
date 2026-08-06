import { useState } from 'react'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { pollState } from '../../../lib/pollStatus'
import { useIncidents } from '../../../hooks/useIncidents'
import { IncidentCard } from './IncidentCard'

const PAGE_SIZE = 25

export function IncidentList() {
  // limit-only pagination → grow the limit to load more (no offset)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { data, isLoading, isError, error, refetch, isFetching, failureCount } =
    useIncidents({ limit })

  const canLoadMore = (data?.count ?? 0) >= limit
  const feed = pollState({ isError, data, failureCount })

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <span>Incidents</span>
          {data && <PollIndicator state={feed} />}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : !data || data.incidents.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">△</span>}
          message="No incidents yet."
        />
      ) : (
        <>
          <div className="space-y-2">
            {data.incidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} />
            ))}
          </div>
          <div className="mt-4 flex justify-center border-t border-surface-border pt-4">
            <Button
              disabled={!canLoadMore || isFetching}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              aria-label="Load more incidents"
            >
              {isFetching ? 'Loading…' : canLoadMore ? 'Load more' : 'No more'}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
