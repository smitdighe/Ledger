import { apiClient, parse } from './client'
import {
  healthDbResponseSchema,
  healthQueuesResponseSchema,
  healthTiersResponseSchema,
  livenessSchema,
  type HealthDbResponse,
  type HealthQueuesResponse,
  type HealthTiersResponse,
  type Liveness,
} from '../types/health'

/** GET /health — unauthenticated liveness probe. */
export async function getHealth(): Promise<Liveness> {
  const { data } = await apiClient.get('/health')
  return parse(livenessSchema, data, 'getHealth')
}

/** GET /health/tiers — cached per-tier liveness + latency. */
export async function getHealthTiers(): Promise<HealthTiersResponse> {
  const { data } = await apiClient.get('/health/tiers')
  return parse(healthTiersResponseSchema, data, 'getHealthTiers')
}

/** GET /health/queues — Celery backlog + worker status. */
export async function getHealthQueues(): Promise<HealthQueuesResponse> {
  const { data } = await apiClient.get('/health/queues')
  return parse(healthQueuesResponseSchema, data, 'getHealthQueues')
}

/** GET /health/db — Postgres + ClickHouse connectivity. */
export async function getHealthDb(): Promise<HealthDbResponse> {
  const { data } = await apiClient.get('/health/db')
  return parse(healthDbResponseSchema, data, 'getHealthDb')
}
