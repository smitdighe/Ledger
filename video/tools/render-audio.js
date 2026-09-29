// Render the score + SFX in-page (OfflineAudioContext, 48 kHz stereo), then master:
//   build/audio.wav      full mix (32-bit float)
//   build/audio_sfx.wav  SFX only
//   build/audio_norm.wav two-pass loudnorm I=-14 LUFS, TP=-1.5 dBTP, LRA=11 (24-bit)
//   build/audio_sfx_norm.wav  SFX stem with the full mix's gain (for final_nomusic.mp4)
// Optional: --music=<file> uses a licensed track instead of the synthesized score
// (trimmed to length, 0.5 s fades, the bar-22 silence kept) under the same SFX.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import { openPage } from './still.js'
import { DURATION, bar } from '../src/timeline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'build')
const LN = { I: -14, TP: -1.5, LRA: 11 }

export function ff(args, { capture = false } = {}) {
  console.log(`ffmpeg ${args.join(' ')}`)
  const r = spawnSync(ffmpegPath, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(r.stderr.slice(-3000))
  return capture ? r.stderr : ''
}

async function pull(page, opts, file) {
  const n = await page.evaluate((o) => window.__renderAudio(o), opts)
  const chunks = []
  const size = 4 << 20
  for (let off = 0; off < n; off += size) {
    chunks.push(Buffer.from(await page.evaluate(([o, s]) => window.__audioChunk(o, s), [off, size]), 'base64'))
  }
  fs.writeFileSync(file, Buffer.concat(chunks))
  console.log(`${path.relative(ROOT, file)} ${(n / 1e6).toFixed(1)} MB`)
}

export function measure(file) {
  const out = ff(['-i', file, '-af', `loudnorm=I=${LN.I}:TP=${LN.TP}:LRA=${LN.LRA}:print_format=json`, '-f', 'null', '-'], { capture: true })
  return JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1))
}

function normalize(src, dst) {
  const m = measure(src)
  ff(['-y', '-i', src, '-af',
    `loudnorm=I=${LN.I}:TP=${LN.TP}:LRA=${LN.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
    `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', dst])
  return m
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true })
  const musicArg = process.argv.find((a) => a.startsWith('--music='))?.slice(8)
  const { page, close, errors } = await openPage({ dpr: 1 })
  try {
    await pull(page, { music: false, sfx: true }, path.join(BUILD, 'audio_sfx.wav'))
    if (!musicArg) await pull(page, { music: true, sfx: true }, path.join(BUILD, 'audio.wav'))
  } finally {
    await close()
  }
  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'))

  if (musicArg) {
    // licensed track: trim, 0.5 s fades, keep the hard silence of bar 22, mix under the SFX
    const s0 = bar(22)
    const s1 = bar(23)
    const mid = (s0 + s1) / 2
    const half = (s1 - s0) / 2
    ff(['-y', '-i', path.resolve(ROOT, musicArg), '-i', path.join(BUILD, 'audio_sfx.wav'), '-filter_complex',
      `[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${DURATION},asetpts=N/SR/TB,` +
      `afade=t=in:d=0.5,afade=t=out:st=${DURATION - 0.5}:d=0.5,` +
      `volume='min(1,max(0,(abs(t-${mid})-${half})/0.03))':eval=frame[m];[m][1:a]amix=inputs=2:normalize=0[out]`,
      '-map', '[out]', '-c:a', 'pcm_f32le', path.join(BUILD, 'audio.wav')])
  }

  const m = normalize(path.join(BUILD, 'audio.wav'), path.join(BUILD, 'audio_norm.wav'))
  // the SFX-only stem gets exactly the gain the full mix received, so hits sit at the same level
  const gain = LN.I - Number(m.input_i)
  ff(['-y', '-i', path.join(BUILD, 'audio_sfx.wav'), '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:level=false`,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', path.join(BUILD, 'audio_sfx_norm.wav')])
  const after = measure(path.join(BUILD, 'audio_norm.wav'))
  fs.writeFileSync(path.join(BUILD, 'loudness.json'), JSON.stringify({ before: m, after, sfxGainDb: gain }, null, 2))
  console.log(`loudness: in ${m.input_i} LUFS / ${m.input_tp} dBTP -> out ${after.input_i} LUFS / ${after.input_tp} dBTP (LRA ${after.input_lra})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
