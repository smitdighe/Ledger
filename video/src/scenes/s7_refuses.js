// 7 REFUSES TO GUESS (bars 22-25). Silence, the real UI for scenario C, paper
// inversion #2, then the four escalation conditions as ledger lines.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F, FX, f2, factSource, trailEntry } from '../data.js'
import { textBlock, printChars } from '../lib/text.js'
import { paper, breadcrumb, caption, captionIn, stamp, stampIn, div, svgEl, leader, drawIn } from '../lib/ui.js'
import { uiView } from '../lib/uiview.js'

const fileOf = (id) => factSource(id).replace(/^backend\//, '').replace(/:.*$/, '')

export async function build(root, ctx, sc) {
  const { tl } = ctx
  const Cx = FX('scenario_C')
  const dec = trailEntry('C', 'decision')
  const best = dec.data.best
  const runner = dec.data.runner_up
  const gap = best.confidence - runner.confidence

  // ---- 42-44: the real UI for incident C (4 diagnostics light amber) ------------
  const ui = div(root, 'layer')
  paper(ui)
  breadcrumb(ui, fileOf('decision.reason.mixed_signal'))
  // frame the graph itself (classifier + the four diagnostics), not the whole card
  const crop = { left: 180, right: 1072, top: 78, bottom: 470 }
  const view = uiView(ui, 'C', { x: 0, y: 0, scale: 1, visibleFrom: sc.start, visibleTo: cue('ref.invert'), clip: crop })
  const s0 = (X1 - 72) / (crop.right - crop.left)
  const cam = { x: 72 - crop.left * s0, y: 176 - crop.top * s0, scale: s0 }
  Object.assign(view.cam, cam)
  tl.set(view.holder, cam, 0)
  // the two findings that split across failure domains (the decision's best vs cross-domain runner-up)
  const sides = [
    { f: best, k: 14, align: 'left', x: X0 },
    { f: runner, k: 16, align: 'right', x: X1 },
  ].map(({ f, k, align, x }) => {
    const node = view.map.nodes[`diag-${f.node}`]
    const r = view.toStage(node)
    const dom = textBlock(ui, {
      x, k: k - 1, style: 'label', color: C.muted, align, name: `domain-${f.node}`,
      text: F(`bucket.${f.root_cause_candidate}`),
    })
    const val = textBlock(ui, {
      x, k, style: 'data', color: C.amber, align, name: `split-${f.node}`,
      text: `${f.root_cause_candidate} ${f2(f.confidence)}`,
    })
    const nx = r.x + r.w / 2
    const ld = leader(ui, { from: { x: nx, y: r.y + r.h + 10 }, to: { x: nx, y: row(k - 1) - 36 }, color: C.amber, drop: true })
    for (const e of [dom, val]) e.style.visibility = 'hidden'
    return { dom, val, ld }
  })
  sides.forEach((sd, i) => {
    const t = cue('ref.callouts') + i * 0.15
    drawIn(tl, sd.ld.el, sd.ld.path, t, 0.3)
    tl.fromTo([sd.dom, sd.val], { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'enter' }, t + 0.15)
  })
  const cap1 = caption(ui, ['When the evidence splits…'])
  captionIn(tl, cap1, cue('ref.cap'))

  // ---- 44-46: paper inversion #2 --------------------------------------------------
  const inv = div(root, 'layer')
  inv.dataset.layer = 'paper'
  inv.style.visibility = 'hidden'
  paper(inv, { inverted: true })
  breadcrumb(inv, fileOf('decision.reason.mixed_signal'), { inverted: true })
  textBlock(inv, { x: X0, k: 9, style: 'caption', text: 'When the evidence splits…', color: C.paperMuted, role: 'caption', name: 'setup' })
  textBlock(inv, { x: X0 - 8, k: 13, style: 'statement', text: 'It refuses\nto guess.', color: C.ink, name: 'refuses' })

  // ---- 46-50: four ways to escalate, one way to act ---------------------------------
  const led = div(root, 'layer')
  led.style.visibility = 'hidden'
  paper(led)
  breadcrumb(led, fileOf('decision.reason.mixed_signal'))
  const reasons = [
    ['low_confidence', `best < ${f2(F('swarm.decision_threshold'))}`],
    ['mixed_signal', `cross-domain gap < ${f2(F('swarm.ambiguity_margin_cross'))}`],
    ['ambiguous_tie', `${F('decision.top2')} gap < ${f2(F('swarm.ambiguity_margin'))}`],
    ['no_candidate', F('decision.no_candidate_summary')],
  ]
  const fired = dec.data.reason
  const rows = reasons.map(([name, rule], i) => {
    const k = 5 + i
    const n = textBlock(led, { x: X0 + 30, k, style: 'data', text: F(`decision.reason.${name}`), color: C.text, name: `reason-${name}` })
    const r = textBlock(led, { x: 520, k, style: 'datasm', text: rule, color: C.muted, name: `rule-${name}` })
    n.style.visibility = 'hidden'
    r.style.visibility = 'hidden'
    return { name, k, n, r }
  })
  const firedRow = rows.find((r) => r.name === fired)
  if (!firedRow) throw new Error(`fired reason ${fired} not listed`)
  const mark = svgEl('svg', { width: 1080, height: 1350, viewBox: '0 0 1080 1350' })
  Object.assign(mark.style, { position: 'absolute', left: 0, top: 0 })
  mark.dataset.role = 'decor'
  const bar = svgEl('rect', { x: X0 - 4, y: row(firedRow.k) - 40, width: 10, height: 50, fill: C.amber }, mark)
  led.appendChild(mark)
  mark.style.visibility = 'hidden'

  const detail = [
    ['best', best.root_cause_candidate, f2(best.confidence)],
    ['vs', runner.root_cause_candidate, f2(runner.confidence)],
    ['gap', `${f2(gap)} < ${f2(F('swarm.ambiguity_margin_cross'))}`, ''],
  ].map(([a, b, c], i) => {
    const k = 10 + i
    const col = i === 2 ? C.amber : C.text
    const els = [
      textBlock(led, { x: X0 + 30, k, style: 'data', text: a, color: C.muted, name: `detail-${a}` }),
      textBlock(led, { x: 260, k, style: 'data', text: b, color: col, name: `detail-${a}-v` }),
    ]
    if (c) els.push(textBlock(led, { x: X1, k, style: 'data', text: c, color: col, align: 'right', name: `detail-${a}-c` }))
    for (const e of els) e.style.visibility = 'hidden'
    return els
  })
  const outcome = textBlock(led, {
    x: X0 + 30, k: 14, style: 'data', color: C.text, name: 'outcome',
    text: `${F('swarm.node.human_review')} → incident ${Cx.incident_row.status}`,
  })
  outcome.style.visibility = 'hidden'
  const openStamp = stamp(led, {
    x: X0 + 30, k: 16, color: C.amber, name: 'open-stamp',
    text: `${Cx.final.remediation_status} · ${F('human.flag')}`,
  })
  const cap2 = caption(led, ['Four ways to escalate.', 'One way to act.'])

  // ---- choreography ------------------------------------------------------------------
  const ti = cue('ref.invert')
  tl.set(ui, { autoAlpha: 1 }, sc.start)
  tl.set(ui, { autoAlpha: 0 }, ti)
  tl.set(inv, { autoAlpha: 1 }, ti)
  tl.set(inv, { autoAlpha: 0 }, cue('ref.lines'))
  tl.set(led, { autoAlpha: 1 }, cue('ref.lines'))
  // the four reason names land with the flip; their thresholds print one per 8th-and-a-half
  tl.set(rows.map((r) => r.n), { autoAlpha: 1 }, cue('ref.lines'))
  rows.forEach((r, i) => {
    printChars(tl, r.r, cue('ref.lines') + 0.1 + i * 0.35, { cps: 70 })
  })
  const tf = cue('ref.fired')
  tl.set(mark, { autoAlpha: 1 }, tf)
  tl.fromTo(bar, { scaleY: 0, transformOrigin: '50% 50%' }, { scaleY: 1, duration: 0.3, ease: 'enter' }, tf)
  tl.to([firedRow.n, firedRow.r], { color: C.amber, duration: 0 }, tf)
  for (const r of rows) if (r !== firedRow) tl.to([r.n, r.r], { color: C.muted, duration: 0 }, tf)
  detail.forEach((els, i) => {
    tl.fromTo(els, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'enter' }, tf + 0.15 + i * 0.12)
  })
  captionIn(tl, cap2, cue('ref.cap2'))
  tl.fromTo(outcome, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'enter' }, cue('ref.stamp') - 0.5)
  stampIn(tl, openStamp, cue('ref.stamp'))
}
