import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface TypewriterTextProps {
  text: string
  /** Milliseconds between characters. */
  speed?: number
  className?: string
}

/**
 * Reveals a string character by character. Respects prefers-reduced-motion:
 * renders the full string instantly when reduced motion is requested.
 */
export function TypewriterText({
  text,
  speed = 24,
  className,
}: TypewriterTextProps) {
  const reduced = useReducedMotion()
  const [count, setCount] = useState(reduced ? text.length : 0)

  // Reset progress during render when inputs change (React-recommended
  // pattern) so no setState fires synchronously inside the effect.
  const [prevKey, setPrevKey] = useState(`${text}|${reduced}`)
  const key = `${text}|${reduced}`
  if (key !== prevKey) {
    setPrevKey(key)
    setCount(reduced ? text.length : 0)
  }

  useEffect(() => {
    if (reduced) return
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setCount(i)
      if (i >= text.length) window.clearInterval(id)
    }, speed)
    return () => window.clearInterval(id)
  }, [text, speed, reduced])

  return (
    <motion.span className={cn(className)} initial={false} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
    </motion.span>
  )
}

export default TypewriterText
