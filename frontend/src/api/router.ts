import { apiClient, parse } from './client'
import {
  routerConfigResponseSchema,
  routerHealthCheckResponseSchema,
  tierPatchResponseSchema,
  type RouterConfigResponse,
  type RouterHealthCheckResponse,
  type TierPatchRequest,
  type TierPatchResponse,
} from '../types/router'

/** GET /router/config — tier config + live cached health. */
export async function getRouterConfig(): Promise<RouterConfigResponse> {
  const { data } = await apiClient.get('/router/config')
  return parse(routerConfigResponseSchema, data, 'getRouterConfig')
}

/**
 * PATCH /router/config/{tier_name} — partial override. At least one of
 * `is_enabled` / `priority_order` must be set (backend 422s otherwise).
 */
export async function patchTier(
  tierName: string,
  body: TierPatchRequest,
): Promise<TierPatchResponse> {
  const { data } = await apiClient.patch(
    `/router/config/${encodeURIComponent(tierName)}`,
    body,
  )
  return parse(tierPatchResponseSchema, data, 'patchTier')
}

/** POST /router/health-check — probe every provider now. */
export async function runRouterHealthCheck(): Promise<RouterHealthCheckResponse> {
  const { data } = await apiClient.post('/router/health-check')
  return parse(routerHealthCheckResponseSchema, data, 'runRouterHealthCheck')
}
