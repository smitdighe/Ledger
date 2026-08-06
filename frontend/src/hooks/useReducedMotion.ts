import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * Detects `prefers-reduced-motion: reduce` and stays in sync with changes.
 * Returns true when the user requests reduced motion.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
