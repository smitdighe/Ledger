// 3 TITLE (bar 7). The README tagline asks; the README's ASCII logo answers,
// inked cell by cell.
import { C, X0, X1, row } from '../design.js'
import { cue } from '../timeline.js'
import { F } from '../data.js'
import { textBlock, revealWords } from '../lib/text.js'
import { paper, asciiLogo, inkLogo } from '../lib/ui.js'

export async function build(root, ctx) {
  const { tl, rand } = ctx
  paper(root)
  const tag = textBlock(root, {
    x: X0 - 4, k: 10, style: 'headline', color: C.text, role: 'caption', name: 'tagline',
    text: F('brand.tagline_short').replace('watches ', 'watches\n'),
  })
  tag.style.visibility = 'hidden'
  const cols = Math.max(...F('brand.logo').map((l) => [...l].length))
  const cw = (X1 - X0) / cols
  const logo = asciiLogo(root, { x: X0, y: row(13) + 20, cw, chh: cw * 2, color: C.text })
  logo.el.style.visibility = 'hidden'
  tl.set(tag, { autoAlpha: 1 }, cue('title.tagline')) // the question lands with the cut
  inkLogo(tl, logo, cue('title.logo'), 0.8, rand)
}
