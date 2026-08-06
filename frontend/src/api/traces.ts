import { apiClient, parse } from './client'
import {
  ingestAcceptedSchema,
  traceDetailSchema,
  traceListResponseSchema,
  type IngestAccepted,
  type TraceDetail,
  type TraceListResponse,
} from '../types/trace'
import type { PageParams } from '../types/api'

export interface ListTracesParams extends PageParams {
  start_time?: string
  end_time?: string
  status?: 'OK' | 'ERROR'
  has_incident?: boolean
}

/** GET /traces — offset-paginated list. */
export async function listTraces(
  params: ListTracesParams = {},
): Promise<TraceListResponse> {
  const { data } = await apiClient.get('/traces', { params })
  return parse(traceListResponseSchema, data, 'listTraces')
}

/** GET /traces/{id} — all spans for a trace. */
export async function getTrace(traceId: string): Promise<TraceDetail> {
  const { data } = await apiClient.get(`/traces/${encodeURIComponent(traceId)}`)
  return parse(traceDetailSchema, data, 'getTrace')
}

export interface IngestOptions {
  toLangfuse?: boolean
  runEval?: boolean
}

/**
 * POST /traces — async OTLP ingestion. Body is a raw OTLP/HTTP payload
 * (protobuf or JSON); pass the matching `contentType`. Requires the ingestion
 * scope.
 */
export async function ingestTraces(
  body: ArrayBuffer | Uint8Array | string,
  contentType: string,
  options: IngestOptions = {},
): Promise<IngestAccepted> {
  const { data } = await apiClient.post('/traces', body, {
    headers: { 'Content-Type': contentType },
    params: {
      to_langfuse: options.toLangfuse ?? true,
      run_eval: options.runEval ?? true,
    },
  })
  return parse(ingestAcceptedSchema, data, 'ingestTraces')
}
