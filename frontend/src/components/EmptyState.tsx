import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  message: ReactNode
  /** Optional action slot (e.g. a button). */
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
    >
      {icon != null && (
        <div className="text-foreground-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="text-sm text-foreground-muted">{message}</div>
      {action != null && <div>{action}</div>}
    </div>
  )
}

export default EmptyState
