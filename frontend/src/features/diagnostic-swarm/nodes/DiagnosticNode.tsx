import { type NodeProps } from '@xyflow/react'
import { NodeShell, NodeText } from './NodeShell'
import { formatScore } from '../../../lib/format'
import type { SwarmFlowNode } from './types'

export function DiagnosticNode({ data }: NodeProps<SwarmFlowNode>) {
  const visible = data.visible
  return (
    <NodeShell
      label={data.label}
      status={data.status}
      reducedMotion={data.reducedMotion}
      visible={visible}
      highlight={data.isCulprit}
    >
      <div className="space-y-1">
        {data.rootCauseCandidate && (
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-foreground">{data.rootCauseCandidate}</span>
            <span className="text-foreground-muted">
              {formatScore(data.confidence)}
            </span>
          </div>
        )}
        <NodeText text={data.summary} />
      </div>
    </NodeShell>
  )
}
