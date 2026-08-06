import type { ListTracesParams } from '../api/traces'
import type { ListEvalsParams } from '../api/evals'
import type { ListIncidentsParams } from '../api/incidents'

/** Centralized react-query keys so mutations can invalidate precisely. */
export const queryKeys = {
  traces: {
    all: ['traces'] as const,
    list: (params: ListTracesParams) => ['traces', 'list', params] as const,
    detail: (traceId: string) => ['traces', 'detail', traceId] as const,
  },
  incidents: {
    all: ['incidents'] as const,
    list: (params: ListIncidentsParams) =>
      ['incidents', 'list', params] as const,
    detail: (incidentId: string) =>
      ['incidents', 'detail', incidentId] as const,
  },
  router: {
    config: ['router', 'config'] as const,
  },
  health: {
    liveness: ['health', 'liveness'] as const,
    tiers: ['health', 'tiers'] as const,
  },
  evals: {
    all: ['evals'] as const,
    list: (params: ListEvalsParams) => ['evals', 'list', params] as const,
    goldenSet: ['evals', 'golden-set'] as const,
  },
} as const
