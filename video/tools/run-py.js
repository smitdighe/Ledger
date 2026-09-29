// Run a video/tools/*.py script with the backend virtualenv, cwd = backend/.
// Telemetry of third-party eval libraries is switched off so nothing phones home
// and nothing under backend/ gets rewritten.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const videoDir = path.resolve(here, '..')
const backendDir = path.resolve(videoDir, '..', 'backend')
const python = path.join(backendDir, '.venv', 'Scripts', 'python.exe')

const [script, ...args] = process.argv.slice(2)
if (!script) {
  console.error('usage: node tools/run-py.js <script.py> [args...]')
  process.exit(2)
}

export const QUIET_ENV = {
  DEEPEVAL_TELEMETRY_OPT_OUT: '1',
  DEEPEVAL_DISABLE_DOTENV: '1',
  RAGAS_DO_NOT_TRACK: 'true',
  DO_NOT_TRACK: '1',
  ANONYMIZED_TELEMETRY: 'false',
  LANGCHAIN_TRACING_V2: 'false',
  NO_COLOR: '1',
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
}

const child = spawn(python, [path.resolve(videoDir, script), ...args], {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env, ...QUIET_ENV },
})
child.on('exit', (code) => process.exit(code ?? 1))
