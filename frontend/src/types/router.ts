import { z } from 'zod'

/**
 * Router schemas — verified against backend source:
 *   app/api/v1/endpoints/router_config.py, app/router/tiers.py,
 *   app/router/health_check.py.
 *
 * NOTE vs the assumed spec: the config response has no separate `provider`
 * field (provider == tier name here) and no `quality_score`. `role` is a
 * descriptive string, not an enum. Rate-limit state is exposed as rpm/rpd
 * limits, not a live bucket state. Modeled to match reality.
 */

/** cached_health: last probe result, or null when unknown/expired. */
export const cachedHealthSchema = z.boolean().nullable()

/** One tier in GET /router/config `tiers[]`. */
export const routerTierConfigSchema = z.object({
  tier: z.string(),
  role: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
  available: z.boolean(),
  cached_health: cachedHealthSchema,
  last_health_check: z.string().nullable(),
  last_latency_ms: z.number().nullable(),
  rpm: z.number(),
  rpd: z.number().nullable(),
  default_model: z.string(),
})
export type RouterTierConfig = z.infer<typeof routerTierConfigSchema>

/** GET /router/config */
export const routerConfigResponseSchema = z.object({
  tiers: z.array(routerTierConfigSchema),
})
export type RouterConfigResponse = z.infer<typeof routerConfigResponseSchema>

/** One probe result in POST /router/health-check `results[]`. */
export const routerHealthCheckResultSchema = z.object({
  tier: z.string(),
  available: z.boolean(),
  healthy: z.boolean(),
  latency_ms: z.number().nullable(),
})
export type RouterHealthCheckResult = z.infer<
  typeof routerHealthCheckResultSchema
>

/** POST /router/health-check */
export const routerHealthCheckResponseSchema = z.object({
  results: z.array(routerHealthCheckResultSchema),
})
export type RouterHealthCheckResponse = z.infer<
  typeof routerHealthCheckResponseSchema
>

/** PATCH /router/config/{tier_name} response. */
export const tierPatchResponseSchema = z.object({
  tier: z.string(),
  is_enabled: z.boolean(),
  priority_order: z.number(),
})
export type TierPatchResponse = z.infer<typeof tierPatchResponseSchema>

/**
 * PATCH body — partial update only. Backend requires at least one field
 * (422 otherwise); both are optional here and validated at the call site.
 */
export const tierPatchRequestSchema = z.object({
  is_enabled: z.boolean().optional(),
  priority_order: z.number().int().min(1).optional(),
})
export type TierPatchRequest = z.infer<typeof tierPatchRequestSchema>
