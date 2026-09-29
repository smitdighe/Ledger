// QA gate. Every check must pass.
//
//   node tools/qa.js [facts|scan|page|probe|loudness|all]
//
// facts    every facts.json value is present at its cited source (file:line), computed
//          facts are recomputed
// scan     scene sources carry no technical literals of their own (numbers, snake_case,
//          dotted names, paths) outside F()/FX() lookups
// page     in-page audits at 4 samples/s: required text >= 30 px, contrast >= 4.5:1,
//          inside the safe area, no overlaps / clipping, no glyph outside the loaded
//          font subsets, a caption in every scene, caption dwell >= 0.4 s + 0.3 s/word
// probe    out/final.mp4: H.264 High, 1080x1350, yuv420p, BT.709 tags, 30/1 CFR,
//          frames = duration x 30, 55-57 s, AAC 48 kHz stereo, moov before mdat
// loudness integrated -14 +-1 LUFS, true peak <= -1 dBTP, no clipped samples
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { openPage } from './still.js'
import { SCENES, DURATION, FPS } from '../src/timeline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(ROOT, '..')
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ------------------------------------------------------------------ facts
function verifyFacts() {
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/facts.json'), 'utf8')).facts
  const bad = []
  for (const f of facts) {
    if (f.match === undefined) continue
    const m = f.source.match(/^(.*):(\d+)(?:-(\d+))?$/)
    if (!m) { bad.push(`${f.id}: unparsable source ${f.source}`); continue }
    const lines = fs.readFileSync(path.join(REPO, m[1]), 'utf8').split(/\r?\n/)
    const first = Number(m[2])
    const matches = Array.isArray(f.match) ? f.match : [f.match]
    matches.forEach((lit, k) => {
      const line = lines[first - 1 + k] ?? ''
      if (!line.includes(lit)) bad.push(`${f.id}: "${lit}" not on ${m[1]}:${first + k}`)
    })
  }
  // computed facts, recomputed
  const byId = Object.fromEntries(facts.map((f) => [f.id, f]))
  const git = spawnSync('git', ['-C', REPO, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).stdout.trim()
  if (git.replace(/^https?:\/\//, '').replace(/\.git$/, '') !== byId['brand.repo'].value) bad.push('brand.repo drifted')
  const tdir = path.join(REPO, 'backend/tests/integration')
  const tfiles = fs.readdirSync(tdir).filter((f) => /^test_.*\.py$/.test(f))
  const n = tfiles.reduce((a, f) => a + (fs.readFileSync(path.join(tdir, f), 'utf8').match(/^\s*(?:async\s+)?def test_/gm) ?? []).length, 0)
  if (n !== byId['tests.count'].value) bad.push(`tests.count ${n} != ${byId['tests.count'].value}`)
  if (tfiles.length !== byId['tests.files'].value) bad.push('tests.files drifted')
  const floor = +(byId['drift.baseline.faithfulness'].value - byId['drift.threshold'].value).toFixed(2)
  if (floor !== byId['drift.floor.faithfulness'].value) bad.push('drift floor drifted')
  const graph = fs.readFileSync(path.join(REPO, 'backend/app/agents/graph.py'), 'utf8')
  if ((graph.match(/g\.add_node\(/g) ?? []).length !== byId['swarm.node_count'].value) bad.push('node count drifted')
  check('facts: every value found at its source', bad.length === 0, bad.length ? bad.join('; ') : `${facts.length} facts`)
}

// ------------------------------------------------------------------ static scan
const TECH = /(\d|[a-z]_[a-z]|[A-Za-z]\.[A-Za-z]|\/[a-z]|[a-z][A-Z])/

/** every string literal / template fragment in a JS source, with the code just before it */
function literals(code) {
  const out = []
  let i = 0
  while (i < code.length) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue }
    if (c === '/' && code[i + 1] === '*') { i = code.indexOf('*/', i + 2) + 2; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      let s = ''
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') { s += code[j] + code[j + 1]; j += 2; continue } s += code[j++] }
      out.push({ frags: [s], ctx: code.slice(Math.max(0, i - 48), i) })
      i = j + 1
      continue
    }
    if (c === '`') {
      let j = i + 1
      let frag = ''
      const frags = []
      while (j < code.length && code[j] !== '`') {
        if (code[j] === '\\') { frag += code[j] + code[j + 1]; j += 2; continue }
        if (code[j] === '$' && code[j + 1] === '{') {
          frags.push(frag)
          frag = ''
          let depth = 1
          j += 2
          while (j < code.length && depth > 0) { if (code[j] === '{') depth++; else if (code[j] === '}') depth--; j++ }
          continue
        }
        frag += code[j++]
      }
      frags.push(frag)
      out.push({ frags, ctx: code.slice(Math.max(0, i - 48), i) })
      i = j + 1
      continue
    }
    i++
  }
  return out
}

function scanScenes() {
  const dir = path.join(ROOT, 'src/scenes')
  const bad = []
  // literals in these positions never reach the screen as copy: imports, fact / fixture /
  // cue lookups, object keys other than `text:`, DOM and error plumbing, comparisons
  const codeCtx = /(?:\b(?:from|import)\s*|\b(?:F|FX|cue|factSource|fileOf|finding|trailEntry|LOG|UI|UIMAP|uiView|svgEl|div|querySelector|createElement|setAttribute|replace|split|includes|indexOf|lastIndexOf|find|Error|glyph|getItem)\s*\(\s*(?:[\w.]+\s*,\s*)?|\b(?!text\b)[\w-]+\s*:\s*|['"][\w-]+['"]\s*:\s*|\.(?:dataset\.\w+|style\.\w+|className|textContent)\s*=\s*|[!=]==?\s*)$/
  const css = /(?:px|em|%|inset\(|translate|matrix|rgba?\(|#[0-9a-f]{3,6}\b)/
  const factIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/facts.json'), 'utf8')).facts.map((x) => x.id))
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const lit of literals(code)) {
      if (codeCtx.test(lit.ctx.trimEnd())) continue
      if (lit.frags.length === 1 && factIds.has(lit.frags[0])) continue // a fact id, looked up via F
      for (const raw of lit.frags) {
        const s = raw.replace(/\\n/g, ' ')
        if (!/\s|[.…?·→]/.test(s) || css.test(s)) continue // single identifiers and CSS are code, not copy
        const bits = s.split(/\s+/).filter(Boolean).filter((w) => TECH.test(w))
        if (bits.length) bad.push(`${f}: "${s.trim()}" (${bits.join(', ')})`)
      }
    }
  }
  check('scan: no technical literals in scene copy', bad.length === 0, bad.join('; '))
}

/** the vocabulary on-screen technical tokens may use: facts, fixtures, their source paths */
function allowedVocabulary() {
  const words = new Set()
  const nums = new Set()
  const addNum = (n) => { for (const d of [0, 1, 2, 3]) nums.add(Number(n).toFixed(d)); nums.add(String(n)) }
  const addStr = (s) => {
    words.add(s)
    for (const w of s.split(/[\s,;()[\]{}'"=]+/)) if (w) words.add(w.replace(/[.:…]+$/, ''))
    for (const n of s.match(/-?\d+(?:\.\d+)?/g) ?? []) addNum(n)
  }
  const walk = (v) => {
    if (v == null) return
    if (typeof v === 'number') addNum(v)
    else if (typeof v === 'string') addStr(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object') Object.values(v).forEach(walk)
  }
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/facts.json'), 'utf8')).facts
  for (const f of facts) {
    walk(f.value)
    const file = f.source.replace(/:.*$/, '')
    for (const p of [file, file.replace(/^backend\//, ''), file.replace(/^frontend\/src\//, '')]) words.add(p)
  }
  const fx = path.join(ROOT, 'data/fixtures')
  for (const f of fs.readdirSync(fx)) walk(JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8')))
  // derived on screen: the decision gap in scenario C (best - cross-domain runner-up)
  const C = JSON.parse(fs.readFileSync(path.join(fx, 'scenario_C.json'), 'utf8'))
  const dec = C.final.trail.find((e) => e.node === 'decision').data
  addNum(dec.best.confidence - dec.runner_up.confidence)
  for (const w of [...words]) { if (w.includes('/')) for (const p of w.split(/[/:]/)) words.add(p) }
  return { words, nums }
}

function tokenOk(tok, V) {
  const t = tok.replace(/^[([{"'·→]+|[)\]},;:"'.…]+$/g, '')
  if (!t || !TECH.test(t)) return true
  if (V.words.has(t)) return true
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return V.nums.has(t)
  const v = t.match(/^v(\d+)$/) ?? t.match(/^(\d+)-day$/) ?? t.match(/^(\d+)ms$/)
  if (v) return V.nums.has(v[1])
  if (t.includes('/')) return t.split('/').filter(Boolean).every((p) => V.words.has(p))
  return false
}

// ------------------------------------------------------------------ in-page audits
async function pageAudits() {
  const { page, close, errors } = await openPage({ dpr: 1 })
  const issues = []
  const seenCaption = new Map(SCENES.map((s) => [s.id, false]))
  const onScreen = new Set()
  const dwell = new Map()
  try {
    await page.evaluate(() => { window.__qa = true })
    const step = 1 / 4
    const fine = 1 / 10
    for (let t = 0; t < DURATION - 1e-6; t += fine) {
      const tt = Math.round(t * FPS) / FPS
      await page.evaluate((x) => window.__seek(x), tt)
      const deep = Math.abs(tt / step - Math.round(tt / step)) < 1e-6
      const r = await page.evaluate(auditFrame, { deep })
      for (const c of r.captions) {
        seenCaption.set(c.scene, true)
        const d = dwell.get(c.key) ?? { text: c.text, words: c.words, first: tt, last: tt, scene: c.scene }
        d.last = tt
        dwell.set(c.key, d)
      }
      for (const i of r.issues) issues.push(`t=${tt.toFixed(2)} ${i}`)
      for (const x of r.texts) onScreen.add(x)
    }
  } finally {
    await close()
  }
  const uniq = [...new Set(issues.map((s) => s.replace(/^t=\S+ /, '')))]
  if (process.env.QA_VERBOSE) console.log(uniq.join('\n'))
  check('page: size, contrast, safe area, overlap, clipping, glyphs', issues.length === 0,
    issues.length ? `${issues.length} hits; e.g. ${issues.slice(0, 8).join(' | ')} (unique: ${uniq.length})` : '')
  const missing = [...seenCaption].filter(([, v]) => !v).map(([k]) => k)
  check('page: every scene has a caption', missing.length === 0, missing.join(', '))
  const short = [...dwell.values()].filter((d) => d.last - d.first + 0.1 < 0.4 + 0.3 * d.words - 1e-6)
    .map((d) => `"${d.text}" ${(d.last - d.first + 0.1).toFixed(2)}s < ${(0.4 + 0.3 * d.words).toFixed(2)}s`)
  check('page: caption dwell >= 0.4 s + 0.3 s/word', short.length === 0, short.join('; '))
  check('page: zero console errors', errors.length === 0, errors.join('; '))
  const V = allowedVocabulary()
  const unknown = new Set()
  for (const text of onScreen) {
    for (const tok of text.split(/[\s·→]+/)) if (!tokenOk(tok, V)) unknown.add(`${tok} (in "${text.slice(0, 60)}")`)
  }
  check('page: every technical token on screen comes from facts/fixtures', unknown.size === 0, [...unknown].join('; '))
}

/* runs in the page */
function auditFrame({ deep }) {
  const stage = document.getElementById('stage')
  const S = stage.getBoundingClientRect()
  const SAFE = { l: 72, r: 1008, t: 96, b: 1180 }
  const out = { issues: [], captions: [], texts: [] }
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number)
  const effOpacity = (el) => {
    let o = 1
    for (let e = el; e && e !== stage; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0
      o *= Number(cs.opacity)
    }
    return o
  }
  const bgOf = (el) => {
    for (let e = el; e && e !== stage; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor)
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c.slice(0, 3)
      if (e.dataset?.layer === 'paper') return [230, 233, 239]
    }
    return [11, 14, 20]
  }
  const moving = (el) => [el, ...el.querySelectorAll('*')].some((e) => {
    const tf = getComputedStyle(e).transform
    if (!tf || tf === 'none') return false
    const m = tf.match(/matrix\(([^)]+)\)/)
    if (!m) return true
    const v = m[1].split(',').map(Number)
    const rot = Math.abs(v[1]) > 1e-3
    return !rot && (Math.abs(v[0] - 1) > 1e-3 || Math.abs(v[4]) > 0.5 || Math.abs(v[5]) > 0.5)
  })
  // ink-ish boxes: a text range's client rect is the font's content area (ascent+descent);
  // trim it to roughly ascender-to-descender so tight ledger rows don't read as overlaps
  const textRects = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const em = parseFloat(getComputedStyle(el).fontSize) * (el.getBoundingClientRect().height / Math.max(1, el.offsetHeight) || 1)
    return [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5)
      .map((r) => ({ l: r.left - S.left, r: r.right - S.left, t: r.top - S.top + 0.18 * em, b: r.bottom - S.top - 0.04 * em }))
  }
  const covered = (el, rect) => {
    const x = S.left + (rect.l + rect.r) / 2
    const y = S.top + (rect.t + rect.b) / 2
    const top = document.elementFromPoint(x, y)
    return top && !el.contains(top) && top !== el && !top.contains(el)
  }
  const els = [...stage.querySelectorAll('[data-role="required"], [data-role="caption"]')]
  const live = []
  // full text even while it prints (hidden chars count); <br> separates words
  const fullText = (el) => {
    const c = el.cloneNode(true)
    c.querySelectorAll('br').forEach((b) => b.replaceWith(' '))
    c.querySelectorAll('.ln').forEach((ln) => ln.after(' ')) // SplitText turns <br> lines into divs
    return c.textContent.replace(/\s+/g, ' ').trim()
  }
  for (const el of els) {
    const text = fullText(el)
    if (!text) continue
    const op = effOpacity(el)
    if (op < 0.99) continue
    const scene = el.closest('[data-scene]')?.dataset.scene
    out.texts.push(el.dataset.final ?? text)
    if (el.dataset.role === 'caption') {
      if (!moving(el)) out.captions.push({ key: `${scene}:${text}`, text, words: text.split(' ').length, scene })
    }
    if (!deep || moving(el)) continue
    const rects = textRects(el)
    if (!rects.length) continue
    const onStage = (r) => (r.l + r.r) / 2 > 0 && (r.l + r.r) / 2 < 1080 && (r.t + r.b) / 2 > 0 && (r.t + r.b) / 2 < 1350
    const visible = rects.filter((r) => onStage(r) && !covered(el, r))
    if (!visible.length) continue // under a HUD band or off the camera
    const box = visible.reduce((a, r) => ({ l: Math.min(a.l, r.l), r: Math.max(a.r, r.r), t: Math.min(a.t, r.t), b: Math.max(a.b, r.b) }))
    const name = el.dataset.name ?? text.slice(0, 24)
    const cs = getComputedStyle(el)
    const scale = el.getBoundingClientRect().height / Math.max(1, el.offsetHeight)
    const px = parseFloat(cs.fontSize) * scale
    if (px < 29.5) out.issues.push(`${name}: ${px.toFixed(1)}px < 30`)
    const fg = rgb(cs.color).slice(0, 3)
    const bg = bgOf(el)
    const L1 = lum(fg)
    const L2 = lum(bg)
    const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    if (cr < 4.5) out.issues.push(`${name}: contrast ${cr.toFixed(2)}`)
    if (box.l < SAFE.l - 1 || box.r > SAFE.r + 1 || box.t < SAFE.t - 24 || box.b > SAFE.b + 1) {
      out.issues.push(`${name}: outside safe area (${box.l.toFixed(0)},${box.t.toFixed(0)})-(${box.r.toFixed(0)},${box.b.toFixed(0)})`)
    }
    if (/[^\u0000-\u00ff\u0131\u0152\u0153\u2000-\u206f\u20ac\u2122\u2191\u2193\u2212\u2215]/u.test(el.textContent)) {
      out.issues.push(`${name}: glyph outside the loaded font subsets`)
    }
    live.push({ name, box, el })
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i].box
      const b = live[j].box
      if (live[i].el.contains(live[j].el) || live[j].el.contains(live[i].el)) continue
      const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l)
      const iy = Math.min(a.b, b.b) - Math.max(a.t, b.t)
      if (ix > 2 && iy > 4) out.issues.push(`overlap ${live[i].name} x ${live[j].name}`)
    }
  }
  return out
}

// ------------------------------------------------------------------ probe + loudness
function ffprobe(args) {
  const r = spawnSync(ffprobeStatic.path, ['-v', 'error', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  return JSON.parse(r.stdout)
}

function moovFirst(file) {
  const fd = fs.openSync(file, 'r')
  const size = fs.fstatSync(fd).size
  let off = 0
  const order = []
  const hdr = Buffer.alloc(16)
  while (off < size) {
    fs.readSync(fd, hdr, 0, 16, off)
    let len = hdr.readUInt32BE(0)
    const type = hdr.toString('latin1', 4, 8)
    if (len === 1) len = Number(hdr.readBigUInt64BE(8))
    order.push(type)
    if (len < 8) break
    off += len
  }
  fs.closeSync(fd)
  return order.indexOf('moov') >= 0 && order.indexOf('moov') < order.indexOf('mdat') ? order : null
}

function probe() {
  const file = path.join(ROOT, 'out/final.mp4')
  const j = ffprobe(['-show_streams', '-show_format', '-count_frames', '-of', 'json', file])
  const v = j.streams.find((s) => s.codec_type === 'video')
  const a = j.streams.find((s) => s.codec_type === 'audio')
  const dur = Number(j.format.duration)
  const frames = Number(v.nb_read_frames ?? v.nb_frames)
  const want = Math.round(Number(v.duration ?? dur) * FPS)
  check('probe: H.264 High', v.codec_name === 'h264' && v.profile === 'High', `${v.codec_name} ${v.profile}`)
  check('probe: 1080x1350 yuv420p', v.width === 1080 && v.height === 1350 && v.pix_fmt === 'yuv420p', `${v.width}x${v.height} ${v.pix_fmt}`)
  check('probe: BT.709 tags, tv range', v.color_space === 'bt709' && v.color_transfer === 'bt709' && v.color_primaries === 'bt709' && v.color_range === 'tv',
    `${v.color_space}/${v.color_transfer}/${v.color_primaries}/${v.color_range}`)
  check('probe: 30/1 CFR', v.r_frame_rate === '30/1' && v.avg_frame_rate === '30/1', `${v.r_frame_rate} avg ${v.avg_frame_rate}`)
  check('probe: frames = duration x 30', frames === want && frames === Math.round(DURATION * FPS), `${frames} frames, ${want} expected`)
  check('probe: duration 55-57 s', dur >= 55 && dur <= 57, `${dur}s`)
  check('probe: AAC 48 kHz stereo', a && a.codec_name === 'aac' && Number(a.sample_rate) === 48000 && a.channels === 2, a ? `${a.codec_name} ${a.sample_rate} ${a.channels}ch` : 'no audio')
  const order = moovFirst(file)
  check('probe: moov before mdat (+faststart)', !!order, order ? order.join(' > ') : '')
  // metadata may only carry what the muxer/encoder write themselves
  const allowed = { major_brand: /^isom$/, minor_version: /^\d+$/, compatible_brands: /^[a-z0-9]+$/, encoder: /^Lav[fc][\d.]+( libx264)?$/, language: /^und$/, handler_name: /^(Video|Sound)Handler$/, vendor_id: /^\[0\]\[0\]\[0\]\[0\]$/ }
  const extra = [j.format.tags, v.tags, a?.tags].flatMap((t) => Object.entries(t ?? {}))
    .filter(([k, val]) => !(allowed[k] && allowed[k].test(String(val))))
  check('probe: metadata carries only muxer/encoder tags', extra.length === 0, extra.map(([k, val]) => `${k}=${val}`).join(', '))
}

function loudness() {
  const file = path.join(ROOT, 'out/final.mp4')
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true+sample', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 })
  const s = r.stderr
  const I = Number(s.match(/Integrated loudness:\s+I:\s+(-?[\d.]+)/)[1])
  const tp = Number(s.match(/True peak:\s+Peak:\s+(-?[\d.]+)/)[1])
  const sp = Number(s.match(/Sample peak:\s+Peak:\s+(-?[\d.]+)/)[1])
  check('loudness: integrated -14 +-1 LUFS', Math.abs(I + 14) <= 1, `${I} LUFS`)
  check('loudness: true peak <= -1 dBTP', tp <= -1, `${tp} dBTP`)
  check('loudness: no clipping (sample peak < 0 dBFS)', sp < 0, `${sp} dBFS`)
}

async function main() {
  const what = process.argv[2] ?? 'all'
  if (what === 'facts' || what === 'all') verifyFacts()
  if (what === 'scan' || what === 'all') scanScenes()
  if (what === 'page' || what === 'all') await pageAudits()
  if (what === 'probe' || what === 'all') probe()
  if (what === 'loudness' || what === 'all') loudness()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
