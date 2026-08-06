"""SQLAlchemy (2.0, async) ORM models for Ledger metadata (Postgres).

Time-series traces/metrics live in ClickHouse; this store holds relational
metadata: incidents, eval results, prompt versions, router config, golden sets.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    pass


# --- enums -----------------------------------------------------------------
class RootCause(enum.Enum):
    retrieval_failure = "retrieval_failure"
    prompt_regression = "prompt_regression"
    model_degradation = "model_degradation"
    index_staleness = "index_staleness"


class IncidentStatus(enum.Enum):
    open = "open"
    classifying = "classifying"
    remediating = "remediating"
    resolved = "resolved"
    failed = "failed"


class EvalType(enum.Enum):
    faithfulness = "faithfulness"
    retrieval_precision = "retrieval_precision"
    context_recall = "context_recall"
    answer_relevance = "answer_relevance"
    hallucination = "hallucination"
    drift = "drift"


# --- models ----------------------------------------------------------------
class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trace_id: Mapped[str] = mapped_column(String(64), index=True)
    root_cause: Mapped[RootCause | None] = mapped_column(
        Enum(RootCause, name="root_cause", native_enum=True), nullable=True
    )
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status", native_enum=True),
        default=IncidentStatus.open,
        index=True,
    )
    classification_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    remediation_action: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # full diagnostic trail from the LangGraph swarm: nodes run, findings,
    # confidences, classification, chosen remediation.
    diagnostic_trail: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # loose association: eval results sharing this incident's trace_id.
    # trace lives in ClickHouse, so this is a non-FK viewonly relationship.
    eval_results: Mapped[list["EvalResult"]] = relationship(
        "EvalResult",
        primaryjoin="foreign(EvalResult.trace_id) == Incident.trace_id",
        viewonly=True,
        lazy="selectin",
    )


class EvalResult(Base):
    __tablename__ = "eval_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trace_id: Mapped[str] = mapped_column(String(64), index=True)
    eval_type: Mapped[EvalType] = mapped_column(
        Enum(EvalType, name="eval_type", native_enum=True), index=True
    )
    score: Mapped[float] = mapped_column(Float)
    judge_model: Mapped[str] = mapped_column(String(128))
    # model that GENERATED the response under eval (distinct from judge_model);
    # used to attribute quality scores back to a router tier.
    generator_model: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    golden_set_version: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    drift_flagged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    __table_args__ = (
        UniqueConstraint("prompt_name", "version", name="uq_prompt_name_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prompt_name: Mapped[str] = mapped_column(String(128), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RouterConfig(Base):
    __tablename__ = "router_configs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tier_name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(64))
    priority_order: Mapped[int] = mapped_column(Integer, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_health_check: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class GoldenSetEntry(Base):
    __tablename__ = "golden_set_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    query: Mapped[str] = mapped_column(Text)
    expected_answer: Mapped[str] = mapped_column(Text)
    expected_contexts: Mapped[list | dict | None] = mapped_column(JSONB, nullable=True)
    version: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
