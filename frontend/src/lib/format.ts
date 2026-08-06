/** Small display formatters. No business logic. */

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return '—'
  return score.toFixed(3)
}

export function shortId(id: string | null | undefined, head = 8): string {
  if (!id) return '—'
  return id.length > head ? `${id.slice(0, head)}…` : id
}
