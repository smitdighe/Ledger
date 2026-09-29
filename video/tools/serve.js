// Tiny static server for video/ (the page must never run from file://).
// Usage: node tools/serve.js [port]      or   import { serve } from './serve.js'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
}

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'video.html'
    const file = path.resolve(ROOT, '.' + rel)
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      res.writeHead(403).end()
      return
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel)
        return
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-store',
      })
      fs.createReadStream(file).pipe(res)
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address()
      resolve({ server, port: p, url: `http://127.0.0.1:${p}/`, close: () => new Promise((r) => server.close(r)) })
    })
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 5178)
  serve(port).then(({ url }) => console.log(`serving ${ROOT} at ${url}video.html`))
}
