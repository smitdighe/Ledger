import type { Variants } from 'framer-motion'

/**
 * Reusable framer-motion variants shared across primitives and future features.
 * Import these instead of redefining variants per component.
 */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
}

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
}

export const pulseGlow: Variants = {
  idle: { opacity: 1, boxShadow: '0 0 0 0 rgba(148, 163, 184, 0)' },
  pulse: {
    opacity: [1, 0.85, 1],
    boxShadow: [
      '0 0 0 0 rgba(148, 163, 184, 0)',
      '0 0 12px 2px rgba(148, 163, 184, 0.35)',
      '0 0 0 0 rgba(148, 163, 184, 0)',
    ],
    transition: { duration: 1.6, ease: 'easeInOut', repeat: Infinity },
  },
}
