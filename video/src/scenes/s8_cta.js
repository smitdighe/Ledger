// 8 CTA (bars 26-28). Logo, the app's own ◆ Ledger lockup, the author's closing
// idea, the repository. The last 3 s hold perfectly still.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F } from '../data.js'
import { textBlock, revealWords, printChars } from '../lib/text.js'
import { paper, asciiLogo, inkLogo } from '../lib/ui.js'

export async function build(root, ctx, sc) {
  const { tl, rand } = ctx
  paper(root)
  const cols = Math.max(...F('brand.logo').map((l) => [...l].length))
  const cw = (X1 - X0) / cols
  const logo = asciiLogo(root, { x: X0, y: row(3) - 4, cw, chh: cw * 2, color: C.text, name: 'cta-logo' })
  logo.el.style.visibility = 'hidden'

  // lockup: green ◆ + "Ledger", exactly as the app's sidebar brand
  const lock = textBlock(root, { x: X0, k: 9, style: 'caption', text: `${F('brand.mark')} ${F('brand.name')}`, color: C.text, name: 'lockup' })
  lock.querySelector('.g').style.color = F('brand.mark_color')
  lock.style.fontWeight = '680'
  lock.style.visibility = 'hidden'

  const closer = textBlock(root, {
    x: X0 - 4, k: 12, style: 'headline', color: C.text, role: 'caption', name: 'closer',
    text: 'Not a metric.\nA system.',
  })
  closer.style.visibility = 'hidden'

  const url = textBlock(root, { x: X0, k: 17, style: 'url', text: F('brand.repo'), color: C.text, name: 'url' })
  url.style.visibility = 'hidden'

  const stack = ['stack.fastapi', 'stack.langgraph', 'stack.celery', 'stack.clickhouse', 'stack.ragas', 'stack.deepeval', 'stack.reactflow'].map(F)
  const st1 = textBlock(root, { x: X0, k: 19, style: 'label', color: C.muted, name: 'stack1', text: stack.slice(0, 4).join(' · ') })
  const st2 = textBlock(root, { x: X0, k: 20, style: 'label', color: C.muted, name: 'stack2', text: stack.slice(4).join(' · ') })
  for (const e of [st1, st2]) e.style.visibility = 'hidden'

  const t0 = sc.start
  inkLogo(tl, logo, t0 + 0.05, 0.6, rand)
  tl.fromTo(lock, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'enter' }, t0 + 0.5)
  revealWords(tl, closer, cue('cta.closer') + 0.25)
  printChars(tl, url, cue('cta.url'), { cps: 40 })
  tl.fromTo([st1, st2], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'enter', stagger: 0.1 }, cue('cta.stack'))
}
