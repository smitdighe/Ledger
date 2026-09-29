// Reusable pieces: paper, breadcrumb, caption, chip, stamp, meter, packet, logo,
// cursor, focus mask + callouts, terminal strip. All motion goes on the master
// timeline passed in; nothing here animates on its own.
import { gsap } from 'gsap'
import { C, W, H, ROW, RULE, MARGIN_X, X0, X1, row, TYPE } from '../design.js'
import { textBlock, applyType, rich, firstBaseline, revealWords } from './text.js'
import { F } from '../data.js'

const NS = 'http://www.w3.org/2000/svg'
export const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (parent) parent.appendChild(e)
  return e
}
export const div = (parent, cls, style = {}) => {
  const e = document.createElement('div')
  if (cls) e.className = cls
  Object.assign(e.style, style)
  if (parent) parent.appendChild(e)
  return e
}

// --- paper --------------------------------------------------------------------
/** Ruled ledger paper: 2 px rules every 54 px + one red margin rule. */
export function paper(parent, { inverted = false, marginOpacity = 0.22, name } = {}) {
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'paper' })
  Object.assign(s.style, { position: 'absolute', left: 0, top: 0 })
  if (name) s.dataset.name = name
  svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: inverted ? C.paper : C.ink }, s)
  for (let y = ROW; y < H; y += ROW) {
    svgEl('rect', { x: 0, y, width: W, height: RULE, fill: inverted ? C.paperRule : C.rule }, s)
  }
  svgEl('rect', { x: MARGIN_X - 1, y: 0, width: RULE, height: H, fill: C.red, 'fill-opacity': marginOpacity }, s)
  parent.appendChild(s)
  return s
}

/** Ink bands (with the same fixed ruling) that keep moving content out of the HUD rows. */
export function hudPanels(parent, { top = 0, bottom = H } = {}) {
  const bands = []
  for (const [y0, y1] of [[0, top], [bottom, H]]) {
    if (y1 <= y0) continue
    const h = y1 - y0
    const s = svgEl('svg', { width: W, height: h, viewBox: `0 0 ${W} ${h}` })
    Object.assign(s.style, { position: 'absolute', left: 0, top: `${y0}px` })
    s.dataset.role = 'decor'
    svgEl('rect', { x: 0, y: 0, width: W, height: h, fill: C.ink }, s)
    for (let y = ROW; y < H; y += ROW) if (y >= y0 && y < y1) svgEl('rect', { x: 0, y: y - y0, width: W, height: RULE, fill: C.rule }, s)
    svgEl('rect', { x: MARGIN_X - 1, y: 0, width: RULE, height: h, fill: C.red, 'fill-opacity': 0.22 }, s)
    parent.appendChild(s)
    bands.push(s)
  }
  return bands
}

// --- breadcrumb ---------------------------------------------------------------
export function breadcrumb(parent, text, { inverted = false } = {}) {
  return textBlock(parent, {
    x: X0, k: 2, style: 'label', text, color: inverted ? C.paperMuted : C.muted, name: 'breadcrumb',
  })
}

// --- caption (bottom band, rows 20-21) ----------------------------------------
export function caption(parent, lines, { k = 20, color = C.text, inverted = false } = {}) {
  const el = textBlock(parent, {
    x: X0, k, style: 'caption', text: lines.join('\n'), color: inverted ? C.ink : color, role: 'caption',
    name: 'caption',
  })
  el.style.visibility = 'hidden'
  return el
}
export function captionIn(tl, el, t) {
  return revealWords(tl, el, t)
}
export function fadeOut(tl, el, t, dur = 0.3) {
  tl.to(el, { autoAlpha: 0, duration: dur, ease: 'exit' }, t)
}

// --- chip ---------------------------------------------------------------------
/** Rounded data chip whose text baseline sits on row k. */
export function chip(parent, { x, k, text, style = 'label', color = C.text, border = C.rule, fill = C.panel, align = 'left', name, role = 'required', padX = 18 } = {}) {
  const t = TYPE[style]
  const el = div(parent, 'chip', { position: 'absolute', whiteSpace: 'pre' })
  applyType(el, style)
  el.dataset.role = role
  if (name) el.dataset.name = name
  const h = Math.round(t.size * 1.5)
  Object.assign(el.style, {
    color, background: fill, border: `2px solid ${border}`, borderRadius: '10px',
    padding: `0 ${padX}px`, height: `${h}px`, lineHeight: `${h - 4}px`, top: '0px', left: '0px',
  })
  rich(el, text)
  const b = firstBaseline(el)
  const w = el.offsetWidth
  el.style.left = `${align === 'right' ? x - w : x}px`
  el.style.top = `${row(k) - b}px`
  el.dataset.k = k
  el.style.visibility = 'hidden'
  return el
}
export function popIn(tl, el, t, { dur = 0.45, from = { y: 14 } } = {}) {
  tl.fromTo(el, { autoAlpha: 0, ...from }, { autoAlpha: 1, y: 0, x: 0, duration: dur, ease: 'enter' }, t)
}

// --- stamp ----------------------------------------------------------------------
/** Rubber stamp with a real enum string: 2 px border, -3deg, 1-frame overshoot. */
export function stamp(parent, { x, k, text, color, name, align = 'left' }) {
  const el = div(parent, 'stamp', { position: 'absolute', whiteSpace: 'pre' })
  applyType(el, 'stamp')
  el.dataset.role = 'required'
  el.dataset.name = name ?? 'stamp'
  Object.assign(el.style, {
    color, border: `2px solid ${color}`, borderRadius: '6px', padding: '0 20px',
    height: '72px', lineHeight: '68px', background: 'transparent', top: '0px', left: '0px',
  })
  rich(el, text)
  const b = firstBaseline(el)
  const w = el.offsetWidth
  el.style.left = `${align === 'right' ? x - w : x}px`
  el.style.top = `${row(k) - b}px`
  el.style.transformOrigin = '50% 50%'
  el.style.visibility = 'hidden'
  el.dataset.k = k
  return el
}
export function stampIn(tl, el, t) {
  // frame 0: oversized, frame 1: seated. No bounce.
  tl.set(el, { autoAlpha: 1, rotation: -3, scale: 1.12 }, t)
  tl.set(el, { scale: 1 }, t + 1 / 30)
}

// --- meter ----------------------------------------------------------------------
export function meter(parent, { x, k, label, value, width = 300, bad = false, name }) {
  const g = div(parent, 'meter', { position: 'absolute', left: '0px', top: '0px' })
  g.dataset.name = name ?? label
  const lab = textBlock(g, { x, k, style: 'datasm', text: label, color: C.muted })
  const trackX = x + 440
  const track = div(g, 'track', {
    position: 'absolute', left: `${trackX}px`, top: `${row(k) - 22}px`, width: `${width}px`, height: '14px',
    background: C.panel, border: `2px solid ${C.rule}`, borderRadius: '8px', boxSizing: 'border-box',
  })
  const fill = div(track, 'fill', {
    position: 'absolute', left: '0px', top: '0px', bottom: '0px', width: '100%',
    background: C.text, borderRadius: '6px', transformOrigin: '0 50%',
  })
  const num = textBlock(g, {
    x: X1, k, style: 'data', text: value.toFixed(2), color: C.text, align: 'right',
    name: `${name ?? label}.value`,
  })
  num.style.fontVariantNumeric = 'tabular-nums'
  num.dataset.final = value.toFixed(2) // the count-up passes through transient values
  g.style.visibility = 'hidden'
  return { g, lab, track, fill, num, value, bad }
}
export function meterIn(tl, m, t, dur = 1.0) {
  tl.set(m.g, { autoAlpha: 1 }, t)
  tl.fromTo(m.fill, { scaleX: 0 }, { scaleX: m.value, duration: dur, ease: 'move' }, t)
  const proxy = { v: 0 }
  tl.fromTo(proxy, { v: 0 }, {
    v: m.value, duration: dur, ease: 'move',
    onUpdate: () => { m.num.textContent = proxy.v.toFixed(2) },
  }, t)
  // colour carries meaning only once the value has landed; only the (large) bar turns red
  if (m.bad) tl.fromTo(m.fill, { backgroundColor: C.text }, { backgroundColor: C.red, duration: 0 }, t + dur)
}

// --- packet (the trace) -------------------------------------------------------
export function packet(parent, { size = 30, color = C.text } = {}) {
  const s = svgEl('svg', { width: size, height: size, viewBox: '0 0 100 100', class: 'packet' })
  Object.assign(s.style, { position: 'absolute', left: `${-size / 2}px`, top: `${-size / 2}px`, overflow: 'visible' })
  const p = svgEl('path', { d: 'M50 2 L98 50 L50 98 L2 50 Z', fill: color }, s)
  parent.appendChild(s)
  return { el: s, path: p }
}

// --- README ASCII logo, drawn cell by cell ---------------------------------------
// Box-drawing cells rendered as vector strokes in a cell grid (no font involved).
function cellShapes(ch, x, y, cw, chh, color, g) {
  const t = Math.max(1.6, cw * 0.16) // double-line stroke
  const cx = x + cw / 2
  const cy = y + chh / 2
  const o = cw * 0.2 // offset of the two lines of a double stroke
  const line = (x1, y1, x2, y2) => svgEl('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': t, 'stroke-linecap': 'square' }, g)
  switch (ch) {
    case '█':
      svgEl('rect', { x: x - 0.25, y: y - 0.25, width: cw + 0.5, height: chh + 0.5, fill: color }, g)
      break
    case '═':
      line(x, cy - o, x + cw, cy - o); line(x, cy + o, x + cw, cy + o)
      break
    case '║':
      line(cx - o, y, cx - o, y + chh); line(cx + o, y, cx + o, y + chh)
      break
    case '╗': // left + down
      line(x, cy - o, cx + o, cy - o); line(cx + o, cy - o, cx + o, y + chh)
      line(x, cy + o, cx - o, cy + o); line(cx - o, cy + o, cx - o, y + chh)
      break
    case '╔': // right + down
      line(cx - o, cy - o, x + cw, cy - o); line(cx - o, cy - o, cx - o, y + chh)
      line(cx + o, cy + o, x + cw, cy + o); line(cx + o, cy + o, cx + o, y + chh)
      break
    case '╝': // left + up
      line(x, cy + o, cx + o, cy + o); line(cx + o, cy + o, cx + o, y)
      line(x, cy - o, cx - o, cy - o); line(cx - o, cy - o, cx - o, y)
      break
    case '╚': // right + up
      line(cx - o, cy + o, x + cw, cy + o); line(cx - o, cy + o, cx - o, y)
      line(cx + o, cy - o, x + cw, cy - o); line(cx + o, cy - o, cx + o, y)
      break
    default:
      if (ch.trim()) throw new Error(`logo glyph without a drawing: ${ch}`)
  }
}

export function asciiLogo(parent, { x, y, cw, chh, color = C.text, name = 'logo' }) {
  const lines = F('brand.logo')
  const cols = Math.max(...lines.map((l) => [...l].length))
  const s = svgEl('svg', {
    width: cols * cw, height: lines.length * chh, viewBox: `0 0 ${cols * cw} ${lines.length * chh}`, class: 'logo',
  })
  Object.assign(s.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, overflow: 'visible' })
  s.dataset.name = name
  s.dataset.role = 'decor'
  const cells = []
  lines.forEach((ln, r) => {
    ;[...ln].forEach((ch, c) => {
      if (!ch.trim()) return
      const g = svgEl('g', {}, s)
      cellShapes(ch, c * cw, r * chh, cw, chh, color, g)
      cells.push({ g, r, c })
    })
  })
  parent.appendChild(s)
  return { el: s, cells, cols, rows: lines.length, width: cols * cw, height: lines.length * chh }
}
/** Ink the logo in, column-major sweep with a per-cell jitter from the seeded PRNG. */
export function inkLogo(tl, logo, t, dur, rand) {
  tl.set(logo.el, { autoAlpha: 1 }, t)
  const span = dur - 0.12
  for (const cell of logo.cells) {
    const at = t + (cell.c / logo.cols) * span * 0.9 + rand() * span * 0.1
    tl.fromTo(cell.g, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'none' }, at)
  }
}

// --- cursor ---------------------------------------------------------------------
export function cursor(parent) {
  const g = div(parent, 'cursor', { position: 'absolute', left: '0px', top: '0px', width: '0px', height: '0px' })
  g.dataset.role = 'decor'
  const ring = svgEl('svg', { width: 120, height: 120, viewBox: '-60 -60 120 120' })
  Object.assign(ring.style, { position: 'absolute', left: '-60px', top: '-60px', overflow: 'visible' })
  const circle = svgEl('circle', { cx: 0, cy: 0, r: 0, fill: 'none', stroke: C.text, 'stroke-width': 3 }, ring)
  g.appendChild(ring)
  const arrow = svgEl('svg', { width: 44, height: 56, viewBox: '0 0 22 28' })
  Object.assign(arrow.style, { position: 'absolute', left: '-3px', top: '-2px', overflow: 'visible', transformOrigin: '3px 2px' })
  svgEl('path', {
    d: 'M1.5 1.5 L1.5 22 L6.6 17.2 L10.2 25.6 L13.6 24.1 L10 15.9 L17 15.9 Z',
    fill: C.text, stroke: C.ink, 'stroke-width': 1.6, 'stroke-linejoin': 'round',
  }, arrow)
  g.appendChild(arrow)
  g.style.visibility = 'hidden'
  return { el: g, arrow, circle }
}
export function click(tl, cur, t) {
  tl.to(cur.arrow, { scale: 0.9, duration: 0.06, ease: 'none' }, t)
  tl.to(cur.arrow, { scale: 1, duration: 0.14, ease: 'enter' }, t + 0.06)
  tl.fromTo(cur.circle, { attr: { r: 0 }, opacity: 0.9 }, { attr: { r: 40 }, opacity: 0, duration: 0.42, ease: 'enter' }, t)
}

// --- focus mask + callouts ------------------------------------------------------
/** 55 % dim over everything except a rounded cutout. */
export function focusMask(parent, { name = 'mask' } = {}) {
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'mask' })
  Object.assign(s.style, { position: 'absolute', left: 0, top: 0 })
  s.dataset.role = 'decor'
  s.dataset.name = name
  const p = svgEl('path', { fill: C.ink, 'fill-opacity': 0.55, 'fill-rule': 'evenodd' }, s)
  s.style.visibility = 'hidden'
  parent.appendChild(s)
  const pathFor = (r, rad = 18) => {
    const { x, y, w, h } = r
    return `M0 0 H${W} V${H} H0 Z M${x + rad} ${y} H${x + w - rad} Q${x + w} ${y} ${x + w} ${y + rad} ` +
      `V${y + h - rad} Q${x + w} ${y + h} ${x + w - rad} ${y + h} H${x + rad} Q${x} ${y + h} ${x} ${y + h - rad} ` +
      `V${y + rad} Q${x} ${y} ${x + rad} ${y} Z`
  }
  const set = (r, rad) => p.setAttribute('d', pathFor(r, rad))
  return { el: s, path: p, set, pathFor }
}

/** Leader line (2 px, orthogonal) from a target point to a label block. */
export function leader(parent, { from, to, color = C.text, name = 'leader', drop = false }) {
  const s = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` })
  Object.assign(s.style, { position: 'absolute', left: 0, top: 0, overflow: 'visible' })
  s.dataset.role = 'decor'
  s.dataset.name = name
  // drop: straight down onto the top of the label block; otherwise down, then across to its edge
  const d = drop ? `M${from.x} ${from.y} V${to.y}` : `M${from.x} ${from.y} V${to.y} H${to.x}`
  const path = svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 2 }, s)
  svgEl('circle', { cx: from.x, cy: from.y, r: 5, fill: color }, s)
  s.style.visibility = 'hidden'
  parent.appendChild(s)
  return { el: s, path }
}
export function drawIn(tl, svgWrap, path, t, dur = 0.4) {
  tl.set(svgWrap, { autoAlpha: 1 }, t)
  tl.fromTo(path, { drawSVG: '0%' }, { drawSVG: '100%', duration: dur, ease: 'move' }, t)
}

// --- terminal strip (decorative, real structlog lines) ---------------------------
export function terminalStrip(parent, lines, { k0 = 17, rows = 3, name = 'terminal' } = {}) {
  const top = row(k0) - ROW + 12
  const h = rows * TYPE.decor.pitch + 12
  const box = div(parent, 'terminal', {
    position: 'absolute', left: `${X0}px`, top: `${top}px`, width: `${X1 - X0}px`, height: `${h}px`,
    overflow: 'hidden', background: C.panel, borderTop: `2px solid ${C.rule}`, borderBottom: `2px solid ${C.rule}`,
  })
  box.dataset.role = 'decor'
  box.dataset.name = name
  const inner = div(box, 'inner', { position: 'absolute', left: '16px', top: '6px', whiteSpace: 'pre' })
  applyType(inner, 'decor')
  inner.style.color = C.muted
  for (const ln of lines) {
    const d = div(inner, 'tl', { height: `${TYPE.decor.pitch}px` })
    d.textContent = ln
  }
  box.style.visibility = 'hidden'
  return { box, inner, n: lines.length, pitch: TYPE.decor.pitch, rows }
}
/** Stream: line i becomes the newest visible line at times[i]. */
export function streamLines(tl, term, times) {
  tl.set(term.box, { autoAlpha: 1 }, times[0])
  tl.set(term.inner, { y: (term.rows - 1) * term.pitch }, times[0])
  times.forEach((t, i) => {
    if (i === 0) return
    tl.to(term.inner, { y: (term.rows - 1 - i) * term.pitch, duration: 0.18, ease: 'move' }, t)
  })
}
