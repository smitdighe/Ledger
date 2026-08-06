import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { z } from 'zod'
import {
  AppApiError,
  apiErrorEnvelopeSchema,
  type ApiErrorEnvelope,
  type ApiErrorKind,
} from '../types/api'

/**
 * Header the backend expects for API-key auth (app/core/security.py:
 * `Header(alias="X-API-Key")`). Single constant so a scheme change is one edit.
 */
export const API_KEY_HEADER = 'X-API-Key'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? ''
const apiKey = import.meta.env.VITE_API_KEY ?? ''
const isDev = import.meta.env.DEV

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${baseURL.replace(/\/$/, '')}/api/v1`,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// --- request: inject API key + dev logging ---------------------------------
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (apiKey) config.headers.set(API_KEY_HEADER, apiKey)
  if (isDev) {
    console.debug(
      `[api] → ${config.method?.toUpperCase()} ${config.baseURL ?? ''}${config.url ?? ''}`,
      config.params ?? {},
    )
  }
  return config
})

// --- response: dev logging + typed error normalization ---------------------
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (isDev) {
      console.debug(
        `[api] ← ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url ?? ''}`,
      )
    }
    return response
  },
  (error: unknown) => Promise.reject(normalizeError(error)),
)

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not_found'
  if (status === 422) return 'validation'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  if (status >= 400) return 'client'
  return 'unknown'
}

/** Convert any axios/unknown failure into the single AppApiError type. */
function normalizeError(error: unknown): AppApiError {
  if (error instanceof AppApiError) return error

  if (error instanceof AxiosError) {
    // 1. Server responded with a status — reachable backend, HTTP error.
    if (error.response) {
      const { status, data, headers } = error.response
      const parsed = apiErrorEnvelopeSchema.safeParse(data)
      const envelope: ApiErrorEnvelope | null = parsed.success
        ? parsed.data
        : null
      const requestId =
        envelope?.request_id ??
        (typeof headers?.['x-request-id'] === 'string'
          ? headers['x-request-id']
          : null)
      const kind = kindForStatus(status)
      const detailMsg =
        typeof envelope?.detail === 'string'
          ? envelope.detail
          : (envelope?.error ?? error.message)
      return new AppApiError({
        kind,
        message: `[${status}] ${detailMsg}`,
        status,
        envelope,
        requestId,
        validationSource: kind === 'validation' ? 'server' : undefined,
        cause: error,
      })
    }

    // 2. Request was made but no response — connectivity, distinguishable.
    if (error.request) {
      const timedOut =
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      return new AppApiError({
        kind: timedOut ? 'timeout' : 'network',
        message: timedOut
          ? 'request timed out (no response)'
          : 'network error — backend unreachable',
        status: null,
        cause: error,
      })
    }
  }

  // 3. Something else (config error, thrown non-axios).
  return new AppApiError({
    kind: 'unknown',
    message: error instanceof Error ? error.message : 'unknown API error',
    cause: error,
  })
}

/**
 * Validate a response body at the api/ boundary. Throws a typed, catchable
 * AppApiError (kind `validation`, source `client`) on schema mismatch so a
 * backend contract drift never leaks unvalidated data into the app.
 */
export function parse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string,
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    if (isDev) {
      console.error(`[api] schema mismatch (${context})`, result.error.issues)
    }
    throw new AppApiError({
      kind: 'validation',
      validationSource: 'client',
      message: `response validation failed for ${context}`,
      issues: result.error.issues,
      cause: result.error,
    })
  }
  return result.data
}
