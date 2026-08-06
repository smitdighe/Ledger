import { useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { SURFACE_HEX } from '../../lib/constants'
import { buildSwarmGraph, type StatusToken } from '../../lib/buildSwarmGraph'
import type { NodeType, Incident } from '../../types/incident'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { ClassifierNode } from './nodes/ClassifierNode'
import { DiagnosticNode } from './nodes/DiagnosticNode'
import { RemediationNode } from './nodes/RemediationNode'
import { AnimatedEdge } from './edges/AnimatedEdge'
import { IncidentTrailReplay } from './IncidentTrailReplay'
import { useTrailReplay } from './hooks/useTrailReplay'
import type { SwarmNode, SwarmEdge } from '../../lib/buildSwarmGraph'

const nodeTypes = {
  classifier: ClassifierNode,
  diagnostic: DiagnosticNode,
  remediation: RemediationNode,
}
const edgeTypes = { animated: AnimatedEdge }

function rfType(nt: NodeType): 'classifier' | 'diagnostic' | 'remediation' {
  if (nt === 'classifier') return 'classifier'
  if (nt === 'remediation' || nt === 'unclassified') return 'remediation'
  return 'diagnostic'
}

function toRfNode(n: SwarmNode, reducedMotion: boolean): Node {
  return {
    id: n.id,
    type: rfType(n.nodeType),
    position: n.position,
    width: 224,
    height: 120,
    measured: { width: 224, height: 120 },
    data: {
      label: n.label,
      status: n.status as StatusToken,
      summary: n.summary,
      nodeType: n.nodeType,
      revealIndex: n.revealIndex,
      pending: n.pending,
      rootCauseCandidate: n.rootCauseCandidate,
      confidence: n.confidence,
      isCulprit: n.isCulprit,
      reducedMotion,
      visible: false,
    },
    draggable: false,
    selectable: false,
  }
}

function toRfEdge(e: SwarmEdge, reducedMotion: boolean): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'animated',
    data: { reducedMotion, revealIndex: e.revealIndex, visible: false },
  }
}

/** Keyed wrapper so a *new* incident id fully remounts; same id reconciles. */
export function SwarmGraph({ incident }: { incident: Incident }) {
  return (
    <ReactFlowProvider>
      <SwarmGraphInner key={incident.id} incident={incident} />
    </ReactFlowProvider>
  )
}

function SwarmGraphInner({ incident }: { incident: Incident }) {
  const reducedMotion = useReducedMotion()
  const model = useMemo(() => buildSwarmGraph(incident), [incident])
  const replay = useTrailReplay(model.totalSteps, reducedMotion)
  const { revealed } = replay
  const updateNodeInternals = useUpdateNodeInternals()

  const built = useMemo(
    () => ({
      nodes: model.nodes.map((n) => toRfNode(n, reducedMotion)),
      edges: model.edges.map((e) => toRfEdge(e, reducedMotion)),
    }),
    [model, reducedMotion],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  // --- reconcile: merge the (possibly grown) trail into existing RF state,
  // preserving position + current visibility of nodes that already exist, and
  // adding new nodes/edges (hidden until the reveal frontier reaches them).
  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return built.nodes.map((next) => {
        const ex = byId.get(next.id)
        return ex
          ? {
              ...next,
              position: ex.position,
              data: { ...next.data, visible: ex.data.visible },
            }
          : next
      })
    })
    setEdges((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]))
      return built.edges.map((next) => {
        const ex = byId.get(next.id)
        return ex
          ? {
              ...next,
              data: { ...next.data, visible: ex.data?.visible ?? false },
            }
          : next
      })
    })
    built.nodes.forEach((n) => updateNodeInternals(n.id))
  }, [built, setNodes, setEdges, updateNodeInternals])

  // --- reveal sync: reflect the frontier into node/edge `visible` flags.
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const v = (n.data.revealIndex as number) < revealed
        return n.data.visible === v
          ? n
          : { ...n, data: { ...n.data, visible: v } }
      }),
    )
    setEdges((es) =>
      es.map((e) => {
        const v = (e.data?.revealIndex as number) < revealed
        return e.data?.visible === v
          ? e
          : { ...e, data: { ...e.data, visible: v } }
      }),
    )
  }, [revealed, setNodes, setEdges])

  return (
    <div className="space-y-3">
      <div className="h-[320px] overflow-hidden rounded-card border border-surface-border bg-surface sm:h-[440px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          // touch: pinch-zoom + drag-pan stay on (RF defaults); double-tap
          // zoom off so tapping a node's "more" twice doesn't zoom the canvas
          zoomOnDoubleClick={false}
        >
          <Background color={SURFACE_HEX.border} gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <IncidentTrailReplay replay={replay} />
    </div>
  )
}
