// Tile PNG frames into one review sheet (sorted numerically by the time in the name).
//   node tools/tile.js <dir> <out.png> [cols=6] [width=360]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

export function tile(files, out, { cols = 6, width = 360, pad = 4 } = {}) {
  const rows = Math.ceil(files.length / cols)
  const list = path.join(path.dirname(out), `.${path.basename(out)}.txt`)
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f).replace(/\\/g, '/')}'\nduration 1`).join('\n') + '\n')
  const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=${width}:-2:flags=lanczos,tile=${cols}x${rows}:padding=${pad}:color=0x444444`, '-frames:v', '1', out])
  fs.rmSync(list)
  if (r.status !== 0) throw new Error(String(r.stderr))
  return out
}

if (process.argv[1] && process.argv[1].endsWith('tile.js')) {
  const [dir, out, cols = '6', width = '360'] = process.argv.slice(2)
  const num = (f) => Number((f.match(/\d+(\.\d+)?/) ?? ['0'])[0])
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('.'))
    .sort((a, b) => num(a) - num(b)).map((f) => path.join(dir, f))
  tile(files, out, { cols: Number(cols), width: Number(width) })
  console.log(out)
}
