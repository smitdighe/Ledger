"""Extract every technical string/number the video puts on screen, from the repo.

Python constants are imported from the real modules (so the value is what the
running code uses) and then located in the source text to record file:line.
TypeScript constants, the README tagline + ASCII logo, the synthetic QA strings
and the integration-test count are regex-read. Every record carries `match`:
the literal text that sits on the cited line(s), which verify-facts re-checks.

Run:  node tools/run-py.js tools/extract_facts.py      (cwd = backend/)
Out:  video/src/data/facts.json
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

VIDEO = Path(__file__).resolve().parents[1]
REPO = VIDEO.parent
BACKEND = REPO / "backend"
FRONTEND = REPO / "frontend"

# Hermetic settings: env beats backend/.env, and nothing here may reach a real
# database. Import-time only; no connection is ever opened by this script.
os.environ.update({
    "DATABASE_URL": "postgresql+asyncpg://facts:facts@127.0.0.1:1/facts",
    "ALEMBIC_DATABASE_URL": "postgresql+psycopg://facts:facts@127.0.0.1:1/facts",
    "REDIS_URL": "redis://127.0.0.1:1/0",
    "CELERY_BROKER_URL": "redis://127.0.0.1:1/0",
    "CELERY_RESULT_BACKEND": "redis://127.0.0.1:1/0",
    "CLICKHOUSE_HOST": "127.0.0.1",
    "CLICKHOUSE_PORT": "1",
    "CLICKHOUSE_PASSWORD": "facts",
    "ADMIN_API_KEY": "video-admin",
    "INGESTION_API_KEY": "video-ingest",
    "DEEPEVAL_TELEMETRY_OPT_OUT": "1",
    "DEEPEVAL_DISABLE_DOTENV": "1",
    "RAGAS_DO_NOT_TRACK": "true",
})
sys.path.insert(0, str(BACKEND))

FACTS: list[dict] = []
_IDS: set[str] = set()


def _lines(rel: str) -> list[str]:
    return (REPO / rel).read_text(encoding="utf-8").splitlines()


def locate(rel: str, pattern: str, after: str | None = None, nth: int = 0) -> tuple[int, str]:
    """1-based line number + text of the nth regex hit (optionally after an anchor line)."""
    lines = _lines(rel)
    start = 0
    if after is not None:
        for i, ln in enumerate(lines):
            if re.search(after, ln):
                start = i + 1
                break
        else:
            raise LookupError(f"{rel}: anchor /{after}/ not found")
    hits = [i for i in range(start, len(lines)) if re.search(pattern, lines[i])]
    if len(hits) <= nth:
        raise LookupError(f"{rel}: /{pattern}/ not found (after={after!r})")
    i = hits[nth]
    return i + 1, lines[i]


def add(fid: str, value, rel: str, pattern: str, match: str | None = None,
        after: str | None = None, nth: int = 0, note: str | None = None) -> None:
    """Register one fact. `match` (default: str(value)) must appear on the cited line."""
    if fid in _IDS:
        raise ValueError(f"duplicate fact id {fid}")
    line_no, text = locate(rel, pattern, after=after, nth=nth)
    lit = str(value) if match is None else match
    if lit not in text:
        raise AssertionError(f"{fid}: {lit!r} not on {rel}:{line_no} -> {text.strip()!r}")
    rec = {"id": fid, "value": value, "source": f"{rel}:{line_no}", "match": lit}
    if note:
        rec["note"] = note
    FACTS.append(rec)
    _IDS.add(fid)


def add_span(fid: str, value, rel: str, first: int, last: int, match: list[str],
             note: str | None = None) -> None:
    """Multi-line fact: every `match[k]` must sit on line first+k."""
    lines = _lines(rel)
    for k, lit in enumerate(match):
        if lit not in lines[first - 1 + k]:
            raise AssertionError(f"{fid}: {lit!r} not on {rel}:{first + k}")
    rec = {"id": fid, "value": value, "source": f"{rel}:{first}-{last}", "match": match}
    if note:
        rec["note"] = note
    FACTS.append(rec)
    _IDS.add(fid)


def add_computed(fid: str, value, source: str, method: str) -> None:
    FACTS.append({"id": fid, "value": value, "source": source, "method": method})
    _IDS.add(fid)


def num(x: float) -> str:
    """Render a python float the way the source literal is written (0.10, 0.5...)."""
    return repr(x)


# --------------------------------------------------------------------------
# imports of the real code
# --------------------------------------------------------------------------
from app.agents import state as S  # noqa: E402
from app.agents.graph import diagnostic_graph  # noqa: E402
from app.agents.tools import reroute_tool  # noqa: E402
from app.core import celery_app as C  # noqa: E402
from app.core import security as SEC  # noqa: E402
from app.db.postgres.models import EvalType, IncidentStatus  # noqa: E402
from app.eval import drift as D  # noqa: E402
from app.eval import judge_router as J  # noqa: E402
from app.eval import synthetic_qa as QA  # noqa: E402
from app.router import selector as SEL  # noqa: E402
from app.router.tiers import default_tiers  # noqa: E402
from app.tasks import eval_tasks as E  # noqa: E402
from app.tasks import scheduled as SCH  # noqa: E402
from app.tasks.diagnostic_tasks import run_diagnostic  # noqa: E402

B = "backend/"
F = "frontend/"

# --------------------------------------------------------------------------
# brand + author voice
# --------------------------------------------------------------------------
readme = _lines("README.md")
logo = [readme[i].rstrip() for i in range(3, 9)]
add_span("brand.logo", logo, "README.md", 4, 9, logo, note="ASCII brand asset, drawn cell by cell")
tag_line, tag_text = locate("README.md", r"^\*Who watches the watchmen")
tagline = tag_text.strip().strip("*")
add("brand.tagline", tagline, "README.md", r"^\*Who watches the watchmen")
add("brand.tagline_short", tagline.split(". ")[0] + ".", "README.md", r"^\*Who watches the watchmen",
    match="Who watches the watchmen.")
add("brand.mark", "◆", F + "src/components/layout/Sidebar.tsx", "◆")
add("brand.name", "Ledger", F + "src/components/layout/Sidebar.tsx", r"^\s+Ledger\s*$",
    after=r"text-status-healthy")
add("brand.mark_color", "#22c55e", F + "tailwind.config.ts", r"healthy: '#22c55e'")

origin = subprocess.run(["git", "-C", str(REPO), "config", "--get", "remote.origin.url"],
                        capture_output=True, text=True, check=True).stdout.strip()
repo_url = re.sub(r"^https?://", "", origin)
repo_url = re.sub(r"\.git$", "", repo_url)
add_computed("brand.repo", repo_url, ".git/config [remote \"origin\"] url",
             "git config --get remote.origin.url, scheme and .git stripped")

POST = "linkedin_post.txt"
add("voice.slower", "Most observability tools tell you your LLM app got slower.", POST, r"got slower\.")
add("voice.dumber", "Almost none tell you why it got dumber.", POST, r"got dumber\.")
add("voice.every_trace", "Score every trace, not a sample", POST, r"Score every trace")
add("voice.refuses", "it refuses to guess", POST, r"refuses to guess")
add("voice.metric", "an eval score that only renders a dashboard is a metric.", POST, r"is a metric\.")
add("voice.system", "One that produces a diagnosis and a tool call is a system.", POST, r"is a system\.")
add("voice.functional", "the UI is functional, not beautiful", POST, r"functional, not beautiful")
add("voice.otlp", "OTel traces land over OTLP.", POST, r"OTel traces land over OTLP", match="OTel traces land over OTLP")

# --------------------------------------------------------------------------
# ingest
# --------------------------------------------------------------------------
add("api.prefix", "/api/v1", B + "app/main.py", r'include_router\(api_router, prefix="/api/v1"\)')
add("api.traces.path", "/traces", B + "app/api/v1/endpoints/traces.py", r'@router\.post\("/traces"',
    match='@router.post("/traces"')
add("api.traces.method", "POST", B + "app/api/v1/endpoints/traces.py", r'@router\.post\("/traces"',
    match="post")
add("api.header", "X-API-Key", B + "app/core/security.py", r'alias="X-API-Key"')
add("api.scope.ingestion", SEC.SCOPE_INGESTION, B + "app/core/security.py", r'^SCOPE_INGESTION = ')
add("api.scope.admin", SEC.SCOPE_ADMIN, B + "app/core/security.py", r'^SCOPE_ADMIN = ')
add("api.status.missing_key", 401, B + "app/core/security.py", r"HTTP_401_UNAUTHORIZED", match="401")
add("api.status.wrong_scope", 403, B + "app/core/security.py", r"HTTP_403_FORBIDDEN", match="403")
add("api.status.bad_content_type", 415, B + "app/api/v1/endpoints/traces.py", r"status_code=415")
add("api.status.malformed", 400, B + "app/api/v1/endpoints/traces.py", r"status_code=400")
add("api.status.never", 500, B + "app/api/v1/endpoints/traces.py", r"never 500", match="never 500")
add("api.status.broker_down", 503, B + "app/api/v1/endpoints/traces.py", r"status_code=503")
add("api.broker_ping_s", 1, B + "app/api/v1/endpoints/traces.py", r"socket_connect_timeout=1",
    match="socket_connect_timeout=1")
for field in ("task_id", "accepted_spans", "traces", "trace_ids"):
    add(f"api.accepted.{field}", field, B + "app/api/v1/endpoints/traces.py", rf"^\s+{field}: ",
        after=r"^class IngestAccepted")
add("otlp.protobuf", "protobuf", B + "app/ingestion/otel_receiver.py", r'"application/x-protobuf"',
    match="protobuf")
add("otlp.json", "json", B + "app/ingestion/otel_receiver.py", r'ct == "application/json"', match="json")
add("otlp.name", "OTLP", B + "app/api/v1/endpoints/traces.py", r'summary="Ingest OTLP traces', match="OTLP")

add("celery.queue.ingestion", "ingestion", B + "app/core/celery_app.py",
    r'"app\.tasks\.ingestion_tasks\.\*": \{"queue": "ingestion"\}')
add("celery.queue.eval", "eval", B + "app/core/celery_app.py",
    r'"app\.tasks\.eval_tasks\.\*": \{"queue": "eval"\}')
add("celery.queue.diagnostic", run_diagnostic.queue, B + "app/tasks/diagnostic_tasks.py", r'queue="diagnostic"')
add("task.ingest", "ingest_traces", B + "app/tasks/ingestion_tasks.py", r"^def ingest_traces\(")
add("task.eval", "eval_trace", B + "app/tasks/eval_tasks.py", r"^def eval_trace\(")
add("task.eval_chain", "eval_trace.delay", B + "app/tasks/ingestion_tasks.py", r"eval_trace\.delay\(tid\)")
add("task.diag", "run_diagnostic", B + "app/tasks/diagnostic_tasks.py", r"^def run_diagnostic\(")
add("task.diag_delay", "run_diagnostic.delay", B + "app/tasks/eval_tasks.py", r"run_diagnostic\.delay\(")
add("task.diag.max_retries", run_diagnostic.max_retries, B + "app/tasks/diagnostic_tasks.py",
    r"max_retries=2", match="max_retries=2")
add("task.langfuse_nonfatal", "non-fatal", B + "app/tasks/ingestion_tasks.py", r"non-fatal, per-trace isolated")

add("ch.table", "ledger.traces", B + "app/db/clickhouse/schema.sql", r"CREATE TABLE IF NOT EXISTS ledger\.traces")
add("ch.engine", "MergeTree", B + "app/db/clickhouse/schema.sql", r"^ENGINE = MergeTree", after=r"ledger\.traces")
add("ch.partition", "event_date", B + "app/db/clickhouse/schema.sql", r"^PARTITION BY event_date",
    after=r"ledger\.traces")
add("ch.partition_day", "toDate(start_time)", B + "app/db/clickhouse/schema.sql", r"toDate\(start_time\)")
add("ch.ttl_days", 90, B + "app/db/clickhouse/schema.sql", r"INTERVAL 90 DAY", after=r"ledger\.traces")
add("ch.name", "ClickHouse", B + "app/db/clickhouse/client.py", r"^\"\"\"Async ClickHouse client")
add("langfuse.name", "Langfuse", B + "app/tasks/ingestion_tasks.py", r"Langfuse push", match="Langfuse")

# --------------------------------------------------------------------------
# eval + judge + flag
# --------------------------------------------------------------------------
for m in ("faithfulness", "context_precision", "context_recall"):
    add(f"eval.ragas.{m}", m, B + "app/eval/ragas_runner.py", rf"^\s+{m}: float")
for m in ("answer_relevance", "hallucination"):
    add(f"eval.deepeval.{m}", m, B + "app/eval/deepeval_runner.py", rf"^\s+{m}: float")
add("eval.ragas.name", "RAGAS", B + "app/eval/ragas_runner.py", r"^\"\"\"RAGAS scoring")
add("eval.deepeval.name", "DeepEval", B + "app/eval/deepeval_runner.py", r"^\"\"\"DeepEval scoring")
add("eval.precision_type", EvalType.retrieval_precision.value, B + "app/eval/runner.py",
    r'"context_precision": EvalType\.retrieval_precision', match="retrieval_precision")

add("judge.class", "JudgeRouter", B + "app/eval/judge_router.py", r"^class JudgeRouter")
add("judge.tiers", sorted(J.PRIMARY_JUDGE_TIERS), B + "app/eval/judge_router.py",
    r'^PRIMARY_JUDGE_TIERS = \{"cerebras", "groq", "ollama"\}', match='{"cerebras", "groq", "ollama"}')
add("judge.cross_validation", J.CROSS_VALIDATION_TIER, B + "app/eval/judge_router.py",
    r'^CROSS_VALIDATION_TIER = "gemini"')
add("judge.denylist", "PAID_PROVIDERS", B + "app/eval/judge_router.py", r"^PAID_PROVIDERS = ")
add("judge.error", J.PaidJudgeError.__name__, B + "app/eval/judge_router.py", r"^class PaidJudgeError")
add("judge.reassert", "if resp.provider in PAID_PROVIDERS:", B + "app/eval/judge_router.py",
    r"if resp\.provider in PAID_PROVIDERS:", note="re-asserted after every judge call returns")
add("judge.nonpaid", "non-paid", B + "app/eval/judge_router.py", r"primary judge pool \(free, non-paid\)")

add("flag.fn", "_flag_reasons", B + "app/tasks/eval_tasks.py", r"^def _flag_reasons\(")
add("flag.key", "flagged", B + "app/tasks/eval_tasks.py", r'"flagged": flagged,')
add("flag.low", E.LOW_SCORE, B + "app/tasks/eval_tasks.py", r"^LOW_SCORE = ", match=num(E.LOW_SCORE))
add("flag.hallucination", E.HIGH_HALLUCINATION, B + "app/tasks/eval_tasks.py", r"^HIGH_HALLUCINATION = ",
    match=num(E.HIGH_HALLUCINATION))


class _AllBad:  # every per-trace threshold tripped -> the full reason vocabulary
    faithfulness = answer_relevance = context_precision = context_recall = 0.0
    hallucination = 1.0


reasons = E._flag_reasons(_AllBad())
for r in reasons:
    add(f"flag.reason.{r}", r, B + "app/tasks/eval_tasks.py", rf'reasons\.append\("{r}"\)')
add("flag.reason.faithfulness_drift", "faithfulness_drift", B + "app/tasks/eval_tasks.py",
    r'reasons\.append\("faithfulness_drift"\)')
add("eval.drift_call", "detect_drift(session, EvalType.faithfulness, persist=False)",
    B + "app/tasks/eval_tasks.py", r"drift\.detect_drift\(session, EvalType\.faithfulness, persist=False\)")

# --------------------------------------------------------------------------
# drift
# --------------------------------------------------------------------------
add("drift.module", "app/eval/drift.py", B + "app/eval/drift.py", r"^\"\"\"Drift detection",
    match="Drift detection", note="module path shown as a breadcrumb")
add("drift.fn", "detect_drift", B + "app/eval/drift.py", r"^async def detect_drift\(")
add("drift.window", D.DEFAULT_WINDOW, B + "app/eval/drift.py", r"^DEFAULT_WINDOW = ")
add("drift.threshold", D.DEFAULT_THRESHOLD, B + "app/eval/drift.py", r"^DEFAULT_THRESHOLD = ",
    match=num(D.DEFAULT_THRESHOLD))
for et, val in D.DEFAULT_BASELINE.items():
    lit = f"{val:.2f}"
    add(f"drift.baseline.{et.value}", val, B + "app/eval/drift.py", rf"EvalType\.{et.value}: {lit}", match=lit)
add("drift.inverted", EvalType.hallucination.value, B + "app/eval/drift.py", r"LOWER is better",
    match="hallucination")
floor = round(D.DEFAULT_BASELINE[EvalType.faithfulness] - D.DEFAULT_THRESHOLD, 2)
add_computed("drift.floor.faithfulness", floor, B + "app/eval/drift.py:75",
             "baseline(faithfulness) - DEFAULT_THRESHOLD: drifted when (base - window_mean) > threshold")
add("drift.beat_metrics", [m.value for m in SCH._DRIFT_METRICS], B + "app/tasks/scheduled.py",
    r"^_DRIFT_METRICS = ", match="EvalType.faithfulness, EvalType.answer_relevance")

# --------------------------------------------------------------------------
# swarm
# --------------------------------------------------------------------------
graph_nodes = [n for n in diagnostic_graph.get_graph().nodes if not n.startswith("__")]
node_src = {
    "classifier": r'g\.add_node\("classifier"',
    S.N_RETRIEVAL: r"g\.add_node\(N_RETRIEVAL",
    S.N_INDEX: r"g\.add_node\(N_INDEX",
    S.N_PROMPT: r"g\.add_node\(N_PROMPT",
    S.N_MODEL: r"g\.add_node\(N_MODEL",
    "decision": r'g\.add_node\("decision"',
    "remediation": r'g\.add_node\("remediation"',
    "human_review": r'g\.add_node\("human_review"',
}
assert sorted(graph_nodes) == sorted(node_src), graph_nodes
add_computed("swarm.node_count", len(graph_nodes), B + "app/agents/graph.py:64-72",
             "diagnostic_graph.get_graph().nodes minus __start__/__end__")
for n, pat in node_src.items():
    lit = n if n in ("classifier", "decision", "remediation", "human_review") else None
    if lit:
        add(f"swarm.node.{n}", n, B + "app/agents/graph.py", pat)
    else:
        const = {S.N_RETRIEVAL: "N_RETRIEVAL", S.N_INDEX: "N_INDEX", S.N_PROMPT: "N_PROMPT",
                 S.N_MODEL: "N_MODEL"}[n]
        add(f"swarm.node.{n}", n, B + "app/agents/state.py", rf'^{const} = "{n}"')
add("swarm.graph_lib", "LangGraph", B + "app/agents/state.py", r"^\"\"\"Shared LangGraph state")
add("swarm.reducer", "operator.add", B + "app/agents/state.py", r"findings: Annotated\[list\[Finding\], operator\.add\]")
add("swarm.classifier.deterministic", "DETERMINISTIC", B + "app/agents/nodes/classifier.py",
    r"routing is driven by a DETERMINISTIC")
add("swarm.classifier.advisory", "does not override the heuristic", B + "app/agents/nodes/classifier.py",
    r"does not override the heuristic")
add("swarm.signal_threshold", S.CLASSIFIER_SIGNAL_THRESHOLD, B + "app/agents/state.py",
    r"^CLASSIFIER_SIGNAL_THRESHOLD = ", match=num(S.CLASSIFIER_SIGNAL_THRESHOLD))
add("swarm.decision_threshold", S.DECISION_CONFIDENCE_THRESHOLD, B + "app/agents/state.py",
    r"^DECISION_CONFIDENCE_THRESHOLD = ", match=num(S.DECISION_CONFIDENCE_THRESHOLD))
add("swarm.ambiguity_margin", S.AMBIGUITY_MARGIN, B + "app/agents/state.py", r"^AMBIGUITY_MARGIN = ",
    match="0.10")
add("swarm.ambiguity_margin_cross", S.AMBIGUITY_MARGIN_CROSS, B + "app/agents/state.py",
    r"^AMBIGUITY_MARGIN_CROSS = ", match=num(S.AMBIGUITY_MARGIN_CROSS))
for rc, bucket in S.ROOT_CAUSE_BUCKET.items():
    const = {S.RETRIEVAL_FAILURE: "RETRIEVAL_FAILURE", S.INDEX_STALENESS: "INDEX_STALENESS",
             S.PROMPT_REGRESSION: "PROMPT_REGRESSION", S.MODEL_DEGRADATION: "MODEL_DEGRADATION"}[rc]
    add(f"rootcause.{rc}", rc, B + "app/agents/state.py", rf'^{const} = "{rc}"')
    add(f"bucket.{rc}", bucket, B + "app/agents/state.py", rf"^\s+{const}: \"{bucket}\"")

DEC = B + "app/agents/nodes/decision.py"
add("decision.reason.low_confidence", "low_confidence", DEC, r'review, reason = True, "low_confidence"')
add("decision.reason.mixed_signal", "mixed_signal", DEC, r'review, reason, runner_up = True, "mixed_signal"')
add("decision.reason.ambiguous_tie", "ambiguous_tie", DEC, r'review, reason = True, "ambiguous_tie"')
add("decision.reason.no_candidate", "no_candidate", DEC, r'reason="no_candidate"\)')
add("decision.rule.low_confidence", "< DECISION_CONFIDENCE_THRESHOLD", DEC,
    r'if best\["confidence"\] < DECISION_CONFIDENCE_THRESHOLD', match="< DECISION_CONFIDENCE_THRESHOLD")
add("decision.rule.mixed_signal", "< AMBIGUITY_MARGIN_CROSS", DEC,
    r"\(best\[\"confidence\"\] - cross\[\"confidence\"\]\) < AMBIGUITY_MARGIN_CROSS", match="< AMBIGUITY_MARGIN_CROSS")
add("decision.rule.ambiguous_tie", "< AMBIGUITY_MARGIN", DEC,
    r"\(best\[\"confidence\"\] - runner_up\[\"confidence\"\]\) < AMBIGUITY_MARGIN\b", match="< AMBIGUITY_MARGIN")
add("decision.rule.no_candidate", "if not findings:", DEC, r"^\s+if not findings:",
    match="if not findings:")
add("decision.escalate_fmt", "escalate ({reason}): best=", DEC, r'f"escalate \(\{reason\}\): best=',
    match='escalate ({reason}): best=')
add("decision.top2", "top-2", B + "app/agents/state.py", r"^AMBIGUITY_MARGIN = .*same-bucket top-2", match="top-2")
add("decision.no_candidate_summary", "no candidate root cause", DEC, r'summary = "no candidate root cause')

REM = B + "app/agents/nodes/remediation.py"
add("remedy.retrieval_failure", "reindex", REM, r"^\s+retrieval_failure -> reindex \(stub\)", match="reindex (stub)")
add("remedy.index_staleness", "reindex", REM, r"^\s+index_staleness\s+-> reindex \(stub\)", match="reindex (stub)")
add("remedy.prompt_regression", "rollback", REM, r"^\s+prompt_regression -> rollback", match="rollback")
add("remedy.model_degradation", "reroute", REM, r"^\s+model_degradation -> reroute", match="reroute")
add("tool.reindex.status", "triggered_stub", B + "app/agents/tools/reindex_tool.py", r'"status": "triggered_stub"')
add("tool.reindex.is_stub", "STUB", B + "app/agents/tools/reindex_tool.py", r'^"""Reindex tool — STUB\.')
add("tool.rollback.status", "applied", B + "app/agents/tools/rollback_tool.py",
    r'"status": "already_applied" if already else "applied"', match='"applied"')
add("tool.reroute.priority", reroute_tool._DEPRIORITIZED, B + "app/agents/tools/reroute_tool.py",
    r"^_DEPRIORITIZED = ")
add("tool.reroute.disables", "row.is_enabled = False", B + "app/agents/tools/reroute_tool.py",
    r"row\.is_enabled = False")
add("human.action", "human_review_required", B + "app/agents/nodes/human_review.py",
    r'action="human_review_required"')
add("human.status", IncidentStatus.open.value, B + "app/agents/nodes/human_review.py",
    r"status=IncidentStatus\.open", match="open")
add("human.flag", "needs_human_review", B + "app/agents/nodes/_incident.py", r'"needs_human_review": review')
add("incident.status.resolved", IncidentStatus.resolved.value, B + "app/db/postgres/models.py",
    r'^\s+resolved = "resolved"')
add("incident.trail_jsonb", "JSONB", B + "app/db/postgres/models.py",
    r"diagnostic_trail: Mapped\[dict \| list \| None\] = mapped_column\(JSONB")
add("api.incident.get", "/incidents/{incident_id}", B + "app/api/v1/endpoints/incidents.py",
    r'@router\.get\("/incidents/\{incident_id\}"')
add("api.incident.patch", "/incidents/{incident_id}", B + "app/api/v1/endpoints/incidents.py",
    r'@router\.patch\("/incidents/\{incident_id\}"')
add("api.incident.note", "resolution_note", B + "app/api/v1/endpoints/incidents.py",
    r"resolution_note: str = Field\(min_length=3")

# --------------------------------------------------------------------------
# router
# --------------------------------------------------------------------------
TIERS = B + "app/router/tiers.py"
provider_file = {"cerebras": "cerebras.py", "groq": "groq.py", "gemini": "gemini.py", "ollama": "ollama.py"}
for t in default_tiers():
    anchor = rf'name="{t.name}"'
    add(f"tier.{t.name}.name", t.name, TIERS, anchor, match=f'"{t.name}"')
    add(f"tier.{t.name}.priority", t.priority, TIERS, r"priority=\d+", after=anchor,
        match=f"priority={t.priority}")
    add(f"tier.{t.name}.model", t.provider.default_model, B + f"app/router/providers/{provider_file[t.name]}",
        r'^\s+default_model = "')
    if t.is_floor:
        add(f"tier.{t.name}.is_floor", True, TIERS, r"is_floor=True", after=anchor, match="is_floor=True")
    else:
        rpm_lit = f"rpm={t.rpm}"
        rpd_lit = f"rpd={t.rpd:_}"
        add(f"tier.{t.name}.rpm", t.rpm, TIERS, r"rpm=\d+", after=anchor, match=rpm_lit)
        add(f"tier.{t.name}.rpd", t.rpd, TIERS, r"rpd=[\d_]+", after=anchor, match=rpd_lit)
add("router.floor_tier", SEL.FLOOR_TIER, B + "app/router/selector.py", r'^FLOOR_TIER = "ollama"')
SELF = B + "app/router/selector.py"
for why in ("disabled", "unavailable", "quality-gate", "unhealthy", "rate-limited", "daily-quota-exhausted"):
    add(f"router.skip.{why}", why, SELF, rf'return False, "{why}"')
add("router.floor_exempt", "floor", SELF, r'if spec\.is_floor:', note="checked after enabled/available/"
    "quality-gate/unhealthy, before the rate-limit and daily-quota gates", match="is_floor")
add("router.exhausted", "RouterExhausted", SELF, r"^class RouterExhausted")
add("router.floor_reason", "floor", SELF, r'return True, "floor"')
add("router.lua", "token bucket", B + "app/router/rate_limiter.py", r"^_TOKEN_BUCKET_LUA = ", match="TOKEN_BUCKET_LUA",
    note="Redis Lua token bucket")
add("router.daily", "daily quota", B + "app/router/rate_limiter.py", r"daily quota\s+— fixed-window counter")

# --------------------------------------------------------------------------
# celery
# --------------------------------------------------------------------------
CEL = B + "app/core/celery_app.py"
add("celery.queues", list(C.QUEUES), CEL, r'^QUEUES = \("default", "ingestion", "eval", "diagnostic"\)',
    match='("default", "ingestion", "eval", "diagnostic")')
add("celery.max_retries", C.BaseTask.max_retries, CEL, r"^\s+max_retries = 3")
add("celery.backoff", "exponential", CEL, r"retry_backoff = True\s+# exponential backoff", match="exponential")
add("celery.jitter", C.BaseTask.retry_jitter, CEL, r"^\s+retry_jitter = True")
add("celery.acks_late", C.BaseTask.acks_late, CEL, r"^\s+acks_late = True")
add("beat.drift_s", C.DRIFT_CHECK_INTERVAL, CEL, r"^DRIFT_CHECK_INTERVAL = ")
add("beat.health_s", C.HEALTH_PING_INTERVAL, CEL, r"^HEALTH_PING_INTERVAL = ")
add("beat.golden_s", C.GOLDEN_REFRESH_INTERVAL, CEL, r"^GOLDEN_REFRESH_INTERVAL = ")
add("beat.golden_stale_days", SCH.GOLDEN_STALE_DAYS, B + "app/tasks/scheduled.py", r"^GOLDEN_STALE_DAYS = ")

# --------------------------------------------------------------------------
# frontend
# --------------------------------------------------------------------------
add("fe.step_ms", 750, F + "src/features/diagnostic-swarm/hooks/useTrailReplay.ts", r"^const STEP_MS = 750")
add("fe.step_label", "step ▶", F + "src/features/diagnostic-swarm/IncidentTrailReplay.tsx",
    r"^\s+step ▶\s*$")
add("fe.play_label", "▶ play", F + "src/features/diagnostic-swarm/IncidentTrailReplay.tsx",
    r"'▶ play'")
add("fe.edge_pulse", "1.4s", F + "src/features/diagnostic-swarm/edges/AnimatedEdge.tsx",
    r'<animateMotion dur="1\.4s"')
add("fe.fall_formula", "Math.min(0.4 * target + 0.3, 2.5)",
    F + "src/features/router-cascade/components/FallbackAnimation.tsx", r"Math\.min\(0\.4 \* target \+ 0\.3, 2\.5\)")
add("fe.gauge_sweep", 0.9, F + "src/features/health-score/HealthGauge.tsx", r"duration: reducedMotion \? 0 : 0\.9")
add("fe.schema_mismatch", "[api] schema mismatch", F + "src/api/client.ts", r"\[api\] schema mismatch")
TW = F + "tailwind.config.ts"
for key, pat in (("surface", r"DEFAULT: '#0b0e14'"), ("raised", r"raised: '#12161f'"),
                 ("border", r"border: '#1e2530'"), ("fg", r"DEFAULT: '#e6e9ef'"),
                 ("muted", r"muted: '#94a3b8'"), ("healthy", r"healthy: '#22c55e'"),
                 ("degraded", r"degraded: '#eab308'"), ("down", r"down: '#ef4444'")):
    lit = re.search(r"#[0-9a-f]{6}", pat).group(0)
    add(f"token.{key}", lit, TW, pat, match=lit)
PKG = F + "package.json"
for key, pat, lit in (("react", r'"react": "\^19', "19"), ("vite", r'"vite": "\^8', "8"),
                      ("xyflow", r'"@xyflow/react"', "@xyflow/react"),
                      ("framer", r'"framer-motion"', "framer-motion"),
                      ("zod", r'"zod"', "zod"), ("tanstack", r'"@tanstack/react-query"', "@tanstack/react-query")):
    add(f"fe.dep.{key}", lit, PKG, pat)

# --------------------------------------------------------------------------
# seed data
# --------------------------------------------------------------------------
QAF = B + "app/eval/synthetic_qa.py"
refund = QA.CANONICAL_QA[0]
add("seed.question", refund["question"], QAF, r'"question": "What is the refund policy\?"')
add("seed.context", refund["contexts"][0], QAF, r'"Our refund policy allows customers')
add("seed.answer_good", refund["answer"], QAF, r'"answer": "Refunds are available within 30 days')
add("seed.hallucinated", QA.HALLUCINATED_ANSWERS[0], QAF, r'"Refunds are processed via carrier pigeon')
SEED = B + "scripts/seed_synthetic_traces.py"
add("seed.fault_rate", 0.30, SEED, r"fault = random\.random\(\) < 0\.30", match="0.30")
add("seed.fault_kinds", ["latency", "low_recall", "hallucination"], SEED,
    r'random\.choice\(\["latency", "low_recall", "hallucination"\]\)', match='["latency", "low_recall", "hallucination"]')
add("seed.span.generation", "rag.generation", SEED, r'"name": "rag\.generation"')
add("seed.attr.completion", "gen_ai.completion", SEED, r'"gen_ai\.completion": answer')
add("seed.attr.model", "gen_ai.request.model", SEED, r'"gen_ai\.request\.model": random\.choice')
add("seed.attr.documents", "retrieval.documents", SEED, r'"retrieval\.documents": json\.dumps\(contexts\)')
add("seed.span.retrieval", "rag.retrieval", SEED, r'"name": "rag\.retrieval"')
add("seed.hallucination_status", 2, SEED, r'err = 2 if fault_kind == "hallucination" else 0', match="err = 2",
    note="injected hallucination traces carry span status 2 (ERROR)")

# --------------------------------------------------------------------------
# tests + scenario labels
# --------------------------------------------------------------------------
test_files = sorted((BACKEND / "tests" / "integration").glob("test_*.py"))
n_tests = sum(len(re.findall(r"^\s*(?:async\s+)?def test_", p.read_text(encoding="utf-8"), re.M))
              for p in test_files)
add_computed("tests.count", n_tests, "backend/tests/integration/test_*.py",
             r"grep -c '^\s*(async )?def test_' over the integration test files")
add_computed("tests.files", len(test_files), "backend/tests/integration/test_*.py", "file count")
SW = B + "tests/integration/test_diagnostic_swarm.py"
add("tests.swarm_file", "tests/integration/test_diagnostic_swarm.py", SW, r'^"""Diagnostic swarm integration tests',
    match="Diagnostic swarm integration tests")
add("scenario.A", "Scenario A", SW, r"^# Scenario A: retrieval failure")
add("scenario.B", "Scenario B", SW, r"^# Scenario B: prompt regression")
add("scenario.C", "Scenario C", SW, r"^# Scenario C: mixed signal")

# --------------------------------------------------------------------------
# stack line (declared dependencies)
# --------------------------------------------------------------------------
PY = B + "pyproject.toml"
add("stack.fastapi", "FastAPI", PY, r'"fastapi>=', match="fastapi")
add("stack.langgraph", "LangGraph", PY, r'"langgraph>=', match="langgraph")
add("stack.celery", "Celery", PY, r'"celery>=', match="celery")
add("stack.clickhouse", "ClickHouse", PY, r'"clickhouse-connect>=', match="clickhouse")
add("stack.ragas", "RAGAS", PY, r'"ragas>=', match="ragas")
add("stack.deepeval", "DeepEval", PY, r'"deepeval>=', match="deepeval")
add("stack.reactflow", "React Flow", "README.md", r"@xyflow/react 12\.11 \(React Flow\)", match="React Flow")
add("stack.ollama", "Ollama", B + "app/router/providers/ollama.py", r"^\"\"\"Tier 4 — Ollama \(local\)",
    match="Ollama")

# --------------------------------------------------------------------------
head = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"],
                      capture_output=True, text=True, check=True).stdout.strip()
out = {
    "generated_by": "video/tools/extract_facts.py",
    "repo_head": head,
    "count": len(FACTS),
    "facts": FACTS,
}
dest = VIDEO / "src" / "data" / "facts.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"facts: {len(FACTS)} -> {dest.relative_to(REPO)}")
