import { useState, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Badge } from '../../../components/Badge'
import { cn } from '../../../lib/cn'
import type { StatusToken } from '../../../lib/buildSwarmGraph'

const BORDER: Record<StatusToken, string> = {
  healthy: 'border-status-healthy',
  degraded: 'border-status-degraded',
  down: 'border-status-down',
  critical: 'border-status-critical',
  neutral: 'border-surface-border',
}

interface NodeShellProps {
  label: string
  status: StatusToken
  reducedMotion: boolean
  /** revealed by the replay frontier — fades/scales in via CSS when true */
  visible: boolean
  hasTarget?: boolean
  hasSource?: boolean
  highlight?: boolean
  children?: ReactNode
}

/** Expandable text block — truncates long reasoning, never overflows the node. */
export function NodeText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > 90
  return (
    <div className="text-xs text-foreground-muted">
      <p className={cn(!expanded && 'line-clamp-2')}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[11px] text-foreground/70 underline-offset-2 hover:underline"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  )
}

export function NodeShell({
  label,
  status,
  reducedMotion,
  visible,
  hasTarget = true,
  hasSource = true,
  highlight = false,
  children,
}: NodeShellProps) {
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.9)',
        // visibility (not just opacity) so hidden nodes drop out of the tab
        // order and accessibility tree — their inner buttons must not focus
        visibility: visible ? 'visible' : 'hidden',
        transition: reducedMotion
          ? 'none'
          : 'opacity 0.25s ease-out, transform 0.25s ease-out, visibility 0.25s',
      }}
      className={cn(
        'w-56 rounded-card border bg-surface-raised p-3 shadow-sm',
        BORDER[status],
        highlight && 'ring-2 ring-status-down/60',
        !visible && 'pointer-events-none',
      )}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-surface-border"
        />
      )}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Badge variant={status}>{status}</Badge>
      </div>
      {children}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-surface-border"
        />
      )}
    </div>
  )
}
