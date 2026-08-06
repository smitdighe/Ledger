import type { ReactNode } from 'react'
import { AppApiError } from '../types/api'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface QueryErrorProps {
  error: unknown
  onRetry?: () => void
}

/** Human-readable messaging by AppApiError kind (Phase 2 taxonomy). */
function describe(error: unknown): { icon: ReactNode; message: string } {
  if (error instanceof AppApiError) {
    switch (error.kind) {
      case 'auth':
        return {
          icon: '🔒',
          message: 'Not authorized — check the API key (VITE_API_KEY).',
        }
      case 'network':
        return {
          icon: '⚡',
          message: 'Backend unreachable — the API server may be down.',
        }
      case 'timeout':
        return {
          icon: '⏱',
          message: 'Request timed out — the backend did not respond.',
        }
      case 'validation':
        return {
          icon: '⚠',
          message:
            error.validationSource === 'client'
              ? 'Response did not match the expected schema (backend contract drift).'
              : 'The request was rejected as invalid.',
        }
      case 'not_found':
        return { icon: '∅', message: 'Not found.' }
      case 'rate_limited':
        return { icon: '⛔', message: 'Rate limited — try again shortly.' }
      case 'server':
        return { icon: '✖', message: 'The backend returned a server error.' }
      default:
        return { icon: '✖', message: error.message || 'Request failed.' }
    }
  }
  return { icon: '✖', message: 'Unexpected error.' }
}

export function QueryError({ error, onRetry }: QueryErrorProps) {
  const { icon, message } = describe(error)
  return (
    <EmptyState
      icon={<span className="text-2xl">{icon}</span>}
      message={message}
      action={
        onRetry && (
          <Button size="md" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  )
}
