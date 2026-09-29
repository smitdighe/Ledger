// Final delivery from the lossless master + mastered audio.
//
//   node tools/encode.js            build/video.mkv + build/audio_norm.wav -> out/final.mp4
//   node tools/encode.js --concat   first join build/seg-*.mkv losslessly into build/video.mkv
//
// Also writes out/final_nomusic.mp4 (SFX-only remux), out/thumbnail.png ("Wrong." frame)
// and out/contact-sheet.png (1 fps tiles).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'build')
const OUT = path.join(ROOT, 'out')
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

function ff(args) {
  console.log(`ffmpeg ${args.join(' ')}`)
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`)
}

function concat() {
  const segs = fs.readdirSync(BUILD).filter((f) => /^seg-[\d.]+-[\d.]+\.mkv$/.test(f)).sort()
  if (!segs.length) throw new Error('no build/seg-*.mkv to join')
  const list = path.join(BUILD, 'segments.txt')
  fs.writeFileSync(list, segs.map((f) => `file '${f}'`).join('\n') + '\n')
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', rel(list), '-c', 'copy', 'build/video.mkv'])
}

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  if (process.argv.includes('--concat')) concat()
  for (const f of ['build/video.mkv', 'build/audio_norm.wav', 'build/audio_sfx_norm.wav']) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error(`missing ${f}`)
  }

  // the delivery encode, exactly as specified
  ff(['-y', '-i', 'build/video.mkv', '-i', 'build/audio_norm.wav', '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation', '-profile:v', 'high', '-level:v', '4.1',
    '-r', '30', '-g', '60', '-bf', '2', '-maxrate', '12M', '-bufsize', '24M',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', 'out/final.mp4'])

  // SFX-only version: same picture (stream copy), SFX stem at the full mix's gain
  ff(['-y', '-i', 'out/final.mp4', '-i', 'build/audio_sfx_norm.wav', '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest',
    'out/final_nomusic.mp4'])

  // thumbnail: the "Wrong." paper inversion, from the lossless master
  ff(['-y', '-ss', '5.5', '-i', 'build/video.mkv', '-frames:v', '1', 'out/thumbnail.png'])

  // contact sheet: one frame per second, 8 x 7
  ff(['-y', '-i', 'out/final.mp4', '-vf', 'fps=1,scale=270:-1:flags=lanczos,tile=8x7:padding=6:color=0x0b0e14',
    '-frames:v', '1', 'out/contact-sheet.png'])
  console.log('encoded: out/final.mp4, out/final_nomusic.mp4, out/thumbnail.png, out/contact-sheet.png')
}

main()
