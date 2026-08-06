import { type NodeProps } from '@xyflow/react'
import { NodeShell, NodeText } from './NodeShell'
import type { SwarmFlowNode } from './types'

/** Terminal node — remediation action, or the unclassified human-review sink. */
export function RemediationNode({ data }: NodeProps<SwarmFlowNode>) {
  const visible = data.visible
  return (
    <NodeShell
      label={data.label}
      status={data.status}
      reducedMotion={data.reducedMotion}
      visible={visible}
      hasSource={false}
    >
      <NodeText text={data.summary} />
    </NodeShell>
  )
}
