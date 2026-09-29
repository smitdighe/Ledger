// 4 PIPELINE (bars 8-15): one continuous camera move down a vertical map, following
// the ◆ (the trace) along the red margin. Scenario B's real scores, flag and routing.
import { C, W, H, ROW, MARGIN_X, X0, X1, row, TYPE } from '../design.js'
import { cue } from '../timeline.js'
import { F, FX, factSource } from '../data.js'
import { textBlock, printChars, revealWords, applyType, rich, firstBaseline } from '../lib/text.js'
import {
  paper, caption, captionIn, fadeOut, chip, popIn, stamp, stampIn, meter, meterIn, packet, svgEl, div,
} from '../lib/ui.js'

// camera stops (ruling rows): tight enough that a move never travels over empty paper,
// loose enough that the previous section sits under the top HUD band at rest
const STOP = [0, 12, 24, 40]
const mk = (s, k) => STOP[s] + k // map row of section-local row k
const cy = (k) => row(k) - 13 // visual middle of a 30-36 px mono line on row k
const fileOf = (id) => factSource(id).replace(/^backend\//, '').replace(/:.*$/, '')

export async function build(root, ctx, sc) {
  const { tl } = ctx
  const B = FX('scenario_B')
  const ing = FX('ingest').accepted

  paper(root)
  const cam = div(root, 'cam layer', { transformOrigin: '540px 675px' })
  const map = div(cam, 'map', { position: 'absolute', left: '0px', top: '0px', width: `${W}px`, height: `${H * 4}px` })
  const edges = svgEl('svg', { width: W, height: H * 4, viewBox: `0 0 ${W} ${H * 4}` })
  Object.assign(edges.style, { position: 'absolute', left: 0, top: 0, overflow: 'visible' })
  edges.dataset.role = 'decor'
  map.appendChild(edges)

  const hidden = (el) => { el.style.visibility = 'hidden'; return el }
  const line = (d, { color = C.muted, width = 2, dash = null } = {}) => {
    const p = svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': width }, edges)
    if (dash) p.setAttribute('stroke-dasharray', dash)
    p.style.visibility = 'hidden'
    return p
  }
  const draw = (p, t, dur, ease = 'none') => {
    tl.set(p, { autoAlpha: 1 }, t)
    tl.fromTo(p, { drawSVG: '0%' }, { drawSVG: '100%', duration: dur, ease }, t)
  }
  /** node box: panel + 2 px border around one or two text rows starting at row k */
  const node = (k, parts, { x = X0 + 6, name, sub } = {}) => {
    const g = hidden(div(map, 'node', { position: 'absolute', left: '0px', top: '0px' }))
    g.dataset.name = name ?? parts
    const box = div(g, 'box', {
      position: 'absolute', background: C.panel, border: `2px solid ${C.rule}`, borderRadius: '10px',
    })
    const t1 = textBlock(g, { x: x + 22, k, style: 'data', text: parts, color: C.text })
    let right = parseFloat(t1.style.left) + t1.offsetWidth
    let bottomK = k
    let t2 = null
    if (sub) {
      t2 = textBlock(g, { x: x + 22, k: k + 1, style: 'label', text: sub, color: C.muted })
      right = Math.max(right, parseFloat(t2.style.left) + t2.offsetWidth)
      bottomK = k + 1
    }
    const top = row(k) - 42
    const bottom = row(bottomK) + 16
    Object.assign(box.style, { left: `${x}px`, top: `${top}px`, width: `${right - x + 22}px`, height: `${bottom - top}px` })
    return { g, x, top, bottom, right: right + 22, k, t1, t2 }
  }
  const nodeIn = (n, t) => tl.fromTo(n.g, { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'enter' }, t)
  const tick = (k, x2) => line(`M${MARGIN_X} ${cy(k)} H${x2}`, { color: C.muted })

  // ---------------------------------------------------------------- section 1: ingest
  const otlp = node(mk(0, 5), `${F('otlp.name')} · ${F('otlp.protobuf')} | ${F('otlp.json')}`, { name: 'otlp' })
  const post = node(mk(0, 8), `${F('api.traces.method')} ${F('api.prefix')}${F('api.traces.path')}`,
    { sub: `${F('api.header')} · ${F('api.scope.ingestion')}`, name: 'post' })
  const resp = hidden(textBlock(map, {
    x: X0 + 66, k: mk(0, 11), style: 'label', color: C.text, name: 'accepted',
    text: `${ing.status} · ${F('api.accepted.accepted_spans')} ${ing.body.accepted_spans} · ${F('api.accepted.traces')} ${ing.body.traces}`,
  }))
  const respEdge = line(`M${X0 + 30} ${post.bottom} V${cy(mk(0, 11))} H${X0 + 54}`)
  const qIngest = node(mk(0, 14), `queue · ${F('celery.queue.ingestion')}`, { name: 'queue-ingestion' })

  // ---------------------------------------------------------------- section 2: store
  const ingest = node(mk(1, 5), F('task.ingest'), { name: 'ingest_traces' })
  const chRow = hidden(textBlock(map, { x: X0 + 66, k: mk(1, 7), style: 'data', text: `${F('ch.name')} · ${F('ch.table')}`, name: 'clickhouse' }))
  const chSub = hidden(textBlock(map, {
    x: X0 + 66, k: mk(1, 8), style: 'label', color: C.muted, name: 'clickhouse-sub',
    text: `${F('ch.engine')} · daily partitions · ${F('ch.ttl_days')}-day TTL`,
  }))
  const lfRow = hidden(textBlock(map, { x: X0 + 66, k: mk(1, 10), style: 'data', text: `${F('langfuse.name')} · ${F('task.langfuse_nonfatal')}`, name: 'langfuse', color: C.muted }))
  const chEdge = line(`M${X0 + 30} ${ingest.bottom} V${cy(mk(1, 7))} H${X0 + 54}`)
  const lfEdge = line(`M${X0 + 30} ${cy(mk(1, 7))} V${cy(mk(1, 10))} H${X0 + 54}`, { dash: '6 6' })
  const evalDelay = node(mk(1, 13), F('task.eval_chain'), { sub: `queue · ${F('celery.queue.eval')}`, name: 'eval-delay' })

  // ---------------------------------------------------------------- section 3: score + flag
  const evalNode = node(mk(2, 4), F('task.eval'), { name: 'eval_trace' })
  const s = B.eval_scores
  const bad = (m, v) => (m === 'hallucination' ? v > F('flag.hallucination') : v < F('flag.low'))
  const groupLab = (k, text) => hidden(textBlock(map, { x: X0 + 6, k, style: 'label', text, color: C.muted, name: `group-${text}` }))
  const ragasLab = groupLab(mk(2, 5), F('eval.ragas.name'))
  const deepLab = groupLab(mk(2, 8), F('eval.deepeval.name'))
  const meters = [
    [5, F('eval.ragas.faithfulness'), s.faithfulness, 'faithfulness'],
    [6, F('eval.ragas.context_precision'), s.retrieval_precision, 'context_precision'],
    [7, F('eval.ragas.context_recall'), s.context_recall, 'context_recall'],
    [8, F('eval.deepeval.answer_relevance'), s.answer_relevance, 'answer_relevance'],
    [9, F('eval.deepeval.hallucination'), s.hallucination, 'hallucination'],
  ].map(([k, label, v, m]) => {
    const mm = meter(map, { x: 300, k: mk(2, k), label, value: v, width: 200, bad: bad(m, v), name: m })
    mm.track.style.left = '676px'
    return mm
  })
  const judge = chip(map, {
    x: X0 + 6, k: mk(2, 11), style: 'label', color: C.text, name: 'judge', padX: 14,
    text: `${F('judge.class')} · ${F('judge.nonpaid')}`,
  })
  const judgeTiers = hidden(textBlock(map, {
    x: parseFloat(judge.style.left) + judge.offsetWidth + 22, k: mk(2, 11), style: 'label', color: C.muted,
    name: 'judge-tiers', text: F('judge.tiers').join(' · '),
  }))
  const rule1 = hidden(textBlock(map, { x: X0 + 6, k: mk(2, 13), style: 'datasm', color: C.text, name: 'rule1', text: `${F('flag.fn')}: any metric < ${F('flag.low')},` }))
  const rule2 = hidden(textBlock(map, { x: X0 + 6, k: mk(2, 14), style: 'datasm', color: C.text, name: 'rule2', text: `${F('eval.deepeval.hallucination')} > ${F('flag.hallucination')}, or faithfulness drift` }))
  const flagStamp = stamp(map, { x: X0 + 6, k: mk(2, 16), text: F('flag.key'), color: C.red, name: 'flagged' })
  const reasons = B.flag.reasons
  for (const r of reasons) if (!F(`flag.reason.${r}`)) throw new Error(`reason ${r}`)
  const half = Math.ceil(reasons.length / 2)
  const rs1 = hidden(textBlock(map, { x: X0 + 6, k: mk(2, 17), style: 'label', color: C.text, name: 'reasons1', text: reasons.slice(0, half).join(' · ') }))
  const rs2 = hidden(textBlock(map, { x: X0 + 6, k: mk(2, 18), style: 'label', color: C.text, name: 'reasons2', text: reasons.slice(half).join(' · ') }))

  // ---------------------------------------------------------------- section 4: swarm
  const dispatch = hidden(textBlock(map, {
    x: X0 + 6, k: mk(3, 4), style: 'label', color: C.muted, name: 'dispatch',
    text: `${F('task.diag_delay')} → queue · ${F('celery.queue.diagnostic')}`,
  }))
  const cls = node(mk(3, 6), F('swarm.node.classifier'), { name: 'classifier' })
  const diagNames = ['retrieval_diagnostic', 'index_diagnostic', 'prompt_diagnostic', 'model_diagnostic']
  const lit = new Set(B.final.classification.targets)
  const diag = diagNames.map((n, i) => {
    const k = mk(3, 8 + i)
    const el = hidden(textBlock(map, { x: X0 + 70, k, style: 'data', text: F(`swarm.node.${n}`), color: C.muted, name: n }))
    return { n, k, el, lit: lit.has(n) }
  })
  const fanX = X0 + 30
  const fanDown = line(`M${fanX} ${cls.bottom} V${cy(diag[3].k)}`)
  const fanTicks = diag.map((d) => line(`M${fanX} ${cy(d.k)} H${X0 + 58}`))
  const joinX = 700
  // only the diagnostics that actually ran feed the decision
  const ran = diag.filter((d) => d.lit)
  const joins = ran.map((d) => line(`M${parseFloat(d.el.style.left) + d.el.offsetWidth + 14} ${cy(d.k)} H${joinX}`, { color: C.red }))
  const decision = hidden(textBlock(map, { x: X0 + 30, k: mk(3, 13), style: 'data', text: F('swarm.node.decision'), color: C.text, name: 'decision' }))
  const joinBus = line(`M${joinX} ${cy(ran[0].k)} V${cy(mk(3, 13))} H${parseFloat(decision.style.left) + decision.offsetWidth + 16}`, { color: C.red })
  const decX = X0 + 54
  const rem = hidden(textBlock(map, { x: X0 + 94, k: mk(3, 15), style: 'data', text: F('swarm.node.remediation'), color: C.muted, name: 'remediation' }))
  const tools = hidden(textBlock(map, {
    x: X0 + 94, k: mk(3, 16), style: 'label', color: C.muted, name: 'tools',
    text: `${F('remedy.retrieval_failure')} (stub) · ${F('remedy.prompt_regression')} · ${F('remedy.model_degradation')}`,
  }))
  const hr = hidden(textBlock(map, { x: X0 + 94, k: mk(3, 17), style: 'data', text: F('swarm.node.human_review'), color: C.muted, name: 'human_review' }))
  const decDown = line(`M${decX} ${row(mk(3, 13)) + 14} V${cy(mk(3, 17))}`)
  const decTicks = [line(`M${decX} ${cy(mk(3, 15))} H${X0 + 82}`), line(`M${decX} ${cy(mk(3, 17))} H${X0 + 82}`)]

  // ---------------------------------------------------------------- spine + ◆
  const stops = [mk(0, 5), mk(0, 8), mk(0, 14), mk(1, 5), mk(1, 13), mk(2, 4), mk(2, 16), mk(3, 6)]
  const spine = line(`M${MARGIN_X} ${cy(stops[0])} V${cy(stops.at(-1))}`, { color: C.muted })
  const spineLen = cy(stops.at(-1)) - cy(stops[0])
  const pk = packet(map, { size: 30, color: C.text })
  pk.el.dataset.name = 'packet'
  const pkAt = (k) => ({ x: MARGIN_X, y: cy(k) })
  tl.set(pk.el, { x: MARGIN_X, y: cy(stops[0]), autoAlpha: 0 }, sc.start)
  const ticks = [otlp, post, qIngest, ingest, evalDelay, evalNode, null, cls].map((n, i) =>
    n ? tick(stops[i], n.x) : null)

  /** move the ◆ from its current stop to stop j, inking the spine behind it */
  const hop = (j, t, dur, ease = 'move') => {
    tl.to(pk.el, { y: cy(stops[j]), duration: dur, ease }, t)
    const pct = ((cy(stops[j]) - cy(stops[0])) / spineLen) * 100
    tl.to(spine, { drawSVG: `0% ${pct}%`, duration: dur, ease }, t)
  }

  // ---------------------------------------------------------------- HUD
  const hud = div(root, 'layer hud')
  const topPanel = svgEl('svg', { width: W, height: 168, viewBox: `0 0 ${W} 168` })
  const botPanel = svgEl('svg', { width: W, height: H - 994, viewBox: `0 0 ${W} ${H - 994}` })
  for (const [p, y0] of [[topPanel, 0], [botPanel, 994]]) {
    Object.assign(p.style, { position: 'absolute', left: 0, top: `${y0}px` })
    p.dataset.role = 'decor'
    const h = Number(p.getAttribute('height'))
    svgEl('rect', { x: 0, y: 0, width: W, height: h, fill: C.ink }, p)
    for (let y = ROW; y < H; y += ROW) if (y >= y0 && y < y0 + h) svgEl('rect', { x: 0, y: y - y0, width: W, height: 2, fill: C.rule }, p)
    svgEl('rect', { x: MARGIN_X - 1, y: 0, width: 2, height: h, fill: C.red, 'fill-opacity': 0.22 }, p)
    hud.appendChild(p)
  }
  const crumbs = [
    [fileOf('api.traces.path'), sc.start, cue('pipe.cam1')],
    [fileOf('task.ingest'), cue('pipe.store'), cue('pipe.cam2')],
    [fileOf('flag.fn'), cue('pipe.meters') - 0.5, cue('pipe.cam3')],
    [fileOf('swarm.node.classifier'), cue('pipe.cap4') + 0.5, sc.end],
  ].map(([text, t0, t1]) => {
    const el = hidden(textBlock(hud, { x: X0, k: 2, style: 'label', text, color: C.muted, name: 'breadcrumb' }))
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter' }, t0)
    if (t1 < sc.end) tl.to(el, { autoAlpha: 0, duration: 0.25, ease: 'exit' }, t1)
    return el
  })
  const tag1 = hidden(textBlock(hud, { x: X1, k: 2, style: 'label', text: F('scenario.B'), color: C.text, align: 'right', name: 'tag' }))
  const tag2 = hidden(textBlock(hud, { x: X1, k: 3, style: 'label', text: F('tests.swarm_file'), color: C.muted, align: 'right', name: 'tag-path' }))

  const caps = [
    // captions are HUD: they hold through the camera moves and hand over just before the next
    [[F('voice.otlp')], cue('pipe.cap1'), cue('pipe.cap2') - 0.4],
    [['Stored, then scored.', 'Every trace, not a sample.'], cue('pipe.cap2'), cue('pipe.cap3') - 0.4],
    [['A bad score doesn’t page a human…'], cue('pipe.cap3'), cue('pipe.cap4') - 0.35],
    [['…it dispatches a diagnostic swarm.'], cue('pipe.cap4'), null],
  ].map(([lines, t0, t1]) => {
    const el = caption(hud, lines)
    captionIn(tl, el, t0)
    if (t1) fadeOut(tl, el, t1)
    return el
  })

  // ---------------------------------------------------------------- choreography
  tl.set(pk.el, { autoAlpha: 1 }, sc.start)
  tl.set(spine, { autoAlpha: 1, drawSVG: '0% 0%' }, sc.start)
  nodeIn(otlp, sc.start + 0.1)
  draw(ticks[0], sc.start + 0.1, 0.25)

  // S1
  hop(1, cue('pipe.post') - 0.4, 0.6)
  nodeIn(post, cue('pipe.post'))
  draw(ticks[1], cue('pipe.post'), 0.25)
  draw(respEdge, cue('pipe.accepted') - 0.35, 0.35)
  popIn(tl, resp, cue('pipe.accepted'))
  hop(2, cue('pipe.queue') - 0.6, 0.6)
  nodeIn(qIngest, cue('pipe.queue') - 0.2)
  draw(ticks[2], cue('pipe.queue') - 0.2, 0.25)

  // camera 1 -> S2
  const camMove = (t, toRow, dur = 1.25) => {
    tl.to(map, { y: -row(toRow), duration: dur, ease: 'move' }, t)
    tl.to(cam, { scale: 0.965, duration: dur / 2, ease: 'move', yoyo: true, repeat: 1 }, t)
  }
  camMove(cue('pipe.cam1'), STOP[1])
  hop(3, cue('pipe.cam1'), 1.25)
  nodeIn(ingest, cue('pipe.store'))
  draw(ticks[3], cue('pipe.store'), 0.25)
  draw(chEdge, cue('pipe.fork') - 0.1, 0.35)
  tl.fromTo([chRow, chSub], { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'enter', stagger: 0.1 }, cue('pipe.fork') + 0.2)
  draw(lfEdge, cue('pipe.fork') + 0.5, 0.35)
  tl.fromTo(lfRow, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'enter' }, cue('pipe.fork') + 0.8)
  hop(4, cue('pipe.evaldelay') - 0.75, 0.6)
  nodeIn(evalDelay, cue('pipe.evaldelay') - 0.4)
  draw(ticks[4], cue('pipe.evaldelay') - 0.4, 0.25)

  // camera 2 -> S3
  camMove(cue('pipe.cam2'), STOP[2], 1.5)
  hop(5, cue('pipe.cam2'), 1.5)
  nodeIn(evalNode, cue('pipe.meters') - 0.5)
  draw(ticks[5], cue('pipe.meters') - 0.5, 0.25)
  tl.fromTo([ragasLab, deepLab], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter' }, cue('pipe.meters'))
  meters.forEach((m, i) => {
    tl.fromTo(m.lab, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter' }, cue('pipe.meters') + i * 0.04)
    meterIn(tl, m, cue('pipe.meters') + i * 0.04, 1.0)
  })
  popIn(tl, judge, cue('pipe.judge'))
  tl.fromTo(judgeTiers, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter' }, cue('pipe.judge') + 0.2)
  tl.fromTo([tag1, tag2], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'enter', stagger: 0.08 }, cue('pipe.cap3'))
  tl.to([tag1, tag2], { autoAlpha: 0, duration: 0.25, ease: 'exit' }, cue('pipe.cam3'))
  const r1end = printChars(tl, rule1, cue('pipe.rule'), { cps: 64 })
  printChars(tl, rule2, r1end + 0.05, { cps: 64 }) // done by ~23.25, before the stamp
  hop(6, cue('pipe.flag') - 0.5, 0.5)
  stampIn(tl, flagStamp, cue('pipe.flag'))
  tl.to(pk.path, { attr: { fill: C.red }, duration: 0 }, cue('pipe.flag'))
  tl.fromTo([rs1, rs2], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'enter', stagger: 0.08 }, cue('pipe.reasons'))

  // camera 3 -> S4 (the swarm map)
  camMove(cue('pipe.cam3'), STOP[3], 1.5)
  hop(7, cue('pipe.cam3'), 1.5)
  tl.fromTo(dispatch, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'enter' }, cue('pipe.cam3') + 0.9)
  nodeIn(cls, cue('pipe.cap4') + 0.3)
  draw(ticks[7], cue('pipe.cap4') + 0.3, 0.25)
  const sw = cue('pipe.swarm') // 26.5
  draw(fanDown, sw, 0.4)
  fanTicks.forEach((p, i) => draw(p, sw + 0.25 + i * 0.05, 0.2))
  diag.forEach((d, i) => tl.fromTo(d.el, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'enter' }, sw + 0.3 + i * 0.05))
  // split packets travel the fan-out to the classifier's targets only; the others stay dim
  const tLit = sw + 1.3
  ran.forEach((d, j) => {
    const i = diag.indexOf(d)
    const route = svgEl('path', { d: `M${fanX} ${cls.bottom} V${cy(d.k)} H${X0 + 58}`, fill: 'none', stroke: 'none' }, edges)
    const p = packet(map, { size: 18, color: C.red })
    p.el.dataset.role = 'decor'
    p.el.style.visibility = 'hidden'
    const t = sw + 0.7 + j * 0.1
    tl.set(p.el, { autoAlpha: 1 }, t)
    tl.to(p.el, { motionPath: { path: route, align: route, alignOrigin: [0.5, 0.5] }, duration: 0.5, ease: 'none' }, t)
    tl.set(p.el, { autoAlpha: 0 }, t + 0.5)
    tl.to(d.el, { color: C.red, duration: 0 }, t + 0.5)
    tl.to(fanTicks[i], { attr: { stroke: C.red }, duration: 0 }, t + 0.5)
  })
  joins.forEach((p, i) => draw(p, tLit + 0.1 + i * 0.05, 0.3))
  draw(joinBus, tLit + 0.3, 0.4)
  tl.fromTo(decision, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'enter' }, tLit + 0.6) // 28.4
  draw(decDown, tLit + 0.85, 0.3)
  decTicks.forEach((p, i) => draw(p, tLit + 1.0 + i * 0.08, 0.2))
  tl.fromTo([rem, tools, hr], { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'enter', stagger: 0.08 }, tLit + 1.05) // settled by ~29.3

}
