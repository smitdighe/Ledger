import { z } from 'zod'

/**
 * Eval schemas — verified against backend source:
 *   app/api/v1/endpoints/evals.py, app/eval/runner.py, app/db/postgres/models.py.
 *
 * Two response-side shapes exist:
 *  - EvalResultRow: one persisted metric row (GET /evals list items).
 *  - TraceEvalReport: the aggregate report from a run (POST /evals/run reports[]).
 */

export const evalTypeSchema = z.enum([
  'faithfulness',
  'retrieval_precision',
  'context_recall',
  'answer_relevance',
  'hallucination',
  'drift',
])
export type EvalType = z.infer<typeof evalTypeSchema>

/** One persisted eval metric row — GET /evals `results[]`. */
export const evalResultSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  eval_type: evalTypeSchema,
  score: z.number(),
  judge_model: z.string(),
  generator_model: z.string().nullable(),
  golden_set_version: z.string().nullable(),
  drift_flagged: z.boolean(),
  created_at: z.string().nullable(),
})
export type EvalResult = z.infer<typeof evalResultSchema>

/** GET /evals — count-only list (no offset on this backend). */
export const evalListResponseSchema = z.object({
  count: z.number(),
  results: z.array(evalResultSchema),
})
export type EvalListResponse = z.infer<typeof evalListResponseSchema>

/** Aggregate per-trace report (dataclass asdict) — POST /evals/run `reports[]`. */
export const traceEvalReportSchema = z.object({
  trace_id: z.string(),
  generator_model: z.string().nullable(),
  fault: z.string().nullable(),
  faithfulness: z.number(),
  context_precision: z.number(),
  context_recall: z.number(),
  answer_relevance: z.number(),
  hallucination: z.number(),
  judge_model: z.string(),
  ragas_method: z.string(),
  deepeval_method: z.string(),
})
export type TraceEvalReport = z.infer<typeof traceEvalReportSchema>

/** Per-trace error entry in a run. */
export const evalRunErrorSchema = z.object({
  trace_id: z.string(),
  error: z.string(),
  code: z.number(),
})
export type EvalRunError = z.infer<typeof evalRunErrorSchema>

/** POST /evals/run */
export const evalRunResponseSchema = z.object({
  evaluated: z.number(),
  reports: z.array(traceEvalReportSchema),
  errors: z.array(evalRunErrorSchema),
})
export type EvalRunResponse = z.infer<typeof evalRunResponseSchema>

/** GET /evals/golden-set — summary only (version + count). */
export const goldenSetResponseSchema = z.object({
  active_version: z.string().nullable(),
  entry_count: z.number(),
})
export type GoldenSetResponse = z.infer<typeof goldenSetResponseSchema>

/**
 * Full golden-set entry (DB model GoldenSetEntry). NOT returned by any current
 * endpoint — the golden-set route only exposes version+count. Defined for
 * future use; unverified against a real response.
 */
export const goldenSetEntrySchema = z.object({
  id: z.string(),
  query: z.string(),
  expected_answer: z.string(),
  expected_contexts: z.array(z.string()).nullable(),
  version: z.string(),
  created_at: z.string().nullable(),
})
export type GoldenSetEntry = z.infer<typeof goldenSetEntrySchema>
