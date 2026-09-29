// Builds the stage and ONE paused master timeline. Every visible property is a
// pure function of t: no CSS animation, no Date.now, no rAF loop, seeded PRNG only.
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase.js'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin.js'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin.js'
import { SplitText } from 'gsap/SplitText.js'
import { DURATION, FPS, WIDTH, HEIGHT, EASE, SCENES, DUR } from './timeline.js'
import { loadData } from './data.js'
import { initTokens, FONT_CHECKS } from './design.js'
import { mulberry32 } from './lib/prng.js'
import { sequences } from './lib/seq.js'
import * as hook from './scenes/s1_hook.js'
import * as problem from './scenes/s2_problem.js'
import * as title from './scenes/s3_title.js'
import * as pipeline from './scenes/s4_pipeline.js'
import * as router from './scenes/s5_router.js'
import * as autofix from './scenes/s6_autofix.js'
import * as refuses from './scenes/s7_refuses.js'
import * as cta from './scenes/s8_cta.js'

gsap.registerPlugin(CustomEase, DrawSVGPlugin, MotionPathPlugin, SplitText)
gsap.config({ force3D: false, nullTargetWarn: true })
for (const [name, [a, b, c, d]] of Object.entries(EASE)) {
  CustomEase.create(name, `M0,0 C${a},${b} ${c},${d} 1,1`)
}

const MODULES = { hook, problem, title, pipeline, router, autofix, refuses, cta }
const params = new URLSearchParams(location.search)
const errors = []
window.addEventListener('error', (e) => errors.push(String(e.message)))
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)))
window.__errors = errors

window.__meta = { duration: DURATION, fps: FPS, width: WIDTH, height: HEIGHT }

async function fontsReady() {
  await document.fonts.ready
  await Promise.all(FONT_CHECKS.map((f) => document.fonts.load(f, 'Ledger 0123456789 .,:·…−')))
  const ok = FONT_CHECKS.every((f) => document.fonts.check(f, 'Ledger 0123456789'))
  if (!ok) throw new Error('fonts not available: ' + FONT_CHECKS.filter((f) => !document.fonts.check(f)).join(', '))
}

async function build() {
  await loadData()
  initTokens()
  await fontsReady()
  const stage = document.getElementById('stage')
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
  const rand = mulberry32(0x1ed6e5)
  const ctx = { tl, stage, rand, scenes: {} }
  SCENES.forEach((sc, i) => {
    const next = SCENES[i + 1]
    // a row-insert wipes over the outgoing scene, which stays until it is covered
    sc.hideAt = next?.enter === 'wipe' ? sc.end + DUR.wipe : sc.end
  })
  for (const sc of SCENES) {
    const root = document.createElement('div')
    root.className = 'scene'
    root.dataset.scene = sc.id
    root.style.visibility = 'hidden'
    stage.appendChild(root)
    ctx.scenes[sc.id] = root
    await MODULES[sc.id].build(root, ctx, sc)
    tl.set(root, { autoAlpha: 1 }, sc.start)
    if (sc.enter === 'wipe') {
      tl.fromTo(root, { clipPath: 'inset(100% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.wipe, ease: 'move' }, sc.start)
      tl.set(root, { clipPath: 'none' }, sc.start + DUR.wipe)
    }
    if (sc.hideAt < DURATION) tl.set(root, { autoAlpha: 0 }, sc.hideAt)
  }
  tl.set({}, {}, DURATION) // pin the total duration
  // static images first, then the (large) UI sequences are fetched; they decode per seek
  await Promise.all([...stage.querySelectorAll('img:not([data-seq])')].map((i) => i.decode()))
  await sequences.preload()
  return { tl } // a GSAP timeline is a thenable: never resolve a promise with it directly
}

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
let master = null
let current = 0

window.__ready = build().then(({ tl }) => {
  master = tl
  // initialise every tween in timeline order, so random-access seeks are exact
  master.seek(DURATION, false)
  master.seek(0, false)
  gsap.ticker.sleep() // the master is only ever driven by __seek
  window.__timeline = master
  return true
})

// preview only (record.js --realtime): play in wall-clock time; frames will drop
window.__play = async () => {
  await window.__ready
  gsap.ticker.wake()
  gsap.ticker.add(() => { sequences.sync(master.time()) })
  master.play(0)
}

// audio is rendered in-page from the same timeline (typing cues exist only after build)
let wav = null
window.__renderAudio = async (opts) => {
  await window.__ready
  const { renderAudio, encodeWav } = await import('./audio/synth.js')
  wav = encodeWav(await renderAudio(opts))
  return wav.byteLength
}
window.__audioChunk = (offset, size) => {
  const part = wav.subarray(offset, offset + size)
  let s = ''
  for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000))
  return btoa(s)
}

window.__seek = async (t) => {
  await window.__ready
  current = Math.max(0, Math.min(DURATION, t))
  master.seek(current, false)
  await sequences.sync(current)
  await raf2()
  return current
}

window.__ready.then(async () => {
  const t = params.get('t')
  if (t !== null) await window.__seek(Number(t))
  if (params.has('dev')) {
    const dev = document.getElementById('dev')
    const scrub = document.getElementById('scrub')
    const clock = document.getElementById('clock')
    dev.hidden = false
    scrub.value = String(current)
    clock.textContent = current.toFixed(2)
    scrub.addEventListener('input', async () => {
      const v = Number(scrub.value)
      clock.textContent = v.toFixed(2)
      await window.__seek(v)
    })
  }
}).catch((e) => {
  errors.push(String(e?.stack ?? e))
  console.error(e)
})
