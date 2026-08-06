import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { PollIndicator } from '../../../components/PollIndicator'
import { QueryError } from '../../../components/QueryError'
import { Skeleton } from '../../../components/Skeleton'
import { pollState } from '../../../lib/pollStatus'
import { useIncidents } from '../../../hooks/useIncidents'
import { IncidentCard } from './IncidentCard'

/** Dashboard "recent incidents" slot — small fixed-size list. */
export function RecentIncidents({ limit = 5 }: { limit?: number }) {
  const { data, isLoading, isError, error, refetch, failureCount } =
    useIncidents({ limit })
  const feed = pollState({ isError, data, failureCount })

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <span>Recent Incidents</span>
          {data && <PollIndicator state={feed} />}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : !data || data.incidents.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">∅</span>}
          message="No incidents to show yet."
        />
      ) : (
        <div className="space-y-2">
          {data.incidents.map((inc) => (
            <IncidentCard key={inc.id} incident={inc} />
          ))}
        </div>
      )}
    </Card>
  )
}
