import { useCallback, useEffect, useRef, useState } from 'react'

const STEP_MS = 750

export interface TrailReplay {
  /** number of nodes revealed; node visible when its revealIndex < revealed */
  revealed: number
  total: number
  isPlaying: boolean
  reducedMotion: boolean
  play: () => void
  pause: () => void
  step: () => void
  stepBack: () => void
  reset: () => void
  seek: (n: number) => void
}

/**
 * Single source of truth for progressive trail reveal. Drives both the
 * on-load auto-animation and the manual scrubber (IncidentTrailReplay) so
 * play-state / graph-state / reduced-motion can never disagree.
 *
 * Reduced motion: starts fully revealed, never auto-plays, controls disabled.
 */
export function useTrailReplay(
  total: number,
  reducedMotion: boolean,
): TrailReplay {
  const minRevealed = Math.min(1, total)
  const [revealed, setRevealed] = useState(() =>
    reducedMotion ? total : minRevealed,
  )
  const [isPlaying, setIsPlaying] = useState(() => !reducedMotion && total > 1)

  // React to the trail growing/shrinking between polls, adjusting during render
  // (React's blessed "adjust state when a prop changes" pattern — no effect).
  const [prevTotal, setPrevTotal] = useState(total)
  if (total !== prevTotal) {
    const prev = prevTotal
    setPrevTotal(total)
    setRevealed((r) => {
      if (total < prev) return Math.min(r, total)
      // total grew: reveal new entries only if idle at the old end; if
      // mid-playback / parked mid-trail, keep `revealed` put (queue) so the
      // scrubber isn't yanked — new nodes stay hidden until the frontier reaches.
      if (reducedMotion) return total
      if (!isPlaying && r >= prev) return total
      return r
    })
  }

  // mirror revealed into a ref so the interval can read it without re-subscribing
  const revealedRef = useRef(revealed)
  useEffect(() => {
    revealedRef.current = revealed
  }, [revealed])

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      if (revealedRef.current >= total) {
        setIsPlaying(false) // interval callback, not effect body — safe, bounded
        return
      }
      setRevealed((r) => Math.min(r + 1, total))
    }, STEP_MS)
    return () => clearInterval(id)
  }, [isPlaying, total])

  const play = useCallback(() => {
    if (reducedMotion || total <= 1) return
    // restart from the top if we're already at the end
    setRevealed((r) => (r >= total ? minRevealed : r))
    setIsPlaying(true)
  }, [reducedMotion, total, minRevealed])

  const pause = useCallback(() => setIsPlaying(false), [])
  const step = useCallback(() => {
    setIsPlaying(false)
    setRevealed((r) => Math.min(r + 1, total))
  }, [total])
  const stepBack = useCallback(() => {
    setIsPlaying(false)
    setRevealed((r) => Math.max(r - 1, minRevealed))
  }, [minRevealed])
  const reset = useCallback(() => {
    setIsPlaying(false)
    setRevealed(minRevealed)
  }, [minRevealed])
  const seek = useCallback(
    (n: number) => {
      setIsPlaying(false)
      setRevealed(Math.max(minRevealed, Math.min(n, total)))
    },
    [minRevealed, total],
  )

  return {
    revealed,
    total,
    isPlaying,
    reducedMotion,
    play,
    pause,
    step,
    stepBack,
    reset,
    seek,
  }
}
