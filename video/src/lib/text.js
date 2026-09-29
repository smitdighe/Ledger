// Text on the ledger grid: baseline-snapped blocks, glyphs drawn as SVG (no font
// fallback for ◆ ▶ → ✓ ✕), SplitText word reveals with line masks, mono printing.
import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText.js'
import { TYPE, ROW, row, C } from '../design.js'
import { TYPING } from '../timeline.js'

// --- glyphs -----------------------------------------------------------------
// viewBox 0 0 100 100; drawn to sit on the text baseline like a cap-height glyph.
const GLYPHS = {
  '◆': { w: 0.78, svg: '<path d="M50 4 L96 50 L50 96 L4 50 Z" fill="currentColor"/>' },
  '▶': { w: 0.66, svg: '<path d="M14 8 L92 50 L14 92 Z" fill="currentColor"/>' },
  '→': { w: 0.92, svg: '<path d="M6 50 H86 M58 22 L88 50 L58 78" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="square" stroke-linejoin="miter"/>' },
  '✓': { w: 0.8, svg: '<path d="M10 54 L38 80 L92 18" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter"/>' },
  '✕': { w: 0.72, svg: '<path d="M14 14 L86 86 M86 14 L14 86" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="square"/>' },
}
const GLYPH_RE = /([◆▶→✓✕])/u

export function glyph(ch, scale = 0.72) {
  const g = GLYPHS[ch]
  const s = document.createElement('span')
  s.className = 'g'
  s.dataset.glyph = ch
  // cap-height box, baseline aligned; width tracks the glyph's own proportion
  s.style.cssText = `display:inline-block;width:${(g.w * scale).toFixed(3)}em;height:${scale}em;` +
    'vertical-align:0em;position:relative;'
  s.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">${g.svg}</svg>`
  return s
}

/** Fill `el` with `str`, replacing non-Latin symbols with drawn glyphs. */
export function rich(el, str) {
  el.textContent = ''
  String(str).split('\n').forEach((ln, i) => {
    if (i > 0) el.appendChild(document.createElement('br')) // SplitText keeps <br>, not "\n"
    for (const part of ln.split(GLYPH_RE)) {
      if (!part) continue
      if (GLYPHS[part]) el.appendChild(glyph(part))
      else el.appendChild(document.createTextNode(part))
    }
  })
  return el
}

// --- baseline placement -------------------------------------------------------
export function applyType(el, style) {
  const t = TYPE[style]
  Object.assign(el.style, {
    fontFamily: t.family,
    fontSize: `${t.size}px`,
    fontWeight: String(t.weight),
    lineHeight: `${t.pitch}px`,
    letterSpacing: `${t.track}em`,
  })
  el.dataset.type = style
  return el
}

/** Distance from the block's top edge to the first baseline (measured, font-exact). */
export function firstBaseline(el) {
  const probe = document.createElement('span')
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
  el.insertBefore(probe, el.firstChild)
  const y = probe.offsetTop
  probe.remove()
  return y
}

/**
 * A positioned text block whose first baseline sits on ruling row `k`.
 * opts: { x, k, style, text, color, align:'left'|'right'|'center', width, role, cls, nowrap }
 * role: 'required' (audited: >= 30 px, contrast, safe area) | 'caption' | 'decor'
 */
export function textBlock(parent, o) {
  const el = document.createElement('div')
  el.className = 'tx' + (o.cls ? ' ' + o.cls : '')
  applyType(el, o.style ?? 'data')
  el.style.position = 'absolute'
  el.style.color = o.color ?? C.text
  el.style.whiteSpace = o.nowrap === false ? 'normal' : o.width ? 'normal' : 'pre'
  if (o.width) el.style.width = `${o.width}px`
  if (o.align) el.style.textAlign = o.align
  el.dataset.role = o.role ?? 'required'
  if (o.name) el.dataset.name = o.name
  rich(el, o.text)
  parent.appendChild(el)
  place(el, o)
  return el
}

export function place(el, o) {
  el.style.top = '0px'
  const w = o.width ?? el.offsetWidth
  let x = o.x ?? 120
  if (o.align === 'right') x = x - w
  else if (o.align === 'center') x = x - w / 2
  el.style.left = `${x}px`
  const b = firstBaseline(el)
  el.style.top = `${row(o.k) - b}px`
  el.dataset.k = o.k
  return el
}

// --- reveals ------------------------------------------------------------------
/** SplitText words inside line masks; returns the split. Masks get a little
 *  vertical slack so tight pitches never clip ascenders/descenders. */
export function splitWords(el) {
  const split = SplitText.create(el, { type: 'lines,words', mask: 'lines', linesClass: 'ln', wordsClass: 'wd' })
  // widen each mask with a clip-path instead of padding: zero layout change, so
  // baselines stay on the ruling
  for (const m of split.masks ?? []) {
    m.style.overflow = 'visible'
    m.style.clipPath = 'inset(-0.3em -0.25em -0.34em -0.25em)'
  }
  return split
}

/** Words rise into their line masks, staggered. */
export function revealWords(tl, el, t, { stagger = 0.05, dur = 0.5, ease = 'enter' } = {}) {
  const split = splitWords(el)
  tl.set(el, { autoAlpha: 1 }, t)
  tl.fromTo(split.words, { yPercent: 140 }, { yPercent: 0, duration: dur, ease, stagger }, t)
  return split
}

/** Mono text printing left to right, `cps` characters per second; registers key ticks. */
export function printChars(tl, el, t, { cps = 60, tick = true } = {}) {
  // words first, so wrapping only ever happens between words
  const split = SplitText.create(el, { type: 'words,chars', wordsClass: 'wd', charsClass: 'ch' })
  const chars = split.chars
  tl.set(el, { autoAlpha: 1 }, t)
  tl.fromTo(chars, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0, stagger: 1 / cps }, t)
  if (tick) TYPING.push({ t, chars: chars.length, cps })
  return t + chars.length / cps
}

export const ROWS = (px) => Math.round(px / ROW)

/** One rect per rendered line of a (non-split) text block, in stage coordinates. */
export function lineRects(el, stage) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const origin = stage.getBoundingClientRect()
  const rows = new Map()
  for (const r of range.getClientRects()) {
    if (r.width < 1) continue
    const key = Math.round(r.bottom - origin.top)
    const cur = rows.get(key) ?? { left: Infinity, right: -Infinity, top: r.top - origin.top, bottom: key }
    cur.left = Math.min(cur.left, r.left - origin.left)
    cur.right = Math.max(cur.right, r.right - origin.left)
    rows.set(key, cur)
  }
  return [...rows.values()].sort((a, b) => a.bottom - b.bottom)
}
