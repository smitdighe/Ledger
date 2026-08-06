import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import { STATUS_HEX } from '../../../lib/constants'

export type SwarmEdgeData = {
  reducedMotion: boolean
  visible: boolean
}
export type SwarmFlowEdge = Edge<SwarmEdgeData>

/**
 * Edge with a flow pulse traveling source→target. Rendered only once the
 * reveal frontier passes it (progressive light-up in trail order).
 * Reduced motion: solid line, no pulse.
 */
export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<SwarmFlowEdge>) {
  if (!data?.visible) return null

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: STATUS_HEX.neutral,
          strokeOpacity: 0.35,
          strokeWidth: 1.5,
        }}
      />
      {!data.reducedMotion && (
        <circle r={3.5} fill={STATUS_HEX.healthy}>
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  )
}
