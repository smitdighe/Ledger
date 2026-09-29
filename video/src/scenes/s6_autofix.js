// 6 AUTO-FIX (bars 18-21). The app's own swarm graph for incident B, driven by the
// clicks the cursor makes (captured at those exact times), then a focus on the real
// evidence: the culprit finding and the tool result.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F, FX, LOG, f2, factSource, finding } from '../data.js'
import { textBlock } from '../lib/text.js'
import {
  paper, breadcrumb, caption, captionIn, stamp, stampIn, cursor, click, focusMask, leader, drawIn, terminalStrip, streamLines,
  hudPanels,
} from '../lib/ui.js'
import { uiView } from '../lib/uiview.js'

export async function build(root, ctx, sc) {
  const { tl } = ctx
  const B = FX('scenario_B')
  paper(root)
  const crumb = factSource('fe.step_label').replace(/^frontend\/src\//, '').replace(/:.*$/, '')

  // --- the real UI, fitted between the breadcrumb and the caption band ---------------
  const ui = uiView(root, 'B', { x: 0, y: 0, scale: 1, visibleFrom: sc.start, visibleTo: sc.end })
  const { size } = ui.man
  const s0 = Math.min((X1 - X0) / size.w, (row(18) + 12 - 150) / size.h)
  const cam0 = { x: X0 + ((X1 - X0) - size.w * s0) / 2, y: 150, scale: s0 }
  tl.set(ui.holder, cam0, 0)

  // --- cursor: glides in, clicks where each control really was ------------------------
  const cur = cursor(root)
  const clicks = ui.map.clicks
  const pt = (c) => ui.center(c, cam0)
  const p1 = pt(clicks[0])
  const p2 = pt(clicks[1])
  const p3 = pt(clicks[2])
  tl.set(cur.el, { autoAlpha: 1, x: 1130, y: 1060 }, cue('fix.cursor'))
  tl.to(cur.el, { x: p1.x, y: p1.y, duration: 0.42, ease: 'move' }, cue('fix.cursor') + 0.02)
  click(tl, cur, cue('fix.click1'))
  tl.to(cur.el, { x: p2.x, y: p2.y, duration: 0.2, ease: 'move' }, cue('fix.click1') + 0.25)
  click(tl, cur, cue('fix.click2'))
  tl.to(cur.el, { x: p3.x, y: p3.y, duration: 0.3, ease: 'move' }, cue('fix.toPlay'))
  click(tl, cur, cue('fix.click3'))
  tl.to(cur.el, { autoAlpha: 0, duration: 0.3, ease: 'exit' }, cue('fix.reveal') + 0.25)

  // --- focus: camera closes in on the culprit and the fix ----------------------------
  const nodes = ui.map.nodes
  const prompt = nodes['diag-prompt_diagnostic']
  const term = nodes.terminal
  const ux0 = Math.min(prompt.x, term.x)
  const ux1 = Math.max(prompt.x + prompt.w, term.x + term.w)
  const uy0 = prompt.y
  const uy1 = term.y + term.h
  const s1 = 1.6
  const cam1 = { scale: s1, x: 575 - ((ux0 + ux1) / 2) * s1, y: 470 - ((uy0 + uy1) / 2) * s1 }
  const tCam = cue('fix.reveal') + 0.3
  tl.to(ui.holder, { x: cam1.x, y: cam1.y, scale: s1, duration: 1.0, ease: 'move' }, tCam)

  const mask = focusMask(root)
  hudPanels(root, { top: 148, bottom: 1000 }) // the zoomed UI never runs under the HUD rows
  breadcrumb(root, crumb)
  const pr = ui.toStage(prompt, cam1)
  const tr = ui.toStage(term, cam1)
  const pad = 14
  const cut = (r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad })
  mask.set(cut(pr))

  // callouts sit under their node; the leader drops straight onto the text's top edge
  const under = (el, nodeX) => {
    const w = el.offsetWidth
    const left = Math.max(X0, Math.min(X1 - w, nodeX - 60))
    el.style.left = `${left}px`
    return left
  }
  // callout 1: the culprit finding, straight from the trail
  const fp = finding('B', 'prompt_diagnostic')
  const ev = fp.supporting_evidence
  const n1x = pr.x + pr.w * 0.6
  const c1a = textBlock(root, {
    x: X0, k: 17, style: 'data', color: C.text, name: 'callout-finding',
    text: `${fp.root_cause_candidate} · ${f2(fp.confidence)}`,
  })
  const c1b = textBlock(root, {
    x: X1, k: 18, style: 'datasm', color: C.muted, name: 'callout-evidence', align: 'right',
    text: `${F('eval.ragas.faithfulness')} ${f2(ev.faithfulness_before)} → ${f2(ev.faithfulness_after)} after v${ev.regressed_version}`,
  })
  under(c1a, n1x)
  const l1 = leader(root, { from: { x: n1x, y: pr.y + pr.h + pad }, to: { x: n1x, y: row(17) - 40 }, drop: true })
  // callout 2: the tool result
  const tool = B.final.trail.find((e) => e.node === 'remediation').data.tool_result
  const n2x = tr.x + tr.w * 0.5
  const c2 = textBlock(root, {
    x: X0, k: 17, style: 'data', color: C.text, name: 'callout-tool',
    text: `${tool.tool} → v${tool.active_version} active`,
  })
  under(c2, n2x)
  const l2 = leader(root, { from: { x: n2x, y: tr.y + tr.h + pad }, to: { x: n2x, y: row(17) - 40 }, drop: true })
  for (const el of [c1a, c1b, c2]) el.style.visibility = 'hidden'

  const resolved = stamp(root, {
    x: X1, k: 12, text: B.final.remediation_status, color: C.green, align: 'right', name: 'resolved',
  })
  if (B.final.remediation_status !== F('incident.status.resolved')) throw new Error('B not resolved')

  const cap = caption(root, ['Root cause: a prompt change.', 'Rollback fired. No one paged.'])

  // terminal strip in the chrome zone: B's own structlog lines, verbatim
  const term0 = terminalStrip(root, LOG('B'), { k0: 23, rows: 3 })
  const lines = LOG('B')
  const tStart = cue('fix.click1')
  const tEnd = cue('fix.callout2')
  streamLines(tl, term0, lines.map((_, i) => tStart + (i * (tEnd - tStart)) / (lines.length - 1)))

  // --- choreography -------------------------------------------------------------------
  const tm = cue('fix.mask')
  tl.set(mask.el, { autoAlpha: 0 }, sc.start)
  tl.to(mask.el, { autoAlpha: 1, duration: 0.35, ease: 'enter' }, tm)
  drawIn(tl, l1.el, l1.path, tm + 0.2, 0.35)
  tl.fromTo([c1a, c1b], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'enter', stagger: 0.08 }, tm + 0.4)
  captionIn(tl, cap, cue('fix.cap'))
  const t2 = cue('fix.callout2')
  tl.to([c1a, c1b, l1.el], { autoAlpha: 0, duration: 0.25, ease: 'exit' }, t2 - 0.3)
  tl.set(mask.path, { attr: { d: mask.pathFor(cut(tr)) } }, t2)
  drawIn(tl, l2.el, l2.path, t2, 0.35)
  tl.fromTo(c2, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'enter' }, t2 + 0.15)
  stampIn(tl, resolved, cue('fix.stamp'))
  root.appendChild(cur.el) // the cursor rides on top of everything
}
