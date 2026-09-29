// Render still frames of video.html at given times.
//   node tools/still.js 5.2 24 44.5 [--out out/styleframes] [--dpr 2] [--prefix sf]
// DPR 2 captures are downscaled 2:1 with lanczos (same path as the final render).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import ffmpegPath from 'ffmpeg-static'
import { serve } from './serve.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CHROME_ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars']

export async function openPage({ dpr = 2, query = '' } = {}) {
  const srv = await serve(0)
  const browser = await chromium.launch({ args: CHROME_ARGS })
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${srv.url}video.html${query}`)
  await page.evaluate(() => window.__ready)
  const pageErrors = await page.evaluate(() => window.__errors)
  errors.push(...pageErrors)
  return { page, browser, srv, errors, close: async () => { await browser.close(); await srv.close() } }
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (name, d) => {
    const i = args.indexOf(name)
    if (i < 0) return d
    const v = args[i + 1]
    args.splice(i, 2)
    return v
  }
  const out = path.resolve(ROOT, opt('--out', 'out/stills'))
  const dpr = Number(opt('--dpr', '2'))
  const prefix = opt('--prefix', 't')
  fs.mkdirSync(out, { recursive: true })
  const times = args.map(Number)
  const { page, errors, close } = await openPage({ dpr })
  try {
    for (const t of times) {
      await page.evaluate((tt) => window.__seek(tt), t)
      const raw = path.join(out, `.${prefix}${t.toFixed(2)}@${dpr}x.png`)
      const dst = path.join(out, `${prefix}${t.toFixed(2)}.png`)
      await page.screenshot({ path: raw, animations: 'allow' })
      if (dpr !== 1) {
        const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', raw,
          '-vf', 'scale=1080:1350:flags=lanczos', dst])
        if (r.status !== 0) throw new Error(String(r.stderr))
        fs.rmSync(raw)
      } else fs.renameSync(raw, dst)
      console.log(path.relative(ROOT, dst))
    }
  } finally {
    await close()
  }
  if (errors.length) {
    console.error('page errors:\n' + errors.join('\n'))
    process.exitCode = 1
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('still.js')) {
  main()
}
