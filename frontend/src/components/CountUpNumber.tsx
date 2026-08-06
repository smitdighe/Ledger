import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface CountUpNumberProps {
  value: number
  /** Animation duration in seconds. */
  duration?: number
  className?: string
}

/**
 * Animates from the previous value to the new value whenever `value` changes.
 * Monospace + tabular-nums so digits don't shift width. Reduced motion snaps
 * straight to the value.
 */
export function CountUpNumber({
  value,
  duration = 0.6,
  className,
}: CountUpNumberProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  // Snap instantly in render (not in effect) when reduced motion is on.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (reduced) setDisplay(value)
  }

  useEffect(() => {
    if (reduced) {
      fromRef.current = value
      return
    }
    const from = fromRef.current
    if (from === value) return
    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        setDisplay(v)
        fromRef.current = v
      },
    })
    return () => controls.stop()
  }, [value, duration, reduced])

  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {Math.round(display)}
    </span>
  )
}

export default CountUpNumber
