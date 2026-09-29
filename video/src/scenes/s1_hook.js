// 1 HOOK (bars 1-3). Frame 0 is already readable and doubles as the thumbnail.
// A real synthetic trace (seed found by tools/run_scenarios.py): fast, confident, wrong.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F, FX } from '../data.js'
import { textBlock, printChars, lineRects } from '../lib/text.js'
import { paper, breadcrumb, chip, popIn, svgEl, div } from '../lib/ui.js'

export async function build(root, { tl }, sc) {
  const hook = FX('hook_trace')
  const crumb = hook.script.replace(/^backend\//, '').replace(/:.*$/, '')
  const qText = `Q · ${hook.question}`
  const label = `${F('seed.span.generation')} · ${F('seed.attr.completion')}`
  const ctxLabel = `${F('seed.span.retrieval')} · ${F('seed.attr.documents')}`
  const latency = `${hook.generation_latency_ms} ms`
  if (hook.completion !== F('seed.hallucinated')) throw new Error('hook answer drifted from synthetic_qa.py')
  if (hook.retrieved_documents[0] !== F('seed.context')) throw new Error('hook context drifted')

  // two complete compositions: ink (0-5 s) and paper inversion #1 (5-6 s)
  const layers = {}
  for (const inverted of [false, true]) {
    const L = div(root, 'layer')
    L.dataset.layer = inverted ? 'paper' : 'ink'
    paper(L, { inverted })
    const fg = inverted ? C.ink : C.text
    const mut = inverted ? C.paperMuted : C.muted
    const o = { L }
    o.crumb = breadcrumb(L, crumb, { inverted })
    o.q = textBlock(L, { x: X0, k: 4, style: 'data', text: qText, color: fg, name: 'question' })
    o.label = textBlock(L, { x: X0, k: 5, style: 'label', text: label, color: mut, name: 'span-label' })
    o.answer = textBlock(L, {
      x: X0, k: 7, width: X1 - X0, style: 'headline', text: hook.completion, color: fg, name: 'answer',
    })
    o.chip = chip(L, {
      x: X0, k: 17, text: latency, style: 'data', color: fg,
      fill: inverted ? '#d9dde4' : C.panel, border: inverted ? C.paperRule : C.rule, name: 'latency',
    })
    const chipRight = parseFloat(o.chip.style.left) + o.chip.offsetWidth
    o.fast = textBlock(L, { x: chipRight + 30, k: 17, style: 'caption', text: 'Fast.', color: mut, name: 'fast', role: 'caption' })
    const fastRight = parseFloat(o.fast.style.left) + o.fast.offsetWidth
    o.conf = textBlock(L, { x: fastRight + 22, k: 17, style: 'caption', text: 'Confident.', color: mut, name: 'confident', role: 'caption' })
    layers[inverted ? 'paper' : 'ink'] = o
  }

  // --- ink composition --------------------------------------------------------
  const ink = layers.ink
  ink.ctxLabel = textBlock(ink.L, { x: X0, k: 18, style: 'label', text: ctxLabel, color: C.muted, name: 'ctx-label' })
  ink.ctx = textBlock(ink.L, {
    x: X0, k: 19, width: X1 - X0, style: 'datasm', text: hook.retrieved_documents[0], color: C.muted, name: 'context',
  })
  for (const el of [ink.q, ink.ctxLabel, ink.ctx, ink.fast, ink.conf]) el.style.visibility = 'hidden'

  tl.set(ink.L, { autoAlpha: 1 }, sc.start)
  tl.set(layers.paper.L, { autoAlpha: 0 }, sc.start)

  tl.fromTo(ink.q, { autoAlpha: 0, y: -24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'enter' }, cue('hook.q'))
  tl.fromTo(ink.ctxLabel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter' }, cue('hook.ctx'))
  printChars(tl, ink.ctx, cue('hook.ctx') + 0.1, { cps: 80 })
  popIn(tl, ink.chip, cue('hook.chip'))
  tl.fromTo(ink.fast, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'enter' }, cue('hook.fast'))
  tl.fromTo(ink.conf, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'enter' }, cue('hook.confident'))

  // --- paper inversion #1: "Wrong." -----------------------------------------------
  const P = layers.paper
  P.chip.style.visibility = 'visible'
  const wrong = textBlock(P.L, { x: X0 - 8, k: 20, style: 'statement', text: 'Wrong.', color: C.ink, name: 'wrong', role: 'caption' })
  // strike every rendered line of the answer (measured from the line boxes)
  const strikes = svgEl('svg', { width: 1080, height: 1350, viewBox: '0 0 1080 1350' })
  Object.assign(strikes.style, { position: 'absolute', left: 0, top: 0, overflow: 'visible' })
  strikes.dataset.role = 'decor'
  P.L.appendChild(strikes)
  const rects = lineRects(P.answer, root)
  const strikePaths = rects.map((ln, i) => svgEl('path', {
    d: `M${ln.left - 10} ${row(7 + i * 2) - 33} H${ln.right + 10}`, stroke: C.red, 'stroke-width': 11, fill: 'none',
  }, strikes))
  if (Math.abs(parseFloat(P.answer.style.top) - parseFloat(layers.ink.answer.style.top)) > 0.5) {
    throw new Error('answer layers misaligned')
  }

  const tw = cue('hook.wrong')
  tl.set(ink.L, { autoAlpha: 0 }, tw)
  tl.set(P.L, { autoAlpha: 1 }, tw)
  tl.fromTo(strikePaths, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.1, ease: 'none', stagger: 0.02 }, tw)
  tl.set(wrong, { autoAlpha: 1 }, tw)
}
