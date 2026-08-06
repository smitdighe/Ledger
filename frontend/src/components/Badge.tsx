import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { StatusLevel } from '../lib/constants'

interface BadgeProps {
  variant?: StatusLevel
  children?: ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<StatusLevel, string> = {
  healthy: 'bg-status-healthy-muted text-status-healthy',
  degraded: 'bg-status-degraded-muted text-status-degraded',
  down: 'bg-status-down-muted text-status-down',
  critical: 'bg-status-critical-muted text-status-critical',
  neutral: 'bg-status-neutral-muted text-status-neutral',
}

export function Badge({
  variant = 'neutral',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium leading-none',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export default Badge
