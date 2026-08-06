import type { Node } from '@xyflow/react'
import type { SwarmNode } from '../../../lib/buildSwarmGraph'

/** Extra fields injected by SwarmGraph on top of the pure SwarmNode model. */
export type SwarmNodeData = Omit<SwarmNode, 'position' | 'id'> & {
  reducedMotion: boolean
  /** revealed by the replay frontier */
  visible: boolean
}

export type SwarmFlowNode = Node<SwarmNodeData>
