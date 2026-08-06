import { motion } from 'framer-motion'

interface Props {
  count: number
  /** row the signal comes to rest on (active tier, or last/floor if all down) */
  targetIndex: number
  rowHeight: number
  reducedMotion: boolean
  /** only play the fall-through on an actual status transition, not every poll */
  animate: boolean
}

/**
 * Left-rail signal that falls from the primary tier down to the first usable
 * tier. Only animates when `animate` is true (a real status transition) — a
 * poll tick with unchanged status leaves the dot resting, no re-animation.
 * Bounded: animates exactly `targetIndex` hops once and stops (never loops), so
 * "all down" can't get stuck mid-fall. Reduced motion: placed at target
 * instantly.
 */
export function FallbackAnimation({
  count,
  targetIndex,
  rowHeight,
  reducedMotion,
  animate,
}: Props) {
  const dotY = (i: number) => i * rowHeight + rowHeight / 2
  const target = Math.max(0, Math.min(targetIndex, count - 1))

  const shouldAnimate = animate && !reducedMotion && target > 0

  const keyframes = shouldAnimate
    ? Array.from({ length: target + 1 }, (_, i) => dotY(i))
    : [dotY(target)]

  const times =
    keyframes.length > 1
      ? keyframes.map((_, i) => i / (keyframes.length - 1))
      : undefined

  const duration = shouldAnimate ? Math.min(0.4 * target + 0.3, 2.5) : 0

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 top-0 w-6"
      aria-hidden="true"
    >
      <div className="absolute bottom-2 left-3 top-2 w-px bg-surface-border" />
      <motion.div
        className="absolute left-[7px] h-2.5 w-2.5 rounded-full bg-status-healthy shadow-[0_0_8px_2px_rgba(34,197,94,0.5)]"
        initial={reducedMotion ? false : { top: dotY(0) }}
        animate={{ top: keyframes }}
        transition={
          times ? { duration, times, ease: 'easeInOut' } : { duration }
        }
      />
    </div>
  )
}
