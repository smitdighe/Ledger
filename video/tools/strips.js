// Motion strips for review: every 3rd frame across each transition / camera move,
// tiled, straight from the lossless master.   node tools/strips.js [build/video.mkv]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'out', 'qa')
const src = path.resolve(ROOT, process.argv[2] ?? 'build/video.mkv')

const RANGES = [
  ['hook-wrong', 4.8, 5.5], ['cut-problem', 5.8, 6.5], ['dumber', 8.0, 9.0], ['drift-mean', 9.4, 10.8],
  ['title', 11.9, 13.4], ['wipe-pipeline', 13.9, 14.7], ['cam1', 16.4, 17.9], ['cam2', 19.4, 21.1],
  ['meters', 21.0, 22.2], ['flag', 23.3, 24.0], ['cam3', 25.4, 27.1], ['swarm', 26.4, 29.4],
  ['cascade', 30.0, 32.2], ['clicks', 34.0, 35.7], ['zoom', 36.1, 37.7], ['c-reveal', 42.0, 43.3],
  ['refuses', 43.9, 44.4], ['ledger', 45.9, 48.8], ['cta', 49.9, 50.8], ['cta-end', 50.9, 53.2],
]

fs.mkdirSync(OUT, { recursive: true })
for (const [name, a, b] of RANGES) {
  const f0 = Math.round(a * 30)
  const f1 = Math.round(b * 30)
  const n = Math.floor((f1 - f0) / 3) + 1
  const cols = Math.min(8, n)
  const rows = Math.ceil(n / cols)
  const out = path.join(OUT, `strip-${name}.png`)
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf',
    `select='between(n\\,${f0}\\,${f1})*not(mod(n-${f0}\\,3))',scale=270:-1:flags=lanczos,tile=${cols}x${rows}:padding=4:color=0x444444`,
    '-frames:v', '1', '-fps_mode', 'passthrough', out])
  if (r.status !== 0) throw new Error(String(r.stderr))
  console.log(path.relative(ROOT, out))
}
