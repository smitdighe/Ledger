import { apiClient, parse } from './client'
import {
  evalListResponseSchema,
  evalRunResponseSchema,
  goldenSetResponseSchema,
  type EvalListResponse,
  type EvalRunResponse,
  type EvalType,
  type GoldenSetResponse,
} from '../types/eval'

export interface RunEvalsBody {
  trace_id?: string
  trace_ids?: string[]
  golden_version?: string
  persist?: boolean
  force?: boolean
}

/** POST /evals/run — evaluate one or more traces. */
export async function runEvals(body: RunEvalsBody): Promise<EvalRunResponse> {
  const { data } = await apiClient.post('/evals/run', body)
  return parse(evalRunResponseSchema, data, 'runEvals')
}

export interface ListEvalsParams {
  trace_id?: string
  eval_type?: EvalType
  drift?: boolean
  start_time?: string
  end_time?: string
  limit?: number
}

/** GET /evals — count-only list (no offset on this backend). */
export async function listEvals(
  params: ListEvalsParams = {},
): Promise<EvalListResponse> {
  const { data } = await apiClient.get('/evals', { params })
  return parse(evalListResponseSchema, data, 'listEvals')
}

/** GET /evals/golden-set — active version + entry count. */
export async function getGoldenSet(): Promise<GoldenSetResponse> {
  const { data } = await apiClient.get('/evals/golden-set')
  return parse(goldenSetResponseSchema, data, 'getGoldenSet')
}
