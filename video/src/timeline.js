// Single source of truth for time. Visuals (scenes) and audio (src/audio) both read
// BPM, the bar grid, the scene table and the cue list from here.

export const BPM = 120
export const FPS = 30
export const WIDTH = 1080
export const HEIGHT = 1350
export const BEAT = 60 / BPM // 0.5 s = 15 frames
export const BAR = BEAT * 4 // 2 s
export const BARS = 28

/** Absolute time of bar n (1-based), beat b (1-based), plus a fraction of a beat. */
export const bar = (n, b = 1, frac = 0) => (n - 1) * BAR + (b - 1) * BEAT + frac * BEAT
/** Absolute time of the i-th beat (0-based) from the top. */
export const beat = (i) => i * BEAT
export const DURATION = bar(BARS + 1) // 56.0

export const EASE = {
  enter: [0.16, 1, 0.3, 1],
  exit: [0.7, 0, 0.84, 0],
  move: [0.65, 0, 0.35, 1],
}
export const DUR = { enter: 0.5, exit: 0.3, camera: 1.5, stagger: 0.05, wipe: 0.5 }

export const SCENES = [
  { id: 'hook', title: 'HOOK', start: bar(1), end: bar(4), color: 'red', enter: 'cut' },
  { id: 'problem', title: 'PROBLEM', start: bar(4), end: bar(7), color: 'red', enter: 'cut' },
  { id: 'title', title: 'TITLE', start: bar(7), end: bar(8), color: 'neutral', enter: 'cut' },
  { id: 'pipeline', title: 'PIPELINE', start: bar(8), end: bar(16), color: 'red', enter: 'wipe' },
  { id: 'router', title: 'ROUTER', start: bar(16), end: bar(18), color: 'green', enter: 'cut' },
  { id: 'autofix', title: 'AUTO-FIX', start: bar(18), end: bar(22), color: 'green', enter: 'cut' },
  { id: 'refuses', title: 'REFUSES TO GUESS', start: bar(22), end: bar(26), color: 'amber', enter: 'cut' },
  { id: 'cta', title: 'CTA', start: bar(26), end: bar(29), color: 'green', enter: 'wipe' },
]

// Music sections by bar (inclusive). Silence is a device: bar 22 is empty.
export const MUSIC = [
  { from: 1, to: 3, parts: ['pad', 'tick'] },
  { from: 4, to: 7, parts: ['pad', 'tick', 'pulse'] },
  { from: 8, to: 21, parts: ['pad', 'hat', 'pulse', 'kick'] },
  { from: 22, to: 22, parts: [] },
  { from: 23, to: 25, parts: ['heartbeat'] },
  { from: 26, to: 28, parts: ['pad', 'hat', 'pulse', 'kick', 'final'] },
]
// i–VI–III–VII in F minor, one chord per 2 bars; the last bar resolves to i.
export const CHORDS = ['Fm', 'Db', 'Ab', 'Eb']
// the CTA leans on VII for two bars and resolves to i on the last bar
export const chordForBar = (n) => (n >= BARS ? 'Fm' : n >= 26 ? 'Eb' : CHORDS[Math.floor((n - 1) / 2) % 4])
// pad low-pass: 900 Hz until the pipeline, opening to 2.4 kHz by its end
export const PAD_OPEN = { from: bar(8), to: bar(16), lo: 900, hi: 2400 }

// ---------------------------------------------------------------------------
// Cue list. `t` in seconds. `sfx` cues are the only non-tick sound events;
// `type` cues describe mono text printing (key ticks every 3 chars).
// ---------------------------------------------------------------------------
export const CUES = {
  // 1 HOOK
  'hook.q': bar(1, 2, 0.5), // 0.75
  'hook.ctx': bar(1, 4, 0.5), // 1.75
  'hook.chip': bar(2, 2), // 2.50
  'hook.fast': bar(2, 4), // 3.50
  'hook.confident': bar(3, 1), // 4.00
  'hook.wrong': bar(3, 3), // 5.00
  // 2 PROBLEM
  'problem.in': bar(4, 1),
  'problem.dumber': bar(5, 1),
  'problem.underline': bar(5, 2),
  'problem.floor': bar(5, 4),
  'problem.mean': bar(5, 4),
  'problem.stamp': bar(6, 2),
  // 3 TITLE
  'title.tagline': bar(7, 1),
  'title.logo': bar(7, 2),
  // 4 PIPELINE
  'pipe.in': bar(8, 1),
  'pipe.cap1': bar(8, 1, 0.5),
  'pipe.post': bar(8, 2),
  'pipe.accepted': bar(9, 1, 0.5),
  'pipe.queue': bar(9, 2),
  'pipe.cam1': bar(9, 2),
  'pipe.store': bar(9, 3, 0.2), // 17.1: the next node rides in with the camera
  'pipe.cap2': bar(10, 1),
  'pipe.fork': bar(10, 1, 0.5),
  'pipe.evaldelay': bar(10, 4),
  'pipe.cam2': bar(10, 4),
  'pipe.meters': bar(11, 3),
  'pipe.judge': bar(11, 4),
  'pipe.cap3': bar(11, 4, 0.5), // 21.75
  'pipe.rule': bar(12, 1), // 22.0: prints out before the stamp lands
  'pipe.flag': bar(12, 4),
  'pipe.reasons': bar(12, 4, 0.5),
  'pipe.dispatch': bar(13, 4),
  'pipe.cam3': bar(13, 4),
  'pipe.cap4': bar(14, 1),
  'pipe.swarm': bar(14, 2),
  'pipe.tools': bar(15, 1),
  // 5 ROUTER
  'router.in': bar(16, 1),
  'router.cap': bar(16, 1, 0.5),
  'router.fall': bar(16, 2),
  'router.floor': bar(17, 1),
  'router.judge': bar(17, 2),
  // 6 AUTO-FIX
  // the app mounts at fix.in and auto-plays at 750 ms; the first click lands before that tick
  'fix.in': bar(18, 1), // 34.0
  'fix.cursor': bar(18, 1), // cursor glides in 34.0-34.4
  'fix.click1': bar(18, 2), // 34.5 step
  'fix.click2': bar(18, 3), // 35.0 step
  'fix.toPlay': bar(18, 3, 0.2), // 35.1 cursor to play
  'fix.click3': bar(18, 4), // 35.5 play
  'fix.reveal': bar(18, 4) + 0.75, // 36.25: the app's own STEP_MS after play
  'fix.mask': bar(19, 3), // 37.0
  'fix.cap': bar(19, 4), // 37.5
  'fix.callout2': bar(20, 2), // 38.5
  'fix.stamp': bar(20, 3), // 39.0
  // 7 REFUSES
  'ref.in': bar(22, 1),
  'ref.reveal': bar(22, 1), // four reveals on 8ths
  'ref.callouts': bar(22, 3),
  'ref.cap': bar(22, 3),
  'ref.invert': bar(23, 1),
  'ref.lines': bar(24, 1),
  'ref.cap2': bar(24, 2),
  'ref.fired': bar(24, 4),
  'ref.stamp': bar(25, 2),
  'ref.riser': bar(25, 2),
  // 8 CTA
  'cta.in': bar(26, 1),
  'cta.closer': bar(26, 2),
  'cta.url': bar(26, 4),
  'cta.stack': bar(27, 1),
  'cta.final': bar(28, 1),
}

export const cue = (id) => {
  const t = CUES[id]
  if (t === undefined) throw new Error(`unknown cue ${id}`)
  return t
}

// Non-tick sound events (kept sparse: <= 12). Each lands exactly on a visual event.
export const SFX = [
  { t: cue('hook.wrong'), kind: 'lowHit' },
  { t: cue('fix.click1'), kind: 'click' },
  { t: cue('fix.click2'), kind: 'click' },
  { t: cue('fix.click3'), kind: 'click' },
  { t: cue('ref.reveal') + 0.0, kind: 'blip', note: 0 },
  { t: cue('ref.reveal') + 0.25, kind: 'blip', note: 1 },
  { t: cue('ref.reveal') + 0.5, kind: 'blip', note: 2 },
  { t: cue('ref.reveal') + 0.75, kind: 'blip', note: 3 },
  { t: cue('ref.invert'), kind: 'lowHit' },
  { t: cue('ref.riser'), kind: 'riser', dur: cue('cta.in') - cue('ref.riser') },
]

// Mono text that prints (and ticks). Filled in by scenes at build time so the
// audio uses the exact character timing the visuals use.
export const TYPING = []
export const CHARS_PER_TICK = 3
