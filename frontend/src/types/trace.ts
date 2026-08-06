import { z } from 'zod'

/**
 * Trace schemas — verified against backend source:
 *   app/api/v1/endpoints/traces.py, app/ingestion/clickhouse_writer.py.
 *
 * GET /traces/{id} returns spans as the raw ClickHouse column dicts (OTel-shaped).
 * Timestamps come back as ISO strings (FastAPI JSON-encodes the DateTime64).
 */

export const spanStatusSchema = z.enum(['OK', 'ERROR', 'UNSET'])
export type SpanStatus = z.infer<typeof spanStatusSchema>

/** One OTel span as stored/returned (ledger.traces columns). */
export const traceSpanSchema = z.object({
  trace_id: z.string(),
  span_id: z.string(),
  // empty string when the span is a root (backend stores "" not null)
  parent_span_id: z.string(),
  name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  duration_ms: z.number(),
  status: z.string(), // usually SpanStatus, but ClickHouse may hold arbitrary
  attributes: z.record(z.string(), z.string()),
})
export type TraceSpan = z.infer<typeof traceSpanSchema>

/** GET /traces/{id} */
export const traceDetailSchema = z.object({
  trace_id: z.string(),
  span_count: z.number(),
  spans: z.array(traceSpanSchema),
})
export type TraceDetail = z.infer<typeof traceDetailSchema>

/** Item in GET /traces list. */
export const traceListItemSchema = z.object({
  trace_id: z.string(),
  started_at: z.string().nullable(),
  status: z.string(),
  span_count: z.number(),
  has_incident: z.boolean(),
})
export type TraceListItem = z.infer<typeof traceListItemSchema>

/** GET /traces — offset-paginated. */
export const traceListResponseSchema = z.object({
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  traces: z.array(traceListItemSchema),
})
export type TraceListResponse = z.infer<typeof traceListResponseSchema>

/** POST /traces (OTLP ingestion, async). */
export const ingestAcceptedSchema = z.object({
  status: z.string(),
  task_id: z.string(),
  accepted_spans: z.number(),
  traces: z.number(),
  trace_ids: z.array(z.string()),
})
export type IngestAccepted = z.infer<typeof ingestAcceptedSchema>

/** Aggregate Trace = detail alias (a trace IS its spans on this backend). */
export type Trace = TraceDetail
export const traceSchema = traceDetailSchema
