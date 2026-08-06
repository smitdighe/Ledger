import { z } from 'zod'

/**
 * Health schemas — verified against backend source:
 *   app/api/v1/endpoints/health.py.
 *
 * Four distinct shapes: liveness, per-tier, per-queue, per-db.
 */

/** GET /health — unauthenticated liveness. */
export const livenessSchema = z.object({
  status: z.string(),
  env: z.string(),
})
export type Liveness = z.infer<typeof livenessSchema>

/** One tier in GET /health/tiers `tiers[]`. */
export const tierHealthSchema = z.object({
  tier: z.string(),
  available: z.boolean(),
  cached_health: z.boolean().nullable(),
  last_health_check: z.string().nullable(),
  last_latency_ms: z.number().nullable(),
})
export type TierHealth = z.infer<typeof tierHealthSchema>

/** GET /health/tiers */
export const healthTiersResponseSchema = z.object({
  tiers: z.array(tierHealthSchema),
})
export type HealthTiersResponse = z.infer<typeof healthTiersResponseSchema>

/** Per-worker status in GET /health/queues. */
export const workerStatusSchema = z.object({
  ok: z.boolean(),
  active: z.number(),
  reserved: z.number(),
})
export type WorkerStatus = z.infer<typeof workerStatusSchema>

/** GET /health/queues — Celery backlog + workers. */
export const healthQueuesResponseSchema = z.object({
  // per-queue ready depth; a string like "error: ..." if the broker read failed
  ready_by_queue: z.record(z.string(), z.union([z.number(), z.string()])),
  in_flight: z.object({
    active: z.number(),
    reserved: z.number(),
  }),
  workers: z.record(z.string(), workerStatusSchema),
  worker_count: z.number(),
})
export type HealthQueuesResponse = z.infer<typeof healthQueuesResponseSchema>

/** GET /health/db — Postgres + ClickHouse connectivity. */
export const healthDbResponseSchema = z.object({
  status: z.string(), // "ok" | "degraded"
  // component -> "ok" | "empty" | "error: ..."
  checks: z.record(z.string(), z.string()),
})
export type HealthDbResponse = z.infer<typeof healthDbResponseSchema>

/**
 * Aggregate view name from the assumed spec. The backend does not expose a
 * single combined status object — it's these four separate endpoints. Kept as
 * a union alias for callers that want to talk about "a health status".
 */
export type HealthStatus =
  Liveness | HealthTiersResponse | HealthQueuesResponse | HealthDbResponse
