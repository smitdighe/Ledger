// Design system: the app's own tokens (read from facts.json -> tailwind.config.ts),
// a 54 px ledger grid, and a type scale whose line pitches sit on that grid.
import { F } from './data.js'
import { WIDTH, HEIGHT } from './timeline.js'

export const W = WIDTH
export const H = HEIGHT
export const ROW = 54 // ruling pitch; every baseline sits on y = k * ROW
export const RULE = 2 // ruling thickness (px)
export const MARGIN_X = 96 // the single red margin rule
export const X0 = 120 // text starts right of the margin
export const X1 = 1008 // right edge of the safe area
export const SAFE = { left: 72, right: 1008, top: 96, bottom: 1180 }
export const row = (k) => k * ROW

export const C = {}
export function initTokens() {
  Object.assign(C, {
    ink: F('token.surface'), // #0b0e14
    panel: F('token.raised'), // #12161f
    rule: F('token.border'), // #1e2530
    text: F('token.fg'), // #e6e9ef
    muted: F('token.muted'), // #94a3b8
    green: F('token.healthy'), // #22c55e
    amber: F('token.degraded'), // #eab308
    red: F('token.down'), // #ef4444
  })
  // paper inversion: the app's foreground becomes the page, its surface the ink
  C.paper = C.text
  C.paperRule = '#c7ccd6'
  C.paperMuted = '#4a5261' // 5.9:1 on paper
  const s = document.documentElement.style
  for (const [k, v] of Object.entries(C)) s.setProperty(`--${k}`, v)
}

const SANS = '"Geist Variable", sans-serif'
const MONO = '"Geist Mono Variable", monospace'

// size / weight / line pitch / tracking. Pitches are whole multiples of ROW.
export const TYPE = {
  statement: { family: SANS, size: 170, weight: 680, pitch: 162, track: -0.035 },
  headline: { family: SANS, size: 108, weight: 640, pitch: 108, track: -0.035 },
  caption: { family: SANS, size: 50, weight: 560, pitch: 54, track: -0.018 },
  data: { family: MONO, size: 36, weight: 460, pitch: 54, track: 0 },
  datasm: { family: MONO, size: 34, weight: 460, pitch: 54, track: 0 },
  label: { family: MONO, size: 30, weight: 460, pitch: 54, track: 0 },
  stamp: { family: MONO, size: 44, weight: 700, pitch: 54, track: 0.02 },
  url: { family: MONO, size: 48, weight: 520, pitch: 54, track: -0.01 },
  decor: { family: MONO, size: 22, weight: 420, pitch: 30, track: 0 },
}
export const FONT_CHECKS = [
  `680 170px ${SANS}`, `640 108px ${SANS}`, `560 50px ${SANS}`,
  `460 36px ${MONO}`, `700 44px ${MONO}`,
]
