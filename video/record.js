// Frame-exact capture of video.html into a lossless master.
//
//   node record.js                      full length, DPR 2 (supersampled) -> build/video.mkv
//   node record.js --from 30 --to 42    one range -> build/seg-030.000-042.000.mkv
//   node record.js --draft              DPR 1
//   node record.js --every 3            every 3rd frame (motion checks), -> build/every3.mkv
//   node record.js --realtime           Playwright recordVideo preview (drops frames; never final)
//
// Each frame: __seek(i/30) -> PNG screenshot -> image2pipe into FFmpeg, which scales
// 2:1 with lanczos and stores FFV1 (bgr0).
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import ffmpegPath from 'ffmpeg-static'
import { serve } from './tools/serve.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(ROOT, 'build')
export const CHROME_ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars']

function args() {
  const a = process.argv.slice(2)
  const val = (k, d) => {
    const i = a.indexOf(k)
    return i >= 0 ? a[i + 1] : d
  }
  return {
    draft: a.includes('--draft'),
    realtime: a.includes('--realtime'),
    from: val('--from', null),
    to: val('--to', null),
    every: Number(val('--every', '1')),
    out: val('--out', null),
  }
}

export async function record({ from = 0, to = null, dpr = 2, every = 1, out, log = console.log }) {
  const srv = await serve(0)
  const browser = await chromium.launch({ args: CHROME_ARGS })
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await page.goto(`${srv.url}video.html`)
    await page.evaluate(() => window.__ready)
    const meta = await page.evaluate(() => window.__meta)
    const anims = await page.evaluate(() => document.getAnimations().length)
    if (anims !== 0) throw new Error(`document.getAnimations() = ${anims}, expected 0`)
    errors.push(...(await page.evaluate(() => window.__errors)))
    if (errors.length) throw new Error('console errors:\n' + errors.join('\n'))

    const fps = meta.fps
    const first = Math.round(from * fps)
    const last = Math.round((to ?? meta.duration) * fps) // exclusive
    const frames = []
    for (let i = first; i < last; i += every) frames.push(i)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const ff = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(fps / every), '-c:v', 'png', '-i', '-',
      '-vf', `scale=${meta.width}:${meta.height}:flags=lanczos`,
      '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'bgr0', '-r', String(fps / every), out], { stdio: ['pipe', 'inherit', 'inherit'] })
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))))
    const cdp = await ctx.newCDPSession(page)
    const t0 = Date.now()
    for (let k = 0; k < frames.length; k++) {
      const i = frames[k]
      await page.evaluate((t) => window.__seek(t), i / fps)
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
      const buf = Buffer.from(shot.data, 'base64')
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
      if (k % 60 === 0) log(`${path.basename(out)} frame ${i} (${k + 1}/${frames.length}) ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    }
    ff.stdin.end()
    await done
    errors.push(...(await page.evaluate(() => window.__errors)))
    if (errors.length) throw new Error('console errors during capture:\n' + errors.join('\n'))
    return { out, frames: frames.length }
  } finally {
    await browser.close()
    await srv.close()
  }
}

async function realtime() {
  const srv = await serve(0)
  const browser = await chromium.launch({ args: CHROME_ARGS })
  const dir = path.join(BUILD, 'realtime')
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, recordVideo: { dir, size: { width: 1080, height: 1350 } } })
  const page = await ctx.newPage()
  await page.goto(`${srv.url}video.html`)
  await page.evaluate(() => window.__ready)
  await page.evaluate(() => window.__play())
  await page.waitForTimeout(57_000)
  await ctx.close()
  await browser.close()
  await srv.close()
  console.log(`preview (drops frames, low bitrate; not for delivery): ${dir}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const a = args()
  const run = async () => {
    if (a.realtime) return realtime()
    const dpr = a.draft ? 1 : 2
    const from = a.from === null ? 0 : Number(a.from)
    const to = a.to === null ? null : Number(a.to)
    let out = a.out
    if (!out) {
      if (a.every > 1) out = path.join(BUILD, `every${a.every}.mkv`)
      else if (a.from !== null || a.to !== null) out = path.join(BUILD, `seg-${from.toFixed(3).padStart(7, '0')}-${(to ?? 56).toFixed(3).padStart(7, '0')}.mkv`)
      else out = path.join(BUILD, a.draft ? 'draft.mkv' : 'video.mkv')
    }
    const r = await record({ from, to, dpr, every: a.every, out: path.resolve(out) })
    console.log(`${path.relative(ROOT, r.out)}: ${r.frames} frames`)
  }
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
