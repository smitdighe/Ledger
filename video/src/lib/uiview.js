// A real-UI frame sequence (captured by tools/capture-ui.js) placed on the stage.
// The <img> src is a pure function of t through the capture's own frame table; the
// holder carries the camera (x, y, scale) so overlays can map UI rects to the stage.
import { UI, UIMAP } from '../data.js'
import { sequences } from './seq.js'
import { div } from './ui.js'

export function uiView(parent, name, { x, y, scale, visibleFrom, visibleTo, clip = null }) {
  const man = UI(name)
  const map = UIMAP(name)
  const wrap = div(parent, 'uiwrap', { position: 'absolute', left: '0px', top: '0px', width: '1080px', height: '1350px', overflow: 'hidden' })
  wrap.dataset.role = 'decor' // raster proof, audited separately from the video's own type
  wrap.dataset.name = `ui-${name}`
  const holder = div(wrap, 'uiholder', { position: 'absolute', left: '0px', top: '0px', transformOrigin: '0 0' })
  if (clip) {
    holder.style.clipPath = `inset(${clip.top}px ${man.size.w - clip.right}px ${man.size.h - clip.bottom}px ${clip.left}px)`
  }
  const img = document.createElement('img')
  img.alt = ''
  img.width = man.size.w
  img.height = man.size.h
  img.style.display = 'block'
  img.style.width = `${man.size.w}px`
  img.style.height = `${man.size.h}px`
  holder.appendChild(img)
  const files = man.files.map((f) => `assets/ui/${f}`)
  const n = files.length
  sequences.register({
    img,
    frames: files,
    frameAt: (t) => {
      if (t < visibleFrom - 1e-6 || t >= visibleTo - 1e-6) return -1
      const i = Math.round((t - man.start) * man.fps)
      if (man.timeline) return man.timeline[Math.max(0, Math.min(man.timeline.length - 1, i))]
      return Math.max(0, Math.min(n - 1, i)) // plain sequence: hold first/last frame outside its run
    },
  })
  const cam = { x, y, scale }
  /** stage rect of a UI rect (CSS px of the captured element) for a camera state */
  const toStage = (r, c = cam) => ({ x: c.x + r.x * c.scale, y: c.y + r.y * c.scale, w: r.w * c.scale, h: r.h * c.scale })
  const center = (r, c = cam) => {
    const s = toStage(r, c)
    return { x: s.x + s.w / 2, y: s.y + s.h / 2 }
  }
  return { wrap, holder, img, man, map, cam, toStage, center }
}
