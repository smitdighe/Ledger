// 2 PROBLEM (bars 4-6). The author's line, over scenario B's real faithfulness
// history: 10 x 0.90 before the v2 prompt, 10 x 0.25 after, the rolling-window mean
// landing on the real 0.575 under the drift floor.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F, FX, f2, f3, factSource } from '../data.js'
import { textBlock, revealWords } from '../lib/text.js'
import { paper, breadcrumb, stamp, stampIn, svgEl } from '../lib/ui.js'

const fileOf = (id) => factSource(id).replace(/^backend\//, '').replace(/:.*$/, '')

export async function build(root, ctx, sc) {
  const { tl } = ctx
  const B = FX('scenario_B')
  const hist = B.faithfulness_history.map((h) => h.score)
  const base = F('drift.baseline.faithfulness')
  const thr = F('drift.threshold')
  const floor = F('drift.floor.faithfulness')
  const mean = B.drift.window_mean
  if (hist.length !== F('drift.window')) throw new Error('history is not one drift window')
  if (Math.abs(hist.reduce((a, b) => a + b, 0) / hist.length - mean) > 1e-9) throw new Error('mean mismatch')

  paper(root)
  breadcrumb(root, fileOf('drift.fn'))
  const s1 = textBlock(root, {
    x: X0, k: 4, style: 'caption', color: C.muted, role: 'caption', name: 'slower',
    text: F('voice.slower').replace('tell you ', 'tell you\n'),
  })
  const s2 = textBlock(root, {
    x: X0 - 4, k: 7, style: 'headline', color: C.text, role: 'caption', name: 'dumber',
    text: F('voice.dumber').replace('none ', 'none\n').replace('why ', 'why\n'),
  })
  s1.style.visibility = 'hidden'
  s2.style.visibility = 'hidden'

  // underline "dumber."
  const ul = svgEl('svg', { width: 1080, height: 1350, viewBox: '0 0 1080 1350' })
  Object.assign(ul.style, { position: 'absolute', left: 0, top: 0 })
  ul.dataset.role = 'decor'
  root.appendChild(ul)
  const dumberX = (() => {
    // the word "dumber." starts after "it got "; measure it with a range on the text node
    const node = [...s2.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('dumber'))
    const i = node.textContent.lastIndexOf('dumber')
    const r = document.createRange()
    r.setStart(node, i)
    r.setEnd(node, node.textContent.length)
    const b = r.getBoundingClientRect()
    const o = root.getBoundingClientRect()
    return { l: b.left - o.left, r: b.right - o.left }
  })()
  const ulPath = svgEl('path', {
    d: `M${dumberX.l} ${row(11) + 16} H${dumberX.r}`, stroke: C.red, 'stroke-width': 10, fill: 'none',
  }, ul)

  // --- chart: one drift window ------------------------------------------------------
  const cx0 = X0 + 16
  const cx1 = X1 - 176
  const y0 = row(19) // score 0
  const y1 = row(13) // score 1
  const ys = (v) => y0 - v * (y0 - y1)
  const xs = (i) => cx0 + (i / (hist.length - 1)) * (cx1 - cx0)
  const ch = svgEl('svg', { width: 1080, height: 1350, viewBox: '0 0 1080 1350' })
  Object.assign(ch.style, { position: 'absolute', left: 0, top: 0 })
  ch.dataset.role = 'decor'
  root.appendChild(ch)
  const baseLine = svgEl('path', { d: `M${cx0} ${ys(base)} H${cx1 + 10}`, stroke: C.muted, 'stroke-width': 2, 'stroke-dasharray': '10 8', fill: 'none' }, ch)
  const floorLine = svgEl('path', { d: `M${cx0} ${ys(floor)} H${cx1 + 10}`, stroke: C.red, 'stroke-width': 3, fill: 'none' }, ch)
  const meanLine = svgEl('path', { d: `M${cx0} ${ys(mean)} H${cx1 + 10}`, stroke: C.text, 'stroke-width': 4, fill: 'none' }, ch)
  const dots = hist.map((v, i) => {
    const s = 11
    return svgEl('path', {
      d: `M${xs(i)} ${ys(v) - s} L${xs(i) + s} ${ys(v)} L${xs(i)} ${ys(v) + s} L${xs(i) - s} ${ys(v)} Z`,
      fill: v < floor ? C.red : C.muted,
    }, ch)
  })
  const labX = cx1 + 24
  const labBase = textBlock(root, { x: labX, k: 0, style: 'label', text: `${f2(base)}`, color: C.muted, name: 'baseline' })
  const labFloor = textBlock(root, { x: labX, k: 0, style: 'label', text: `− ${f2(thr)}`, color: C.red, name: 'threshold' })
  const labMean = textBlock(root, { x: labX, k: 0, style: 'data', text: f3(mean), color: C.text, name: 'mean' })
  // hang each label on its line (these sit on chart values, not on the ruling)
  const hang = (el, y) => { el.style.top = `${parseFloat(el.style.top) + y + 11}px` }
  hang(labBase, ys(base))
  hang(labFloor, ys(floor))
  hang(labMean, ys(mean) + 2)
  const axis = textBlock(root, {
    x: cx0 - 4, k: 19, style: 'label', color: C.muted, name: 'window',
    text: `${F('eval.ragas.faithfulness')} · last ${F('drift.window')} · baseline ${f2(base)}`,
  })
  // the -3deg stamp needs a little room inside the safe edge
  const drift = stamp(root, { x: X1 - 12, k: 21, text: F('flag.reason.faithfulness_drift'), color: C.red, align: 'right', name: 'drift-stamp' })
  for (const el of [labBase, labFloor, labMean, axis]) el.style.visibility = 'hidden'
  for (const el of [baseLine, floorLine, meanLine, ...dots]) el.style.visibility = 'hidden'

  // --- choreography -------------------------------------------------------------------
  const t0 = sc.start
  tl.set(s1, { autoAlpha: 1 }, t0) // the line lands with the cut
  tl.fromTo([baseLine, axis], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'enter' }, t0 + 0.2)
  tl.fromTo(labBase, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'enter' }, t0 + 0.4)
  dots.forEach((d, i) => tl.fromTo(d, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08, ease: 'none' }, t0 + 0.2 + i * 0.045))
  revealWords(tl, s2, cue('problem.dumber'))
  tl.set(ulPath, { autoAlpha: 1 }, cue('problem.underline'))
  tl.fromTo(ulPath, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.4, ease: 'move' }, cue('problem.underline') + 0.1)
  tl.fromTo([floorLine, labFloor], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'enter' }, cue('problem.floor'))
  tl.set(meanLine, { autoAlpha: 1 }, cue('problem.mean'))
  tl.fromTo(meanLine, { y: ys(base) - ys(mean) }, { y: 0, duration: 1.0, ease: 'move' }, cue('problem.mean'))
  tl.fromTo(labMean, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter' }, cue('problem.mean') + 1.0)
  stampIn(tl, drift, cue('problem.stamp'))
}
