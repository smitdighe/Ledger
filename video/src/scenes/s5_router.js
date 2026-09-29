// 5 ROUTER (bars 16-17). The real TierCascade fall (framer-motion, captured frame by
// frame) on a SIMULATED outage fixture, with the selector's own skip reasons.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F, factSource } from '../data.js'
import { textBlock } from '../lib/text.js'
import { paper, breadcrumb, caption, chip, popIn } from '../lib/ui.js'
import { uiView } from '../lib/uiview.js'

const fileOf = (id) => factSource(id).replace(/^backend\//, '').replace(/:.*$/, '')

export async function build(root, ctx, sc) {
  const { tl } = ctx
  paper(root)
  breadcrumb(root, fileOf('router.floor_reason'))

  // scale so tier rows land 108 px (two rulings) apart; row centres sit on chip rows
  const ui0 = uiView(root, 'cascade', { x: 0, y: 0, scale: 1, visibleFrom: sc.start, visibleTo: sc.end })
  const rows = ui0.map.rows
  const pitch = rows[1].y - rows[0].y
  const scale = 108 / pitch
  const k0 = 6
  const rowMid = (i) => rows[i].y + rows[i].h / 2
  const x = X0
  const y = row(k0) - 11 - rowMid(0) * scale
  ui0.cam.x = x
  ui0.cam.y = y
  ui0.cam.scale = scale
  tl.set(ui0.holder, { x, y, scale }, 0)

  const chipX = x + ui0.man.size.w * scale + 22
  const tiers = rows.map((r) => r.tier)
  for (const t of tiers) if (!F(`tier.${t}.name`)) throw new Error(`tier ${t}`)
  const chips = tiers.map((t, i) => {
    const floor = t === F('router.floor_tier')
    return chip(root, {
      x: chipX, k: k0 + 2 * i, style: 'label', name: `skip-${t}`,
      text: floor ? F('router.floor_reason') : F('router.skip.unhealthy'),
      color: C.text, border: floor ? C.green : C.red,
    })
  })
  const floorNote = textBlock(root, {
    x: X0, k: 15, style: 'label', color: C.muted, name: 'floor-note',
    text: `${F('router.floor_reason')}: no ${F('router.lua')}, no ${F('router.daily')}`,
  })
  const judge = textBlock(root, {
    x: X0, k: 17, style: 'label', color: C.muted, name: 'judge-line',
    text: `${F('judge.class')} · paid provider → ${F('judge.error')}`,
  })
  for (const el of [floorNote, judge]) el.style.visibility = 'hidden'
  const cap = caption(root, ['When a tier fails, the next serves.', 'Local Ollama is the floor.'])

  // the signal falls 0.5 s per tier (FallbackAnimation: 0.4 * 3 + 0.3 s, evenly timed keyframes)
  tl.set(cap, { autoAlpha: 1 }, sc.start) // lands with the cut: 12 words need the whole scene
  chips.forEach((c, i) => popIn(tl, c, cue('router.fall') + i * 0.5, { from: { x: -14 } }))
  tl.fromTo(floorNote, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'enter' }, cue('router.floor') + 0.25)
  tl.fromTo(judge, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'enter' }, cue('router.judge'))
}
