import { cn } from '../lib/cn'

interface SkeletonProps {
  className?: string
}

/** Generic pulsing placeholder block. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded bg-surface-border/60 motion-reduce:animate-none',
        // Sensible default size; override via className.
        'h-4 w-full',
        className,
      )}
    />
  )
}

export default Skeleton
