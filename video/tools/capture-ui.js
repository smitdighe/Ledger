// Capture the real Ledger UI (frontend/, unmodified) against the recorded fixtures.
//
//   node tools/capture-ui.js
//
// 1. starts the app's own Vite dev server on :5199 (npm --prefix ../frontend run dev)
// 2. serves every /api/v1 request from data/fixtures (fails on any unmatched route,
//    any "[api] schema mismatch" console error, any visible QueryError)
// 3. settled stills (reduced motion): HealthGauge, TierCascade, RecentIncidents,
//    the incident list, the swarm-graph cards
// 4. replay sequences under an installed, paused page clock that is advanced frame by
//    frame: incident B (step ▶, step ▶, ▶ play, then the app's own 750 ms tick),
//    incident C (replay slider), the TierCascade fall (simulated-outage fixture).
//    The CSS timeline is frozen over CDP and each transition is placed at its exact
//    local time; the SMIL edge pulse is set per frame with setCurrentTime.
// 5. writes assets/ui/manifest.json (frame tables keyed to the video timeline) and
//    assets/ui/ui-map.json (element rects for the cursor, focus masks and callouts).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { cue, FPS, SCENES } from '../src/timeline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = path.resolve(ROOT, '..', 'frontend')
const FIX = path.join(ROOT, 'data', 'fixtures')
const OUT = path.join(ROOT, 'assets', 'ui')
const PORT = 5199
const BASE = `http://localhost:${PORT}`
const T0 = new Date('2026-09-29T14:00:00Z') // fixed page clock
const CHROME_ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars']
const TRANSITION = 0.25 // NodeShell: opacity/transform 0.25s ease-out

const failures = []
const fail = (msg) => failures.push(msg)
const read = (name) => JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf8'))
const API = {
  health: read('api_health').body,
  tiers: read('api_health_tiers').body,
  router: read('api_router_config').body,
  incidents: read('api_incidents').body,
  recent: read('api_incidents_recent').body,
  A: read('api_incident_A').body,
  B: read('api_incident_B').body,
  C: read('api_incident_C').body,
}
const BY_ID = { [API.A.id]: API.A, [API.B.id]: API.B, [API.C.id]: API.C }

/** Simulated outage for the cascade fall: upstream probes failed, the floor is up. */
function outageFixture() {
  const body = structuredClone(API.router)
  for (const t of body.tiers) {
    t.available = true
    t.cached_health = t.tier === 'ollama'
  }
  const out = {
    _provenance: 'simulated-outage',
    _how: 'api_router_config.json with every tier available and cached_health set: cerebras/groq/gemini false '
      + '(failed probe), ollama true. Not a recorded state; captions phrase it conditionally.',
    status: 200,
    body,
  }
  fs.writeFileSync(path.join(FIX, 'ui_router_outage.json'), JSON.stringify(out, null, 2) + '\n')
  return body
}

// ------------------------------------------------------------------ dev server
function startDevServer() {
  const env = {
    ...process.env,
    // process env beats frontend/.env*: same-origin /api and the harness admin key
    VITE_API_BASE_URL: '',
    VITE_API_KEY: 'video-admin',
    VITE_POLL_INTERVAL_MS: '5000',
    BROWSER: 'none',
  }
  const child = spawn(`npm --prefix "${FRONTEND}" run dev -- --port ${PORT} --strictPort`, {
    cwd: ROOT, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let log = ''
  child.stdout.on('data', (d) => { log += d })
  child.stderr.on('data', (d) => { log += d })
  const stop = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  }
  return { child, stop, log: () => log }
}

async function waitForServer(srv, ms = 120_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (srv.child.exitCode !== null) throw new Error('dev server exited:\n' + srv.log())
    try {
      const r = await fetch(BASE + '/')
      if (r.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('dev server did not start:\n' + srv.log())
}

// ------------------------------------------------------------------ page plumbing
// capture-only CSS: container sizing (a taller swarm canvas); components are untouched
const CAPTURE_CSS = (canvasH) => (canvasH ? `div[class~="sm:h-[440px]"] { height: ${canvasH}px !important; }` : '')

async function newPage(browser, { width, height, reducedMotion, router = API.router, canvasH = null, clock = 'fixed', dpr = 3 }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: dpr, locale: 'en-US', timezoneId: 'UTC',
    colorScheme: 'dark', reducedMotion,
  })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('[api] schema mismatch')) fail(`schema mismatch: ${m.text()}`)
  })
  page.on('pageerror', (e) => fail(`pageerror: ${e}`))
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname.replace(/^.*\/api\/v1/, '')
    let body = null
    if (req.method() === 'GET') {
      if (p === '/health') body = API.health
      else if (p === '/health/tiers') body = API.tiers
      else if (p === '/router/config') body = router
      // limit-only endpoint with 4 rows in the fixture DB: every limit >= 4 returns the same page
      else if (p === '/incidents') body = url.searchParams.get('limit') === '5' ? API.recent : API.incidents
      else {
        const m = p.match(/^\/incidents\/([0-9a-f-]{36})$/)
        if (m) body = BY_ID[m[1]]
      }
    }
    if (!body) {
      fail(`unmatched route: ${req.method()} ${url.pathname}${url.search}`)
      return route.abort()
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const css = CAPTURE_CSS(canvasH)
  if (css) {
    await ctx.addInitScript((c) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style')
        s.dataset.capture = '1'
        s.textContent = c
        document.head.appendChild(s)
      })
    }, css)
  }
  if (clock === 'fixed') await page.clock.setFixedTime(T0)
  else {
    await page.clock.install({ time: T0 })
    await page.clock.pauseAt(new Date(T0.getTime() + 1000))
  }
  return { ctx, page }
}

async function assertNoQueryError(page, where) {
  const n = await page.locator('button:has-text("Retry")').count()
  if (n) fail(`visible QueryError on ${where}`)
}

const card = (page, title) =>
  page.locator('div.rounded-card').filter({ has: page.locator(':scope > div.border-b', { hasText: new RegExp(`^${title}`) }) })

function relRect(box, r) {
  return { x: +(r.x - box.x).toFixed(2), y: +(r.y - box.y).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
}

// ------------------------------------------------------------------ stills
async function stills(browser) {
  const dir = path.join(OUT, 'stills')
  fs.mkdirSync(dir, { recursive: true })
  const { ctx, page } = await newPage(browser, { width: 1440, height: 1500, reducedMotion: 'reduce' })
  await page.goto(BASE + '/')
  await card(page, 'Tier Cascade').getByText('ollama').first().waitFor()
  await card(page, 'System Health').getByText('tiers up').waitFor()
  await card(page, 'Recent Incidents').getByText('swarm-mixed').waitFor()
  await assertNoQueryError(page, '/')
  for (const [title, file] of [['System Health', 'health-gauge'], ['Tier Cascade', 'tier-cascade'], ['Recent Incidents', 'recent-incidents']]) {
    await card(page, title).screenshot({ path: path.join(dir, `${file}.png`), animations: 'disabled' })
  }
  await page.goto(BASE + '/incidents')
  await card(page, 'Incidents').getByText('swarm-mixed').waitFor()
  await assertNoQueryError(page, '/incidents')
  await card(page, 'Incidents').screenshot({ path: path.join(dir, 'incident-list.png'), animations: 'disabled' })
  for (const k of ['A', 'B', 'C']) {
    await page.goto(`${BASE}/incidents/${API[k].id}`)
    await card(page, 'Diagnostic Swarm').locator('.react-flow__node').first().waitFor()
    await page.waitForTimeout(400)
    await assertNoQueryError(page, `/incidents/${k}`)
    await card(page, 'Diagnostic Swarm').screenshot({ path: path.join(dir, `swarm-${k}.png`), animations: 'disabled' })
  }
  await ctx.close()
}

// ------------------------------------------------------------------ swarm sequences
/** With the page clock paused, React Query's setTimeout(0) notifications only flush
 *  when the clock moves: pump it in 4 ms steps until the condition holds. */
async function pumpUntil(page, cond, what, maxIter = 1500) {
  let advanced = 0
  for (let i = 0; i < maxIter; i++) {
    if (await cond()) return advanced
    await page.clock.runFor(4)
    advanced += 4
    await page.waitForTimeout(5)
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function readyFlow(page, loc, expectNodes) {
  await loc.locator('.react-flow__node').nth(expectNodes - 1).waitFor({ state: 'attached' })
  let advanced = 0
  for (let i = 0; i < 40; i++) {
    const tf = await loc.locator('.react-flow__viewport').evaluate((e) => getComputedStyle(e).transform)
    if (tf && tf !== 'none' && tf !== 'matrix(1, 0, 0, 1, 0, 0)') return advanced
    await page.waitForTimeout(25)
    if (i > 4) {
      await page.clock.runFor(8)
      advanced += 8
    }
  }
  throw new Error('react flow viewport never fitted')
}

async function uiRects(loc) {
  const box = await loc.boundingBox()
  const rects = await loc.evaluate((el) => {
    const q = (sel) => [...el.querySelectorAll(sel)]
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } }
    const btn = (label) => { const b = q('button').find((x) => x.getAttribute('aria-label') === label); return b ? r(b) : null }
    return {
      stepForward: btn('Step forward'),
      stepBack: btn('Step back'),
      play: btn('Play replay') ?? btn('Pause replay'),
      restart: btn('Restart replay'),
      slider: (() => { const s = el.querySelector('input[type="range"]'); return s ? r(s) : null })(),
      canvas: (() => { const s = el.querySelector('.react-flow'); return s ? r(s) : null })(),
      nodes: Object.fromEntries(q('.react-flow__node').map((n) => [n.dataset.id, r(n.firstElementChild ?? n)])),
    }
  })
  const rel = (v) => (v ? relRect(box, v) : null)
  return {
    size: { w: +box.width.toFixed(2), h: +box.height.toFixed(2) },
    stepForward: rel(rects.stepForward), stepBack: rel(rects.stepBack), play: rel(rects.play),
    restart: rel(rects.restart), slider: rel(rects.slider), canvas: rel(rects.canvas),
    nodes: Object.fromEntries(Object.entries(rects.nodes).map(([k, v]) => [k, rel(v)])),
  }
}

const REVEALED = `(() => {
  const root = document.querySelector('[data-capture-card]')
  const span = [...root.querySelectorAll('span')].find((e) => /^\\d+\\/\\d+$/.test(e.textContent.trim()))
  return span ? Number(span.textContent.trim().split('/')[0]) : -1
})()`

// nodes whose NodeShell is switched on (the reveal effect commits after the counter)
const VISIBLE_NODES = `(() => [...document.querySelector('[data-capture-card]').querySelectorAll('.react-flow__node')]
  .filter((n) => n.firstElementChild && n.firstElementChild.style.visibility === 'visible').length)()`

async function waitRevealed(page, n) {
  const t0 = Date.now()
  while (Date.now() - t0 < 10_000) {
    if ((await page.evaluate(REVEALED)) === n && (await page.evaluate(VISIBLE_NODES)) === n) return
    await page.waitForTimeout(15)
  }
  throw new Error(`replay never reached ${n}`)
}

/**
 * Walk the video frames of one UI section in order. The page clock is paused and
 * advanced to each frame's time; interactions fire at their cue times; every CSS
 * transition sits at its exact local time; the SMIL pulse follows the section clock.
 * Identical settled frames share one file.
 */
async function captureSwarm(browser, { name, incident, width, height, canvasH, dpr, start, end, events }) {
  const dir = path.join(OUT, 'seq', name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const { ctx, page } = await newPage(browser, { width, height, reducedMotion: 'no-preference', canvasH, clock: 'paused', dpr })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
  await page.goto(`${BASE}/incidents/${incident.id}`)
  const loc = card(page, 'Diagnostic Swarm')
  const nodeCount = incident.diagnostic_trail.trail.filter((e) => e.node !== 'decision').length
  // the section clock starts when the swarm graph mounts
  await pumpUntil(page, async () => (await loc.locator('.react-flow__node').count()) >= nodeCount, `${name} swarm graph`)
  const settleMs = await readyFlow(page, loc, nodeCount)
  await loc.evaluate((e) => e.setAttribute('data-capture-card', ''))
  await assertNoQueryError(page, `/incidents/${name}`)
  await page.evaluate(() => {
    window.__seen = new Set(document.getAnimations())
    window.__groups = []
  })
  if ((await page.evaluate(REVEALED)) !== 1) throw new Error(`${name}: replay advanced before the first interaction`)

  let fake = settleMs // page-clock ms since the app mounted (section start)
  const advance = async (toMs) => {
    if (toMs > fake + 0.01) {
      await page.clock.runFor(toMs - fake)
      fake = toMs
    }
  }
  const groups = []
  const clicks = [] // where each clicked control really was at click time (labels change widths)
  let ev = 0
  let state = 1
  const files = []
  const index = new Map()
  const timeline = []
  const n = Math.round((end - start) * FPS)
  for (let i = 0; i < n; i++) {
    const t = start + i / FPS
    while (ev < events.length && events[ev].t <= t + 1e-9) {
      const e = events[ev]
      await advance((e.t - start) * 1000)
      if (e.target) {
        const box = await loc.boundingBox()
        const b = await loc.getByRole('button', { name: e.target }).boundingBox()
        clicks.push({ t: e.t, target: e.target, ...relRect(box, b) })
      }
      if (e.act) await e.act(page, loc)
      if (e.state !== state) {
        await waitRevealed(page, e.state)
        state = e.state
        await page.evaluate((tt) => {
          const fresh = document.getAnimations().filter((a) => !window.__seen.has(a))
          fresh.forEach((a) => window.__seen.add(a))
          window.__groups.push({ t: tt, anims: fresh })
        }, e.t)
        groups.push(e.t)
      }
      ev += 1
    }
    await advance((t - start) * 1000)
    const beforeFirst = events.length && t < events[0].t - 1e-9
    const moving = groups.some((g) => t - g < TRANSITION - 1e-9) || beforeFirst
    const smil = t - start
    const phase = Math.round(smil * FPS) % Math.round(1.4 * FPS)
    const key = moving ? `f${i}` : `s${state}-p${phase}`
    if (!index.has(key)) {
      await page.evaluate(({ t, smil }) => {
        for (const g of window.__groups) {
          for (const a of g.anims) {
            const local = (t - g.t) * 1000
            const endT = a.effect.getComputedTiming().endTime
            if (local >= endT) a.finish()
            else a.currentTime = Math.max(0, local)
          }
        }
        for (const s of document.querySelector('[data-capture-card]').querySelectorAll('svg')) {
          if (s.pauseAnimations) {
            s.pauseAnimations()
            s.setCurrentTime(smil)
          }
        }
      }, { t, smil })
      const file = `seq/${name}/${String(files.length).padStart(4, '0')}.png`
      await loc.screenshot({ path: path.join(OUT, file), animations: 'allow' })
      index.set(key, files.length)
      files.push(file)
    }
    timeline.push(index.get(key))
  }
  await page.evaluate(() => { for (const g of window.__groups) for (const a of g.anims) a.finish() })
  const rects = { ...(await uiRects(loc)), clicks }
  await ctx.close()
  return { start, end, fps: FPS, dpr, size: rects.size, files, timeline, rects }
}

// ------------------------------------------------------------------ cascade fall
async function captureCascade(browser, outage) {
  const name = 'cascade'
  const dir = path.join(OUT, 'seq', name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const dpr = 3
  const { ctx, page } = await newPage(browser, { width: 768, height: 1200, reducedMotion: 'no-preference', router: outage, clock: 'paused', dpr })
  await page.goto(BASE + '/')
  const loc = card(page, 'Tier Cascade')
  // frame 0 is the first frame the tiers (and the falling signal) exist
  await pumpUntil(page, async () => (await loc.getByText('ollama').count()) > 0, 'tier cascade')
  await assertNoQueryError(page, '/ (cascade)')
  await loc.evaluate((e) => e.setAttribute('data-capture-card', ''))
  const files = []
  const total = 54 // 1.8 s: the 1.5 s fall plus a settle
  for (let i = 0; i < total; i++) {
    if (i > 0) await page.clock.runFor(1000 / FPS)
    await page.waitForTimeout(20)
    const file = `seq/${name}/${String(i).padStart(4, '0')}.png`
    await loc.screenshot({ path: path.join(OUT, file), animations: 'allow' })
    files.push(file)
  }
  const box = await loc.boundingBox()
  const rows = await loc.evaluate((el) => [...el.querySelectorAll('span.font-mono.text-sm')].map((s) => {
    const tile = s.closest('div.rounded-card') ?? s
    const b = tile.getBoundingClientRect()
    return { tier: s.textContent.trim(), x: b.x, y: b.y, width: b.width, height: b.height }
  }))
  await ctx.close()
  return {
    start: cue('router.fall'), fps: FPS, dpr, size: { w: +box.width.toFixed(2), h: +box.height.toFixed(2) }, files,
    rows: rows.map((r) => ({ tier: r.tier, ...relRect(box, r) })),
  }
}

// ------------------------------------------------------------------ main
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const outage = outageFixture()
  const srv = startDevServer()
  let browser
  try {
    await waitForServer(srv)
    browser = await chromium.launch({ args: CHROME_ARGS })
    await stills(browser)

    const fix = SCENES.find((s) => s.id === 'autofix')
    const ref = SCENES.find((s) => s.id === 'refuses')
    const B = await captureSwarm(browser, {
      name: 'B', incident: API.B, width: 1000, height: 1100, canvasH: 560, dpr: 3,
      start: fix.start, end: fix.end,
      events: [
        { t: cue('fix.click1'), state: 2, target: 'Step forward', act: (page, loc) => loc.getByRole('button', { name: 'Step forward' }).click() },
        { t: cue('fix.click2'), state: 3, target: 'Step forward', act: (page, loc) => loc.getByRole('button', { name: 'Step forward' }).click() },
        { t: cue('fix.click3'), state: 3, target: 'Play replay', act: (page, loc) => loc.getByRole('button', { name: 'Play replay' }).click() },
        { t: cue('fix.reveal'), state: 4, act: null }, // the app's own 750 ms interval fires
      ],
    })
    // C: the replay slider is scrubbed one step per 8th note (a native input event,
    // exactly what dragging the range does)
    const scrub = (to) => (page, loc) => loc.locator('input[type="range"]').evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, to)
    const C = await captureSwarm(browser, {
      name: 'C', incident: API.C, width: 1540, height: 1000, canvasH: 470, dpr: 2,
      start: ref.start, end: cue('ref.invert'),
      events: [0, 1, 2, 3].map((k) => ({ t: cue('ref.reveal') + k * 0.25, state: k + 2, act: scrub(k + 2) })),
    })
    const cascade = await captureCascade(browser, outage)

    const strip = ({ rects, rows, ...rest }) => rest
    const manifest = {
      generated_by: 'video/tools/capture-ui.js',
      frontend: 'frontend/ (unmodified) on its Vite dev server; every /api/v1 response from data/fixtures',
      page_clock: T0.toISOString(),
      B: strip(B), C: strip(C), cascade: strip(cascade),
    }
    const uiMap = {
      note: 'CSS px relative to the captured element; multiply by dpr for image px',
      B: { dpr: B.dpr, ...B.rects }, C: { dpr: C.dpr, ...C.rects },
      cascade: { dpr: cascade.dpr, size: cascade.size, rows: cascade.rows },
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    fs.writeFileSync(path.join(OUT, 'ui-map.json'), JSON.stringify(uiMap, null, 2) + '\n')
    console.log(`B ${B.files.length} files, C ${C.files.length} files, cascade ${cascade.files.length} files`)
  } finally {
    await browser?.close()
    srv.stop()
  }
  if (failures.length) {
    console.error('capture FAILED:\n' + failures.join('\n'))
    process.exit(1)
  }
  console.log('capture ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
