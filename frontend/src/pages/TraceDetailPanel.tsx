import { useParams } from 'react-router-dom'
import { TraceDetailPanel } from '../features/trace-explorer'

/** Route wrapper for /traces/:traceId — renders the feature panel. */
export default function TraceDetailPanelPage() {
  const { traceId } = useParams()
  return <TraceDetailPanel traceId={traceId} />
}
