<div align="center">

<pre>
██╗      ███████╗ ██████╗   ██████╗  ███████╗ ██████╗ 
██║      ██╔════╝ ██╔══██╗ ██╔════╝  ██╔════╝ ██╔══██╗
██║      █████╗   ██║  ██║ ██║  ███╗ █████╗   ██████╔╝
██║      ██╔══╝   ██║  ██║ ██║   ██║ ██╔══╝   ██╔══██╗
███████╗ ███████╗ ██████╔╝ ╚██████╔╝ ███████╗ ██║  ██║
╚══════╝ ╚══════╝ ╚═════╝   ╚═════╝  ╚══════╝ ╚═╝  ╚═╝
</pre>

*Who watches the watchmen. Observability and auto-remediation for RAG and agent systems in production.*

</div>

<div align="center">

Ledger is an LLM/agent observability platform that closes the loop. OTel traces land via OTLP,
get scored continuously by RAGAS and DeepEval against a versioned golden set, and a bad score
doesn't just page someone — it dispatches a LangGraph diagnostic swarm that fans out across four
specialist nodes, converges on a root cause, and fires the matching remediation tool. Every LLM
call in the system routes through a four-tier cost- and latency-aware router with a local Ollama
floor, so the platform that watches your inference bill never runs one up itself.

**It escalates instead of guessing.** When the top two diagnostic findings disagree across failure
domains, or the best confidence lands under threshold, the decision node refuses to pick and writes
an open incident flagged for human review. The escalation path is a designed outcome, not a fallback.

</div>

## 🔍 How It Works

```
  OTLP span batch (protobuf or JSON)
         │
         ▼
  POST /api/v1/traces          X-API-Key: ingestion scope ──► 401 / 403 on mismatch
         │
         ├─ decode_otlp ─► unsupported content-type ──► 415
         │                 malformed payload        ──► 400  (never 500)
         │
         ├─ parse_traces ─► RawSpan[] ─► Trace[] (gen_ai.* attrs → LLM span)
         │
         ├─ broker ping (1s timeout) ──► dead broker ──► 503, request never hangs
         ▼
  Celery enqueue ──► { task_id, accepted_spans, traces, trace_ids }   returns immediately
         │
         ▼
  ingest_traces          queue: ingestion
         │
         ├─ write_traces ─► ClickHouse ledger.traces (MergeTree, 90d TTL)
         │      │ transient failure
         │      └─► TransientError ──► exponential backoff, jitter, max 3 retries
         │
         ├─ langfuse push (per-trace isolated; a failure here is logged, not fatal)
         │
         └─► chains eval_trace.delay(trace_id) per trace
                    │
                    ▼
            eval_trace            queue: eval
                    │
                    ├─ RAGAS    ─► faithfulness, context_precision, context_recall
                    ├─ DeepEval ─► answer_relevance, hallucination
                    │      │
                    │      └─ both judged by JudgeRouter ──► asserts non-paid provider
                    │                                        (PaidJudgeError otherwise)
                    ├─ persist 5 × EvalResult (+ generator_model, golden_set_version)
                    │
                    ├─ detect_drift(faithfulness, persist=False)
                    │
                    ▼
            _flag_reasons: any metric < 0.5, hallucination > 0.5, or faithfulness drift
                    │
                    │ flagged
                    ▼
            run_diagnostic        queue: diagnostic     max_retries=2
                    │
                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      LangGraph diagnostic swarm                     │
  │                                                                     │
  │   classifier          deterministic signal analysis + advisory LLM  │
  │       │               opinion (Cerebras → floor); opinion never     │
  │       │               overrides the heuristic                       │
  │       │                                                             │
  │       ├─ retrieval signals bad ──► retrieval_diagnostic ─┐          │
  │       │                            index_diagnostic ─────┤          │
  │       │                                                  │          │
  │       ├─ generation signals bad ─► prompt_diagnostic ────┤          │
  │       │                            model_diagnostic ─────┤          │
  │       │                                                  │          │
  │       └─ no bad signal ─────────────────────────────────►│          │
  │                                                          ▼          │
  │                                                      decision       │
  │                          highest-confidence finding wins, unless:   │
  │                            best < 0.55                ──► escalate  │
  │                            cross-domain gap < 0.25    ──► escalate  │
  │                            same-bucket gap < 0.10     ──► escalate  │
  │                            no candidate at all        ──► escalate  │
  │                                    │                                │
  │                 ┌──────────────────┴──────────────────┐             │
  │           (confident)                          (escalated)          │
  │                 ▼                                     ▼             │
  │           remediation                           human_review        │
  │      retrieval_failure ─► reindex                     │             │
  │      index_staleness   ─► reindex             Incident{status:open, │
  │      prompt_regression ─► rollback             needs_human_review}  │
  │      model_degradation ─► reroute (deprioritize tier)  │             │
  │                 │                                     │             │
  │        Incident{resolved|failed}                      │             │
  │                 └──────────────► END ◄────────────────┘             │
  └─────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
        diagnostic_trail (JSONB) ─► trail, findings, classification,
                                    chosen_root_cause, confidence, tool_result
                    │
                    ▼
        GET /api/v1/incidents/{id} ──► React Flow swarm graph, replayed node by node
                    │
                    ▼
        PATCH /api/v1/incidents/{id}  human close-out with a required resolution_note

  Celery Beat, alongside:
    periodic_drift_check      every  5 min   faithfulness + answer_relevance vs baseline
    router_health_ping        every  1 min   probe every provider, persist latency
    golden_set_refresh_check  every 24 h     flag a golden set older than 7 days
```

What makes this a system rather than a demo is where it refuses to act. The decision node has four
separate escalation conditions and only one path to remediation, so a mixed retrieval/generation
signal writes an open incident instead of firing a reindex on a hunch. The judge router asserts its
resolved provider against a paid-provider deny-list on every single call, so a misconfigured tier
raises `PaidJudgeError` rather than quietly billing an eval sweep. Rate limiting is a Redis Lua token
bucket evaluated server-side — capacity and refill in one atomic round trip, plus a separate daily
quota counter — and the Ollama floor tier is exempt from both, which is what makes "the router never
runs out of options" true rather than aspirational.

## ✨ Features

<table>
<tr>
<td width="33%" valign="top">

### 🕸️ Diagnostic swarm
Eight LangGraph nodes with conditional fan-out. A retrieval-only signal wakes exactly two
diagnostics, never all four. Parallel nodes append findings through `operator.add` reducers, so
fan-out and join merge without a lock.

</td>
<td width="33%" valign="top">

### 🪜 Four-tier router
Cerebras → Groq → Gemini 2.0 Flash → local Ollama, ordered by priority and gated on health, RPM
bucket, and daily quota. Ollama is `is_floor`: never rate-limited, never skipped, so `select()`
always terminates.

</td>
<td width="33%" valign="top">

### 🔁 Self-triggering pipeline
Ingest chains into eval, eval chains into diagnosis. A trace scoring below threshold summons its own
incident with no human in the loop — `POST /incidents/trigger` exists for manual runs, not as the
primary path.

</td>
</tr>
<tr>
<td width="33%" valign="top">

### ⚖️ Non-paid judge guarantee
`JudgeRouter` allow-lists judge tiers and re-asserts the resolved provider against
`PAID_PROVIDERS` after the call returns. Gemini is reserved for explicit cross-validation via
`force_tier`, keeping the primary pool free.

</td>
<td width="33%" valign="top">

### 📉 Drift vs golden set
Rolling window of the last 20 `EvalResult` rows per metric, compared against a per-metric baseline
with hallucination inverted (higher is worse). Drift writes its own `EvalResult` row with
`drift_flagged` set.

</td>
<td width="33%" valign="top">

### 🎛️ Scoped API keys
Two keys, two scopes. The ingestion key reaches `POST /traces` and nothing else; admin implies
ingestion. Missing key is 401, valid key with the wrong scope is 403 — checked as a FastAPI
dependency, not in handler bodies.

</td>
</tr>
</table>

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| API | FastAPI ≥0.115, Uvicorn ≥0.34 (standard) | Async routes, OpenAPI, lifespan-managed ClickHouse pool |
| Config | pydantic ≥2.10, pydantic-settings ≥2.7 | Fail-fast settings; secrets required, no defaults |
| Metadata store | Postgres + SQLAlchemy 2.0 async, asyncpg ≥0.30 | Incidents, eval results, prompt versions, router config, golden set |
| Migrations | Alembic ≥1.14, psycopg ≥3.2 (sync DSN) | 4 revisions; async app DSN and sync migration DSN kept separate |
| Time-series | ClickHouse + clickhouse-connect ≥0.8 | `ledger.traces` / `ledger.metrics`, MergeTree, daily partitions, 90-day TTL |
| Job queue | Celery ≥5.4 + Redis ≥5.2 | 4 queues (default/ingestion/eval/diagnostic), Beat schedule, `acks_late` |
| Agent graph | LangGraph ≥0.2, langchain-core ≥0.3 | Diagnostic swarm: conditional fan-out, explicit join, additive state reducers |
| Trace ingestion | OTLP (protobuf + JSON), Langfuse ≥2.57 (self-hosted v3) | `POST /traces` accepts both wire formats; observations mirror the span tree |
| Eval | RAGAS ≥0.2, DeepEval ≥2.0 | faithfulness / context precision / context recall / answer relevance / hallucination |
| LLM tiers | cerebras-cloud-sdk ≥1.15, groq ≥0.13, google-generativeai ≥0.8, ollama ≥0.4 | Tier 1→4 of the router; Ollama is the zero-cost floor |
| Logging | structlog ≥24.4, prometheus-client ≥0.21 | Structured event logs keyed by `trace_id`; Prometheus scrape target |
| Frontend | React 19.2, Vite 8.1, TypeScript ~6.0 | SPA, lazy-loaded routes, strict TS build (`tsc -b && vite build`) |
| Server state | TanStack Query 5.10 | Per-domain polling, centralized key hierarchy, precise invalidation |
| Graph UI | @xyflow/react 12.11 (React Flow) | Swarm graph — custom node + animated edge types |
| Motion | Framer Motion 12.4 | Tier cascade fall, health gauge sweep, typewriter, count-up |
| Transport | axios 1.18, zod 4.4 | Interceptor-injected API key; every response parsed at the `api/` boundary |
| Styling | Tailwind CSS 3.4, clsx, tailwind-merge | Semantic status tokens mirrored to hex for SVG/canvas contexts |
| Tests | pytest ≥8.3, pytest-asyncio ≥0.25 | 6 integration suites; Celery runs eager, `nest-asyncio` for reentrant loops |

**Stack notes, verified against `pyproject.toml` and `package.json`:**
- **`opentelemetry-proto` is not a declared dependency.** `_decode_protobuf` imports
  `ExportTraceServiceRequest` lazily, and the package arrives transitively via `langfuse`. JSON OTLP
  ingestion has no such dependency, which is why the lazy import sits inside the protobuf branch.
- **OTLP/JSON trace IDs are parsed by hand.** The protobuf↔JSON standard mapping base64-encodes the
  underlying bytes; real OTLP/JSON emitters send lowercase hex. `otel_receiver` honors the hex
  convention deliberately rather than round-tripping through the protobuf JSON parser.
- **`recharts` and `zustand` are installed but not imported anywhere in `src/`.** Server state lives
  entirely in TanStack Query, and `src/store/index.ts` is still an empty module. There is no chart
  component in the current UI — eval history renders as a table.
- **`VITE_ENABLE_MOCK_DATA` is declared in `vite-env.d.ts` but never read.** It is a typed
  placeholder, not a working switch.

## 📁 Project Structure

```
Ledger/
├── backend/                        # FastAPI app + Celery worker
│   ├── app/
│   │   ├── main.py                 # App factory, CORS, lifespan, root /health
│   │   ├── api/v1/
│   │   │   ├── router.py           # Aggregates the 5 endpoint modules
│   │   │   └── endpoints/
│   │   │       ├── health.py       # liveness, /tiers, /queues, /db
│   │   │       ├── traces.py       # OTLP ingest, list, detail
│   │   │       ├── evals.py        # run, list, golden-set
│   │   │       ├── incidents.py    # trigger, list, detail, manual resolve
│   │   │       └── router_config.py# tier config, patch, on-demand health probe
│   │   ├── agents/
│   │   │   ├── graph.py            # StateGraph wiring + run_diagnostic_graph
│   │   │   ├── state.py            # DiagnosticState, thresholds, root-cause buckets
│   │   │   ├── nodes/
│   │   │   │   ├── classifier.py   # deterministic triage + advisory LLM opinion
│   │   │   │   ├── retrieval_diagnostic.py
│   │   │   │   ├── index_diagnostic.py
│   │   │   │   ├── prompt_diagnostic.py
│   │   │   │   ├── model_diagnostic.py
│   │   │   │   ├── decision.py     # 4 escalation conditions, 1 path to remediation
│   │   │   │   ├── remediation.py  # root cause → tool dispatch
│   │   │   │   ├── human_review.py # terminal escalation node
│   │   │   │   └── _incident.py    # shared Incident persistence for both terminals
│   │   │   └── tools/              # reindex, rollback, reroute
│   │   ├── router/
│   │   │   ├── tiers.py            # TierSpec defaults, DB-merged enabled/priority
│   │   │   ├── selector.py         # priority walk, health + quota gates, floor tier
│   │   │   ├── rate_limiter.py     # Redis Lua token bucket + daily quota
│   │   │   ├── health_check.py     # probe + cache per tier
│   │   │   └── providers/          # base, cerebras, groq, gemini, ollama
│   │   ├── eval/
│   │   │   ├── runner.py           # orchestrates RAGAS + DeepEval, persists results
│   │   │   ├── ragas_runner.py     # faithfulness, context precision/recall
│   │   │   ├── deepeval_runner.py  # answer relevance, hallucination
│   │   │   ├── judge_router.py     # non-paid judge guarantee + score parsing
│   │   │   ├── drift.py            # rolling window vs per-metric baseline
│   │   │   ├── golden_set.py       # versioned CRUD, active = newest
│   │   │   ├── synthetic_qa.py     # canonical Q/A/context corpus
│   │   │   ├── quality.py          # model → tier attribution
│   │   │   └── trace_data.py       # span tree → eval inputs
│   │   ├── ingestion/
│   │   │   ├── otel_receiver.py    # protobuf + hand-parsed JSON decode
│   │   │   ├── trace_parser.py     # RawSpan → Span/Trace, gen_ai.* attr mapping
│   │   │   ├── clickhouse_writer.py# bulk insert + read-back
│   │   │   ├── langfuse_client.py  # parent-first observation push
│   │   │   ├── otel_build.py       # OTLP JSON builder (seeding/tests)
│   │   │   └── schemas.py          # RawSpan, Span, Trace, LLM attr key fallbacks
│   │   ├── tasks/
│   │   │   ├── ingestion_tasks.py  # write + langfuse + chain into eval
│   │   │   ├── eval_tasks.py       # score, flag, auto-dispatch diagnosis
│   │   │   ├── diagnostic_tasks.py # runs the swarm off the request path
│   │   │   ├── scheduled.py        # Beat: drift, golden freshness, health ping
│   │   │   ├── status.py           # task status lookup
│   │   │   └── _async.py           # sync Celery → async coroutine bridge
│   │   ├── core/
│   │   │   ├── config.py           # Settings; secrets are required fields
│   │   │   ├── security.py         # X-API-Key scopes, require_admin/require_ingestion
│   │   │   ├── celery_app.py       # queues, routes, retry policy, Beat schedule
│   │   │   └── errors.py           # uniform error envelope + request ids
│   │   └── db/
│   │       ├── postgres/           # models.py (6 tables, 3 enums), session.py
│   │       └── clickhouse/         # client.py, schema.sql
│   ├── migrations/versions/        # 4 Alembic revisions
│   ├── scripts/
│   │   ├── check_connectivity.py   # ping every infra service
│   │   ├── seed_synthetic_traces.py# synthetic RAG traces, ~30% fault-injected
│   │   └── load_test.py            # ingest throughput probe
│   ├── tests/integration/          # api, db, ingestion, eval, router, swarm, tasks
│   ├── docker-compose.yml          # postgres, redis, clickhouse, minio,
│   │                               #   langfuse-web/worker, prometheus, grafana
│   ├── alembic.ini
│   └── pyproject.toml
│
└── frontend/                       # React SPA, Vite dev server on :5173
    ├── src/
    │   ├── api/                    # client.ts (interceptors, error normalization),
    │   │                           #   traces, incidents, evals, router, health
    │   ├── app/                    # providers.tsx (QueryClient), router.tsx (lazy routes)
    │   ├── components/             # Badge, Button, Card, CountUpNumber, EmptyState,
    │   │   │                       #   PollIndicator, QueryError, Skeleton, TypewriterText
    │   │   └── layout/             # AppShell, Sidebar, Topbar, PageHeader, nav, icons
    │   ├── features/
    │   │   ├── diagnostic-swarm/   # SwarmGraph (React Flow), IncidentTrailReplay,
    │   │   │                       #   nodes/{Classifier,Diagnostic,Remediation,NodeShell},
    │   │   │                       #   edges/AnimatedEdge, hooks/useTrailReplay
    │   │   ├── router-cascade/     # TierCascade, FallbackAnimation, TierBadge,
    │   │   │                       #   RouterTierTable, lib/tierState
    │   │   ├── health-score/       # HealthGauge (radial, priority-weighted)
    │   │   ├── incidents/          # IncidentList, IncidentCard, RecentIncidents,
    │   │   │                       #   IncidentResolvePanel, lib/statusVariant
    │   │   ├── evals/              # EvalResultsTable, GoldenSetSummary
    │   │   └── trace-explorer/     # TraceList, TraceDetailPanel
    │   ├── hooks/                  # queryKeys.ts + one hook per domain,
    │   │                           #   usePolling.ts (visibility-gated cadences)
    │   ├── lib/                    # buildSwarmGraph, computeHealthScore, deriveSeverity,
    │   │                           #   pollStatus, animationVariants, format, cn, constants
    │   ├── pages/                  # Dashboard, TraceExplorer, Incidents, IncidentDetail,
    │   │                           #   RouterConfig, EvalGoldenSet, NotFound
    │   ├── types/                  # zod schemas + inferred types per domain
    │   └── styles/globals.css
    ├── vite.config.ts              # /api dev proxy → VITE_PROXY_TARGET
    ├── tailwind.config.ts
    └── package.json
```

`backend/` and `frontend/` are independent projects with their own dependency manifests, installed
and run separately. There is no root-level package manifest.

## ⚙️ Getting Started

### Prerequisites

- **Python** — `requires-python = ">=3.11,<3.14"`. The checked-in virtualenv and compiled artifacts
  are 3.13.
- **Node.js** — no `engines` field is set. Vite 8 requires Node 20.19+ / 22.12+.
- **Docker** — the full infra stack (Postgres, Redis, ClickHouse, MinIO, Langfuse, Prometheus,
  Grafana) runs from `backend/docker-compose.yml`.
- **API keys** — [Cerebras](https://cloud.cerebras.ai), [Groq](https://console.groq.com/keys),
  [Google AI Studio](https://aistudio.google.com/apikey). All three are optional individually; the
  router skips any tier whose key is absent and falls through to the next.
- **Ollama** (optional but recommended) — the guaranteed floor tier. Pull `llama3.2:3b` or
  `phi4-mini`. Without it, an exhausted router raises `RouterExhausted`.

### 1. Clone

```bash
git clone <repo-url>
cd Ledger
```

### 2. Infrastructure

```bash
cd backend
cp .env.example .env
docker compose up -d
```

Compose maps host ports off their defaults where a conflict is likely: Postgres `5433→5432`, Redis
`6380→6379`, MinIO `9090/9091`, Grafana `3001`, Prometheus `9092`. Langfuse provisions an org,
project, and API key pair headlessly on first boot from the `LANGFUSE_INIT_*` variables, so no
manual UI step is needed to get ingestion keys.

Fill in `backend/.env`:

```bash
# --- required: the app refuses to start without these ---
DATABASE_URL=              # postgresql+asyncpg://... — async DSN used by the app
ALEMBIC_DATABASE_URL=      # postgresql+psycopg://...  — sync DSN used by migrations
REDIS_URL=                 # redis://:<password>@host:port/0
CLICKHOUSE_PASSWORD=
ADMIN_API_KEY=             # full access
INGESTION_API_KEY=         # POST /traces only

# --- optional: defaults shown ---
CELERY_BROKER_URL=         # blank → falls back to REDIS_URL
CELERY_RESULT_BACKEND=     # blank → falls back to REDIS_URL
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_NATIVE_PORT=9000
CLICKHOUSE_USER=ledger
CLICKHOUSE_DB=ledger       # app tables; `default` holds Langfuse's own OTel tables
LANGFUSE_HOST=http://localhost:3000
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
CEREBRAS_API_KEY=          # tier 1 — omit to skip the tier
GROQ_API_KEY=              # tier 2
GEMINI_API_KEY=            # tier 3
OLLAMA_HOST=http://127.0.0.1:11434
ALLOWED_ORIGINS=           # comma-separated CORS origins; blank allows none
APP_ENV=local
LOG_LEVEL=INFO
```

`OLLAMA_HOST` pins IPv4 deliberately — `localhost` can resolve to `::1`, where a different Ollama
instance may be listening.

### 3. Backend

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
```

Apply the Postgres schema and load the ClickHouse DDL:

```bash
alembic upgrade head
docker compose exec -T clickhouse clickhouse-client --multiquery < app/db/clickhouse/schema.sql
```

Verify every service is reachable before going further:

```bash
python scripts/check_connectivity.py
```

It prints a PASS/FAIL line per service (Postgres, the Langfuse database, Redis, ClickHouse, the
Langfuse API, Ollama) and exits non-zero if any check fails.

### 4. Frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local
```

```bash
VITE_API_BASE_URL=            # blank → use the Vite dev proxy (same-origin)
VITE_API_KEY=                 # sent as X-API-Key on every request; use the admin key
VITE_POLL_INTERVAL_MS=5000    # base cadence; evals ×4, golden set ×6
VITE_ENABLE_MOCK_DATA=false   # typed but currently unread
```

Leaving `VITE_API_BASE_URL` empty routes requests through the dev proxy in `vite.config.ts`
(`VITE_PROXY_TARGET`, default `http://localhost:8080`), which keeps the browser same-origin. Setting
it to an absolute backend URL bypasses the proxy — in that case the backend's `ALLOWED_ORIGINS` must
include the frontend origin.

### 5. Run

Three processes, three panes:

```bash
# Pane 1 — API
cd backend && uvicorn app.main:app --reload --port 8080
```

```bash
# Pane 2 — Celery worker + Beat (nothing is written, scored, or diagnosed without this)
cd backend && celery -A app.core.celery_app:celery_app worker -B --loglevel=info -Q default,ingestion,eval,diagnostic
```

```bash
# Pane 3 — frontend
cd frontend && npm run dev
```

Open <http://localhost:5173>. Interactive API docs are at <http://localhost:8080/docs>.

The worker is not optional. `POST /traces` returns `202`-style acceptance immediately and does the
ClickHouse write, Langfuse push, eval, and diagnosis asynchronously — with no worker running, traces
are accepted and then never appear.

### 6. Seed data

```bash
cd backend && python scripts/seed_synthetic_traces.py --count 20
```

Generates RAG traces (`rag.request` → `rag.retrieval` + `rag.generation`) and pushes them through
the real ingestion endpoint. Roughly 30% carry an injected fault — high latency, a low retrieval
score, or a hallucinated answer — which is enough to drive evals below threshold and trigger the
swarm end to end.

## 🔌 API

Everything is namespaced under `/api/v1` except the root liveness probe. Auth is the `X-API-Key`
header: the ingestion key reaches `POST /traces` only, the admin key reaches everything.

| Method | Path | Scope | Purpose |
|---|---|---|---|
| `GET` | `/health` | **None** | Root liveness probe for load balancers (outside `/api/v1`) |
| `GET` | `/api/v1/health` | **None** | Liveness + resolved environment |
| `GET` | `/api/v1/health/tiers` | admin | Per-tier `available`, `cached_health`, last probe time and latency |
| `GET` | `/api/v1/health/queues` | admin | Celery backlog per queue plus live worker `active`/`reserved` counts |
| `GET` | `/api/v1/health/db` | admin | Postgres + ClickHouse connectivity; `ok` or `degraded` |
| `POST` | `/api/v1/traces` | ingestion | OTLP ingest (protobuf or JSON). `?to_langfuse=`, `?run_eval=` |
| `GET` | `/api/v1/traces` | admin | List traces. `start_time`, `end_time`, `status`, `has_incident`, `limit` (1–500), `offset` |
| `GET` | `/api/v1/traces/{trace_id}` | admin | Every span for a trace, ordered by start time |
| `POST` | `/api/v1/evals/run` | admin | Score one trace or a batch. `trace_id` \| `trace_ids`, `golden_version`, `persist`, `force` |
| `GET` | `/api/v1/evals` | admin | List results. `trace_id`, `eval_type`, `drift`, `start_time`, `end_time`, `limit` |
| `GET` | `/api/v1/evals/golden-set` | admin | Active golden-set version + entry count |
| `POST` | `/api/v1/incidents/trigger` | admin | Run the diagnostic swarm for a trace and persist an incident |
| `GET` | `/api/v1/incidents` | admin | List incidents. `root_cause`, `status`, `limit` (1–500) |
| `GET` | `/api/v1/incidents/{incident_id}` | admin | Incident + full `diagnostic_trail` |
| `PATCH` | `/api/v1/incidents/{incident_id}` | admin | Human close-out. Requires `resolution_note`; `status` is `resolved` \| `failed` |
| `GET` | `/api/v1/router/config` | admin | Tier config + live health (see field list below) |
| `PATCH` | `/api/v1/router/config/{tier_name}` | admin | Override `is_enabled` and/or `priority_order` |
| `POST` | `/api/v1/router/health-check` | admin | Probe every provider now and persist latency |

### Trigger the diagnostic swarm

```bash
curl -X POST http://localhost:8080/api/v1/incidents/trigger \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trace_id": "a1b2c3...", "signal": "manual_trigger", "use_llm": true}'
```

```json
{
  "trace_id": "a1b2c3...",
  "incident_id": "8f14e45f-ceea-467a-9f1b-2c3d4e5f6a7b",
  "chosen_root_cause": "retrieval_failure",
  "chosen_confidence": 0.82,
  "needs_human_review": false,
  "remediation_action": "reindex:ok",
  "nodes_ran": ["classifier", "retrieval_diagnostic", "index_diagnostic", "decision", "remediation"]
}
```

`nodes_ran` is derived from the trail, so it reports the path actually taken — an escalated run ends
in `human_review` with `chosen_root_cause: null` and `needs_human_review: true`.

### List traces with pagination

```bash
curl "http://localhost:8080/api/v1/traces?limit=50&offset=0&status=ERROR&has_incident=true" \
  -H "X-API-Key: $ADMIN_API_KEY"
```

```json
{
  "count": 2,
  "limit": 50,
  "offset": 0,
  "traces": [
    {
      "trace_id": "a1b2c3...",
      "started_at": "2026-07-30T11:04:22.481000+00:00",
      "status": "ERROR",
      "span_count": 3,
      "has_incident": true
    }
  ]
}
```

`has_incident` is resolved by cross-referencing Postgres incidents against the ClickHouse page —
which means it filters *within* the returned page, after `LIMIT`/`OFFSET` have been applied.

### Eval results and the golden set

```bash
curl "http://localhost:8080/api/v1/evals?eval_type=faithfulness&drift=true&limit=20" \
  -H "X-API-Key: $ADMIN_API_KEY"

curl http://localhost:8080/api/v1/evals/golden-set -H "X-API-Key: $ADMIN_API_KEY"
```

Drift rows are stored as ordinary `EvalResult` records with `eval_type: "drift"` and a synthetic
`trace_id` of `drift:<metric>`, so the same list endpoint serves both per-trace scores and drift
history.

### Router tier status

```bash
curl http://localhost:8080/api/v1/router/config -H "X-API-Key: $ADMIN_API_KEY"
```

```json
{
  "tiers": [
    {
      "tier": "cerebras",
      "role": "low-latency root-cause triage / sub-second classification",
      "priority": 1,
      "enabled": true,
      "available": true,
      "cached_health": true,
      "last_health_check": "2026-07-30T11:02:00+00:00",
      "last_latency_ms": 143.7,
      "rpm": 30,
      "rpd": 14400,
      "default_model": "llama3.1-8b"
    }
  ]
}
```

The four tiers, in default priority order:

| Priority | Tier | Default model | Role | RPM | RPD |
|---|---|---|---|---|---|
| 1 | `cerebras` | `llama3.1-8b` | Low-latency root-cause triage / sub-second classification | 30 | 14,400 |
| 2 | `groq` | `llama-3.1-8b-instant` | Fast high-throughput general inference | 30 | 14,400 |
| 3 | `gemini` | `gemini-2.0-flash` | Cross-validation / secondary judge | 15 | 1,500 |
| 4 | `ollama` | `llama3.2:3b` | Zero-cost, zero-rate-limit local fallback (guaranteed floor) | — | — |

`role`, `priority`, `rpm`, `rpd`, and `default_model` come from the code-level `TierSpec`;
`enabled` and `priority` are overridden by the `router_configs` table when a row exists;
`available` reflects whether the provider has credentials configured; `cached_health`,
`last_health_check`, and `last_latency_ms` come from the health probe and are `null` until one runs.

## ⚠️ Known Limitations

- **Incident and eval lists are `limit`-only.** `GET /traces` supports full `limit`+`offset`
  pagination, but `GET /incidents` and `GET /evals` accept `limit` alone and return a `count` of the
  rows in that page. Deep paging through incident history isn't expressible against the current
  contract.
- **`IncidentSeverity` is derived client-side.** The backend has no severity column, so
  `lib/deriveSeverity.ts` computes it from `status`, `root_cause`, `classification_confidence`, and
  the trail's `needs_human_review` flag. It is centralized in one module so list rows, cards, and the
  swarm graph agree — but it is a frontend convention, not persisted fact.
- **The frontend was built against the backend contract rather than a live server.** Every response
  shape is validated at the `api/` boundary with zod, so a contract drift surfaces as a typed
  `validation` error naming the endpoint instead of corrupt UI state.

## 🔮 Future Improvements

- **Promote `IncidentSeverity` to a real backend field** — persist it on `Incident` at write time in
  `_incident.py`, so severity is server-authoritative and filterable rather than recomputed in the
  browser.
- **Unify pagination** — add `offset` to `GET /incidents` and `GET /evals`, and return a true total
  count alongside the page, so all three list endpoints share one contract.
- **Expose the full golden-set entry table** — `GET /evals/golden-set` currently returns only
  `active_version` and `entry_count`; the underlying `GoldenSetEntry` rows (query, expected answer,
  expected contexts) have no read endpoint, and `golden_set.py` already implements versioned CRUD
  waiting to be surfaced.
- **Surface `POST /incidents/trigger` in the UI** — `triggerIncident` is implemented and zod-typed in
  `api/incidents.ts` but no component calls it. A trigger control on the trace detail panel would
  close the loop from "this trace looks wrong" to "diagnose it now."
- **CI pipeline** — run the integration suite plus `ruff` and `tsc -b` on every push, and gate merges
  on an eval regression check the way `drift.detect_drift` already scores one.
- **Multi-tenant support** — `RouterConfig` and `GoldenSetEntry` are global today. A tenant column
  plus a tenant-scoped API key would let one deployment watch several RAG systems independently.
- **Prometheus metrics endpoint** — `prometheus-client` is a declared dependency and the Compose
  stack ships a configured scrape target, but the app exposes no `/metrics` route yet.
