"""Integration smoke tests: real round-trip against Postgres and ClickHouse.

Requires the docker-compose stack running (postgres on :5433, clickhouse on
:8123) with migrations + ClickHouse schema applied.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.db.clickhouse.client import clickhouse_client
from app.db.postgres.models import Incident, IncidentStatus, RootCause
from app.db.postgres.session import AsyncSessionLocal


@pytest.mark.asyncio
async def test_postgres_incident_roundtrip():
    trace_id = f"test-{uuid.uuid4().hex[:12]}"

    async with AsyncSessionLocal() as session:
        incident = Incident(
            trace_id=trace_id,
            root_cause=RootCause.retrieval_failure,
            status=IncidentStatus.open,
            classification_confidence=0.91,
            remediation_action="reindex_vector_store",
        )
        session.add(incident)
        await session.commit()
        await session.refresh(incident)
        incident_id = incident.id

    assert incident_id is not None

    async with AsyncSessionLocal() as session:
        fetched = (
            await session.execute(select(Incident).where(Incident.id == incident_id))
        ).scalar_one()
        assert fetched.trace_id == trace_id
        assert fetched.root_cause is RootCause.retrieval_failure
        assert fetched.status is IncidentStatus.open
        assert fetched.classification_confidence == pytest.approx(0.91)
        assert fetched.created_at is not None

    # cleanup
    async with AsyncSessionLocal() as session:
        obj = await session.get(Incident, incident_id)
        await session.delete(obj)
        await session.commit()


@pytest.mark.asyncio
async def test_clickhouse_traces_roundtrip():
    trace_id = f"test-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    columns = [
        "trace_id",
        "span_id",
        "parent_span_id",
        "name",
        "start_time",
        "end_time",
        "duration_ms",
        "status",
        "attributes",
    ]
    row = [trace_id, "span-1", "", "unit-test-span", now, now, 12.5, "OK", {"env": "test"}]

    await clickhouse_client.insert("ledger.traces", [row], columns)

    result = await clickhouse_client.execute(
        "SELECT trace_id, name, duration_ms, status, attributes "
        "FROM ledger.traces WHERE trace_id = {tid:String}",
        {"tid": trace_id},
    )
    rows = result.result_rows
    assert len(rows) == 1
    assert rows[0][0] == trace_id
    assert rows[0][1] == "unit-test-span"
    assert rows[0][2] == pytest.approx(12.5)
    assert rows[0][3] == "OK"
    assert rows[0][4]["env"] == "test"

    # cleanup (lightweight delete mutation)
    await clickhouse_client.execute(
        "ALTER TABLE ledger.traces DELETE WHERE trace_id = {tid:String}",
        {"tid": trace_id},
    )

    await clickhouse_client.close()
