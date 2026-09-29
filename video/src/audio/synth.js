// Score + sound design, synthesized with an OfflineAudioContext (48 kHz stereo).
// Everything is scheduled from src/timeline.js (bars, music sections, cues, typing)
// and every random choice comes from the seeded PRNG, so a render is reproducible.
import { BAR, BEAT, BARS, DURATION, MUSIC, PAD_OPEN, SFX, TYPING, CHARS_PER_TICK, bar, chordForBar } from '../timeline.js'
import { mulberry32 } from '../lib/prng.js'

export const SR = 48000

const NOTE = {
  F1: 43.654, Ab1: 51.913, Db2: 69.296, Eb2: 77.782, F2: 87.307, Ab2: 103.826,
  Eb3: 155.563, F3: 174.614, G3: 195.998, Ab3: 207.652, Bb3: 233.082, C4: 261.626, Db4: 277.183, F4: 349.228,
  F5: 698.456, Ab5: 830.609, C6: 1046.502, Eb6: 1244.508,
}
// close voicings for smooth voice leading around F3-C4; sub root sits in octave 2
const VOICING = {
  Fm: { pad: ['F3', 'Ab3', 'C4'], root: 'F2' },
  Db: { pad: ['F3', 'Ab3', 'Db4'], root: 'Db2' },
  Ab: { pad: ['Eb3', 'Ab3', 'C4'], root: 'Ab2' },
  Eb: { pad: ['Eb3', 'G3', 'Bb3'], root: 'Eb2' },
}
const DETUNE = [-7, 0, 7] // cents: three triangles per chord tone

const partsForBar = (n) => (MUSIC.find((m) => n >= m.from && n <= m.to)?.parts ?? [])

function noiseBuffer(ctx, rand, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1
  return b
}

function env(g, t, { a = 0.005, peak = 1, d = 0.2, floor = 0.0001 }) {
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(floor, t + a + d)
  g.gain.setValueAtTime(0, t + a + d + 0.001)
}

// ------------------------------------------------------------------ instruments
function kick(ctx, out, t, { f0 = 110, f1 = 42, dur = 0.28, level = 0.4 } = {}) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const g = ctx.createGain()
  env(g, t, { a: 0.002, peak: level, d: dur })
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function hat(ctx, out, noise, t, level, pan) {
  const s = ctx.createBufferSource()
  s.buffer = noise
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7000
  hp.Q.value = 0.7
  const g = ctx.createGain()
  env(g, t, { a: 0.001, peak: level, d: 0.035 })
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  s.connect(hp).connect(g).connect(p).connect(out)
  s.start(t, (t * 0.37) % 1.5)
  s.stop(t + 0.05)
}

function sub(ctx, out, t, freq, level) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = freq
  const g = ctx.createGain()
  env(g, t, { a: 0.004, peak: level, d: 0.2 })
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.23)
}

function padChord(ctx, out, t0, t1, chord, { level = 0.03, attack = 0.25, release = 0.35 } = {}) {
  for (const n of VOICING[chord].pad) {
    for (const cents of DETUNE) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = NOTE[n]
      o.detune.value = cents
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(level, t0 + attack)
      g.gain.setValueAtTime(level, t1)
      g.gain.linearRampToValueAtTime(0, t1 + release)
      o.connect(g).connect(out)
      o.start(t0)
      o.stop(t1 + release + 0.02)
    }
  }
}

function lowHit(ctx, out, noise, t) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = 55
  const g = ctx.createGain()
  env(g, t, { a: 0.004, peak: 0.42, d: 1.3 })
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 1.4)
  const s = ctx.createBufferSource()
  s.buffer = noise
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 180
  const gn = ctx.createGain()
  env(gn, t, { a: 0.002, peak: 0.2, d: 0.32 })
  s.connect(lp).connect(gn).connect(out)
  s.start(t, 0.2)
  s.stop(t + 0.4)
}

function click(ctx, out, noise, t) {
  // 3 ms noise burst through a 3.2 kHz band-pass + a 1.8 -> 0.9 kHz blip (~25 ms)
  const s = ctx.createBufferSource()
  s.buffer = noise
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3200
  bp.Q.value = 1.2
  const g = ctx.createGain()
  env(g, t, { a: 0.0005, peak: 0.55, d: 0.003 })
  s.connect(bp).connect(g).connect(out)
  s.start(t, 0.7)
  s.stop(t + 0.01)
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(1800, t)
  o.frequency.exponentialRampToValueAtTime(900, t + 0.025)
  const go = ctx.createGain()
  env(go, t, { a: 0.001, peak: 0.22, d: 0.024 })
  o.connect(go).connect(out)
  o.start(t)
  o.stop(t + 0.03)
}

function keyTick(ctx, out, noise, t, detune) {
  const s = ctx.createBufferSource()
  s.buffer = noise
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2600 * detune
  bp.Q.value = 3
  const g = ctx.createGain()
  env(g, t, { a: 0.0005, peak: 0.05, d: 0.012 }) // about -26 dBFS
  s.connect(bp).connect(g).connect(out)
  s.start(t, (t * 0.61) % 1.5)
  s.stop(t + 0.02)
}

function blip(ctx, out, t, note, pan) {
  const freqs = [NOTE.F5, NOTE.Ab5, NOTE.C6, NOTE.Eb6]
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = freqs[note]
  const g = ctx.createGain()
  env(g, t, { a: 0.003, peak: 0.16, d: 0.18 })
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  o.connect(g).connect(p).connect(out)
  o.start(t)
  o.stop(t + 0.2)
}

function riser(ctx, out, noise, t, dur) {
  const s = ctx.createBufferSource()
  s.buffer = noise
  s.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2
  bp.frequency.setValueAtTime(400, t)
  bp.frequency.exponentialRampToValueAtTime(6000, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.11, t + dur - 0.02)
  g.gain.linearRampToValueAtTime(0, t + dur)
  s.connect(bp).connect(g).connect(out)
  s.start(t)
  s.stop(t + dur + 0.01)
}

// ------------------------------------------------------------------ score
function scheduleMusic(ctx, out, noise) {
  const bus = ctx.createGain()
  bus.gain.value = 0.55
  // silence is a device: bar 22 is a hard hole; the piece stops cleanly at DURATION
  const s0 = bar(22)
  const s1 = bar(23)
  bus.gain.setValueAtTime(0.55, s0 - 0.004)
  bus.gain.linearRampToValueAtTime(0, s0)
  bus.gain.setValueAtTime(0, s1 - 0.001)
  bus.gain.linearRampToValueAtTime(0.55, s1)
  bus.gain.setValueAtTime(0.55, DURATION - 0.05)
  bus.gain.linearRampToValueAtTime(0, DURATION - 0.002)
  bus.connect(out)

  // pad through one low-pass that opens across the pipeline scene
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.4
  lp.frequency.setValueAtTime(PAD_OPEN.lo, 0)
  lp.frequency.setValueAtTime(PAD_OPEN.lo, PAD_OPEN.from)
  lp.frequency.exponentialRampToValueAtTime(PAD_OPEN.hi, PAD_OPEN.to)
  // the arc: a quiet pad alone, then the groove carries the lift
  const padBus = ctx.createGain()
  padBus.gain.setValueAtTime(0.5, 0)
  padBus.gain.setValueAtTime(0.5, bar(8))
  padBus.gain.linearRampToValueAtTime(0.8, bar(8) + 1)
  padBus.gain.setValueAtTime(0.8, bar(26))
  padBus.gain.linearRampToValueAtTime(0.95, bar(26) + 0.5)
  lp.connect(padBus).connect(bus)

  // sub pulse with a kick-keyed duck
  const subBus = ctx.createGain()
  subBus.gain.value = 1
  subBus.connect(bus)
  const drums = ctx.createGain()
  drums.gain.value = 1
  drums.connect(bus)

  let segStart = null
  let segChord = null
  const flushPad = (tEnd) => {
    if (segStart !== null) padChord(ctx, lp, segStart, tEnd, segChord)
    segStart = null
  }
  for (let n = 1; n <= BARS; n++) {
    const parts = partsForBar(n)
    const t = bar(n)
    const chord = chordForBar(n)
    // pad: merge consecutive bars of the same chord into one held segment
    if (parts.includes('pad') && n < BARS) {
      if (segStart === null || chord !== segChord) {
        flushPad(t)
        segStart = t
        segChord = chord
      }
    } else flushPad(t)
    const tick = parts.includes('tick')
    const hats = parts.includes('hat')
    for (let b = 0; b < 4; b++) {
      const tb = t + b * BEAT
      if (tick) hat(ctx, drums, noise, tb, 0.035, 0.12)
      if (hats) {
        hat(ctx, drums, noise, tb, 0.045, -0.15)
        hat(ctx, drums, noise, tb + BEAT / 2, 0.07, 0.15)
      }
      if (parts.includes('kick') && (b === 0 || b === 2) && n < BARS) {
        kick(ctx, drums, tb)
        subBus.gain.setValueAtTime(0.25, tb)
        subBus.gain.linearRampToValueAtTime(1, tb + 0.22)
      }
      if (parts.includes('pulse') && n < BARS) {
        const root = NOTE[VOICING[chord].root]
        sub(ctx, subBus, tb, root, 0.24)
        sub(ctx, subBus, tb + BEAT / 2, root, 0.17)
      }
    }
    if (parts.includes('heartbeat')) {
      kick(ctx, drums, t, { f0: 70, f1: 36, dur: 0.32, level: 0.4 })
      kick(ctx, drums, t + 0.25, { f0: 64, f1: 34, dur: 0.3, level: 0.26 })
    }
    if (parts.includes('final') && n === BARS) {
      kick(ctx, drums, t)
      padChord(ctx, lp, t, DURATION - 0.06, 'Fm', { level: 0.036, attack: 0.02, release: 0.04 })
      sub(ctx, subBus, t, NOTE.F2, 0.18)
    }
  }
  flushPad(bar(BARS))
}

function scheduleSfx(ctx, out, noise, rand) {
  const bus = ctx.createGain()
  bus.gain.value = 0.85
  bus.connect(out)
  for (const e of SFX) {
    if (e.kind === 'lowHit') lowHit(ctx, bus, noise, e.t)
    else if (e.kind === 'click') click(ctx, bus, noise, e.t)
    else if (e.kind === 'blip') blip(ctx, bus, e.t, e.note, (e.note - 1.5) * 0.12)
    else if (e.kind === 'riser') riser(ctx, bus, noise, e.t, e.dur)
  }
  // key ticks only while mono text prints: every CHARS_PER_TICK characters, +-8 % pitch
  for (const run of TYPING) {
    for (let i = 0; i < run.chars; i += CHARS_PER_TICK) {
      keyTick(ctx, bus, noise, run.t + i / run.cps, 1 + (rand() * 2 - 1) * 0.08)
    }
  }
}

export async function renderAudio({ music = true, sfx = true } = {}) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(DURATION * SR), sampleRate: SR })
  const rand = mulberry32(0xa0d10)
  const noise = noiseBuffer(ctx, rand, 2)
  // glue + peak control so loudness normalisation can stay linear:
  // compressor -> drive -> tanh soft clip -> trim
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -24
  comp.knee.value = 6
  comp.ratio.value = 4
  comp.attack.value = 0.002
  comp.release.value = 0.12
  const drive = ctx.createGain()
  drive.gain.value = 2.2
  const clip = ctx.createWaveShaper()
  const curve = new Float32Array(8193)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 1.2)
  clip.curve = curve
  clip.oversample = '4x'
  const trim = ctx.createGain()
  trim.gain.value = 0.5
  const master = ctx.createGain()
  master.gain.value = 1.0
  master.connect(comp).connect(drive).connect(clip).connect(trim).connect(ctx.destination)
  if (music) scheduleMusic(ctx, master, noise)
  if (sfx) scheduleSfx(ctx, master, noise, mulberry32(0x71c4))
  return ctx.startRendering()
}

/** 32-bit float WAV (interleaved) */
export function encodeWav(buf) {
  const ch = buf.numberOfChannels
  const n = buf.length
  const data = new Float32Array(n * ch)
  const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c))
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data[i * ch + c] = chans[c][i]
  const bytes = new ArrayBuffer(44 + data.byteLength)
  const v = new DataView(bytes)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + data.byteLength, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, ch, true)
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 4, true)
  v.setUint16(32, ch * 4, true); v.setUint16(34, 32, true)
  str(36, 'data'); v.setUint32(40, data.byteLength, true)
  new Float32Array(bytes, 44).set(data)
  return new Uint8Array(bytes)
}
