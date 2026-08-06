import { z, type ZodError } from 'zod'

type ZodIssues = ZodError['issues']

/**
 * Shared API primitives: backend error envelope, pagination, and the single
 * typed AppApiError surfaced to callers.
 *
 * Verified against backend source (app/core/errors.py): every error response is
 * `{ error, detail, request_id }` plus an `X-Request-ID` response header.
 */

// --- error envelope --------------------------------------------------------
export const apiErrorEnvelopeSchema = z.object({
  // category slug: http_error | validation_error | rate_limited |
  // router_exhausted | internal_error
  error: z.string(),
  // string for most errors; array of FastAPI validation objects for 422
  detail: z.unknown(),
  request_id: z.string().optional(),
})
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>

// --- error taxonomy --------------------------------------------------------
/**
 * Distinguishable failure modes. Later phases (health dashboard, polling) react
 * differently to each — e.g. `network`/`timeout` should retry, `auth` should
 * prompt for a key, `validation` from `client` is a frontend/backend drift bug.
 */
export type ApiErrorKind =
  | 'auth' // 401/403 — missing/invalid key or insufficient scope
  | 'not_found' // 404
  | 'validation' // 422 from server, or client-side zod schema mismatch
  | 'rate_limited' // 429
  | 'client' // other 4xx
  | 'server' // 5xx — backend reachable but erroring
  | 'network' // request sent, no response (offline / connection refused / DNS)
  | 'timeout' // request aborted by a timeout
  | 'unknown'

export interface AppApiErrorInit {
  kind: ApiErrorKind
  message: string
  status?: number | null
  envelope?: ApiErrorEnvelope | null
  requestId?: string | null
  /** For `validation`: whether our schema (`client`) or the server (`server`) rejected. */
  validationSource?: 'client' | 'server'
  /** zod issues when a client-side schema mismatch produced this error. */
  issues?: ZodIssues
  cause?: unknown
}

/** Single typed, catchable error thrown by the entire api/ layer. */
export class AppApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly envelope: ApiErrorEnvelope | null
  readonly requestId: string | null
  readonly validationSource?: 'client' | 'server'
  readonly issues?: ZodIssues

  constructor(init: AppApiErrorInit) {
    super(init.message, init.cause != null ? { cause: init.cause } : undefined)
    this.name = 'AppApiError'
    this.kind = init.kind
    this.status = init.status ?? null
    this.envelope = init.envelope ?? null
    this.requestId = init.requestId ?? null
    this.validationSource = init.validationSource
    this.issues = init.issues
  }

  get isAuth(): boolean {
    return this.kind === 'auth'
  }
  /** No response reached us — offline, connection refused, DNS, or timeout. */
  get isConnectivity(): boolean {
    return this.kind === 'network' || this.kind === 'timeout'
  }
  get isValidation(): boolean {
    return this.kind === 'validation'
  }
  get isRetryable(): boolean {
    return (
      this.isConnectivity ||
      this.kind === 'server' ||
      this.kind === 'rate_limited'
    )
  }
}

export function isAppApiError(e: unknown): e is AppApiError {
  return e instanceof AppApiError
}

// --- pagination ------------------------------------------------------------
/**
 * Outgoing list params. NOTE: the backend is NOT consistent here — only
 * GET /traces honours `offset`; GET /incidents and GET /evals accept `limit`
 * only (no offset, and their responses omit limit/offset). See per-domain
 * response schemas. Kept as one param type so callers pass a uniform shape;
 * `offset` is simply ignored by the endpoints that don't support it.
 */
export interface PageParams {
  limit?: number
  offset?: number
}

/** Envelope for the one endpoint (traces) that returns limit+offset. */
export const offsetPageSchema = z.object({
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
})
export type OffsetPage = z.infer<typeof offsetPageSchema>

/** Envelope for count-only lists (incidents, evals). */
export const countPageSchema = z.object({
  count: z.number(),
})
export type CountPage = z.infer<typeof countPageSchema>
