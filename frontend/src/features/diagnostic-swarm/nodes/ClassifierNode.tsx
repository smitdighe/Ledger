import { type NodeProps } from '@xyflow/react'
import { TypewriterText } from '../../../components/TypewriterText'
import { NodeShell, NodeText } from './NodeShell'
import type { SwarmFlowNode } from './types'

export function ClassifierNode({ data }: NodeProps<SwarmFlowNode>) {
  const visible = data.visible
  return (
    <NodeShell
      label={data.label}
      status={data.status}
      reducedMotion={data.reducedMotion}
      visible={visible}
      hasTarget={false}
    >
      {data.pending ? (
        <p className="text-xs text-foreground-muted">{data.summary}</p>
      ) : (
        <div className="space-y-1">
          {data.rootCauseCandidate && (
            <div className="font-mono text-xs text-foreground">
              <TypewriterText text={data.rootCauseCandidate} />
            </div>
          )}
          <NodeText text={data.summary} />
        </div>
      )}
    </NodeShell>
  )
}
