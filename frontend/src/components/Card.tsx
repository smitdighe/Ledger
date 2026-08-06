import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface CardProps {
  children?: ReactNode
  /** Optional header slot rendered above the body with a divider. */
  header?: ReactNode
  className?: string
}

export function Card({ children, header, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-surface-border bg-surface-raised text-foreground',
        className,
      )}
    >
      {header != null && (
        <div className="border-b border-surface-border px-4 py-3 text-sm font-medium text-foreground">
          {header}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export default Card
