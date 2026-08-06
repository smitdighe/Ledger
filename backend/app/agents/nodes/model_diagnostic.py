"""Model diagnostic — does degradation correlate with the generating tier?

Uses Phase 4 per-tier quality scores: if the tier that generated this trace's
response is materially worse than the others, that points at model_degradation.
"""
from __future__ import annotations

import structlog

from app.agents.state import MODEL_DEGRADATION, Finding, DiagnosticState, new_trail
from app.db.postgres.models import EvalType
from app.db.postgres.session import AsyncSessionLocal
from app.eval.quality import model_to_tier, tier_quality_scores

logger = structlog.get_logger(__name__)

_ABS_LOW = 0.6      # tier quality below this is concerning
_GAP = 0.15         # this-tier worse than the best tier by at least this


async def model_diagnostic(state: DiagnosticState) -> dict:
    tc = state.get("trace_context", {})
    gen_model = tc.get("generator_model")
    tier = model_to_tier(gen_model)

    async with AsyncSessionLocal() as s:
        scores = await tier_quality_scores(s, EvalType.faithfulness)

    tier_score = scores.get(tier) if tier else None
    best_other = max(
        (v for k, v in scores.items() if k != tier), default=None
    )

    confidence = 0.0
    if tier_score is not None:
        gap = (best_other - tier_score) if best_other is not None else 0.0
        if tier_score < _ABS_LOW and gap >= _GAP:
            confidence = round(min(1.0, (1.0 - tier_score) + gap), 3)
        elif tier_score < _ABS_LOW:
            confidence = round((1.0 - tier_score) * 0.5, 3)  # low but no comparison gap

    evidence = {
        "generator_model": gen_model,
        "generator_tier": tier,
        "tier_quality": tier_score,
        "best_other_tier_quality": best_other,
        "all_tier_scores": scores,
    }
    finding = Finding(
        node="model_diagnostic",
        root_cause_candidate=MODEL_DEGRADATION if confidence > 0 else None,
        confidence=confidence,
        supporting_evidence=evidence,
    )
    logger.info("node.model_diagnostic", trace_id=state.get("trace_id"), confidence=confidence, **evidence)
    return {
        "findings": [finding],
        "trail": new_trail(
            "model_diagnostic",
            f"model_degradation confidence={confidence:.2f} (tier={tier} score={tier_score})",
            **evidence,
        ),
    }
