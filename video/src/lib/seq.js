// Frame sequences from the real UI capture. Each sequence is an <img> whose src is a
// pure function of t (frame index); __seek awaits decode() of whatever is visible.
const all = []

/**
 * register({ img, frames: [url...], frameAt: (t) => index | -1 })
 * frameAt returns -1 when the sequence is not on screen at t.
 */
function register(seq) {
  seq.img.dataset.seq = '1'
  seq.img.decoding = 'sync'
  all.push(seq)
  return seq
}

async function preload() {
  // warm the HTTP cache for every frame; decoding happens per seek (full-res UI
  // frames are too large to keep hundreds decoded at once)
  const urls = [...new Set(all.flatMap((s) => s.frames))]
  const chunk = 16
  for (let i = 0; i < urls.length; i += chunk) {
    await Promise.all(urls.slice(i, i + chunk).map((u) => fetch(u).then((r) => {
      if (!r.ok) throw new Error(`missing frame ${u}`)
      return r.arrayBuffer()
    })))
  }
}

async function sync(t) {
  const pending = []
  for (const s of all) {
    const i = s.frameAt(t)
    if (i < 0) continue
    const url = s.frames[Math.min(i, s.frames.length - 1)]
    if (s.img.getAttribute('src') !== url) {
      s.img.setAttribute('src', url)
    }
    pending.push(s.img.decode().catch(() => { throw new Error(`decode failed ${url}`) }))
  }
  await Promise.all(pending)
}

export const sequences = { register, preload, sync, all }
