import { Skeleton } from '../../components/Skeleton'

/**
 * Loading placeholder shaped like the swarm graph: classifier on top, a row
 * of diagnostic nodes, terminal at the bottom, connected by faint rails —
 * plus the replay scrubber strip underneath.
 */
export function SwarmGraphSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="flex h-[320px] flex-col items-center justify-center gap-0 rounded-card border border-surface-border bg-surface sm:h-[440px]">
        {/* classifier */}
        <Skeleton className="h-16 w-48 rounded-card sm:h-20 sm:w-56" />
        <div className="h-8 w-px bg-surface-border/60 sm:h-10" />
        {/* diagnostics row */}
        <div className="flex gap-6">
          <Skeleton className="h-16 w-40 rounded-card sm:h-20 sm:w-56" />
          <Skeleton className="hidden h-16 w-40 rounded-card sm:block sm:h-20 sm:w-56" />
        </div>
        <div className="h-8 w-px bg-surface-border/60 sm:h-10" />
        {/* terminal */}
        <Skeleton className="h-16 w-48 rounded-card sm:h-20 sm:w-56" />
      </div>
      {/* replay scrubber strip */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-8" />
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-1 flex-1" />
      </div>
    </div>
  )
}
