import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchTier, runRouterHealthCheck } from '../api/router'
import type { AppApiError } from '../types/api'
import type {
  RouterConfigResponse,
  RouterHealthCheckResponse,
  TierPatchRequest,
  TierPatchResponse,
} from '../types/router'
import { queryKeys } from './queryKeys'

interface PatchTierVars {
  tierName: string
  body: TierPatchRequest
}

/**
 * PATCH /router/config/{tier} — edit a tier. Cancels the in-flight config poll,
 * patches the tier optimistically from the server response, then invalidates so
 * a subsequent poll can't briefly show the pre-edit value.
 */
export function usePatchTier() {
  const qc = useQueryClient()
  return useMutation<TierPatchResponse, AppApiError, PatchTierVars>({
    mutationFn: ({ tierName, body }) => patchTier(tierName, body),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.router.config })
    },
    onSuccess: (res) => {
      qc.setQueryData<RouterConfigResponse>(queryKeys.router.config, (prev) =>
        prev
          ? {
              ...prev,
              tiers: prev.tiers.map((t) =>
                t.tier === res.tier
                  ? {
                      ...t,
                      enabled: res.is_enabled,
                      priority: res.priority_order,
                    }
                  : t,
              ),
            }
          : prev,
      )
      qc.invalidateQueries({ queryKey: queryKeys.router.config })
    },
  })
}

/** POST /router/health-check — probe providers; invalidates router config. */
export function useRunHealthCheck() {
  const qc = useQueryClient()
  return useMutation<RouterHealthCheckResponse, AppApiError, void>({
    mutationFn: () => runRouterHealthCheck(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.router.config })
      qc.invalidateQueries({ queryKey: queryKeys.health.tiers })
    },
  })
}
