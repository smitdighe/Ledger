// Every technical string on screen comes through here: facts.json (repo constants,
// each with file:line) or the recorded fixtures (real scenario output).

const FIXTURES = [
  'scenario_A', 'scenario_B', 'scenario_C', 'hook_trace', 'ingest',
  'api_incident_A', 'api_incident_B', 'api_incident_C', 'api_incidents', 'api_router_config',
]

const store = { facts: new Map(), fx: {}, logs: {}, ui: null, uiMap: null }

export async function loadData() {
  store.ui = await (await fetch('assets/ui/manifest.json')).json()
  store.uiMap = await (await fetch('assets/ui/ui-map.json')).json()
  const res = await fetch('src/data/facts.json')
  const json = await res.json()
  for (const f of json.facts) store.facts.set(f.id, f)
  await Promise.all(FIXTURES.map(async (name) => {
    store.fx[name] = await (await fetch(`data/fixtures/${name}.json`)).json()
  }))
  await Promise.all(['A', 'B', 'C'].map(async (k) => {
    store.logs[k] = (await (await fetch(`data/logs/${k}.log`)).text()).split('\n').filter(Boolean)
  }))
  return store
}

/** Fact value by id; throws on an unknown id so a typo can never render. */
export function F(id) {
  const f = store.facts.get(id)
  if (!f) throw new Error(`unknown fact ${id}`)
  return f.value
}
export const factSource = (id) => store.facts.get(id)?.source

/** Fixture accessor: FX('scenario_B').drift.window_mean */
export function FX(name) {
  const v = store.fx[name]
  if (!v) throw new Error(`unknown fixture ${name}`)
  return v
}
export const LOG = (k) => store.logs[k]
/** Real-UI capture: frame tables (manifest) and element rects (ui-map), from tools/capture-ui.js */
export const UI = (name) => store.ui[name]
export const UIMAP = (name) => store.uiMap[name]

/** Fixed-decimal score formatting, the way the backend's summaries print (f"{x:.2f}"). */
export const f2 = (x) => Number(x).toFixed(2)
export const f3 = (x) => Number(x).toFixed(3)

export const finding = (scenario, node) =>
  FX(`scenario_${scenario}`).final.findings.find((x) => x.node === node)
export const trailEntry = (scenario, node) =>
  FX(`scenario_${scenario}`).final.trail.find((x) => x.node === node)
