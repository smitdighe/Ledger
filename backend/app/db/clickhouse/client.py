"""Async ClickHouse client wrapper (clickhouse-connect).

Thin layer over the async client exposing `execute()` (read/DDL) and
`insert()` (bulk row insert). One shared instance is lazily created.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import clickhouse_connect
from clickhouse_connect.driver.asyncclient import AsyncClient

from app.core.config import settings


class ClickHouseClient:
    def __init__(self) -> None:
        self._client: AsyncClient | None = None

    async def connect(self) -> AsyncClient:
        if self._client is None:
            self._client = await clickhouse_connect.get_async_client(
                host=settings.clickhouse_host,
                port=settings.clickhouse_port,
                username=settings.clickhouse_user,
                password=settings.clickhouse_password,
                database=settings.clickhouse_db,
            )
        return self._client

    async def execute(
        self, query: str, parameters: dict[str, Any] | None = None
    ) -> Any:
        """Run a query or DDL/DML statement.

        SELECT returns a QueryResult (`.result_rows`); DDL/DML statements are
        routed through `command` and return the driver summary.
        """
        client = await self.connect()
        stripped = query.lstrip().lower()
        if stripped.startswith(("select", "with", "show", "describe", "explain")):
            return await client.query(query, parameters=parameters)
        return await client.command(query, parameters=parameters)

    async def insert(
        self,
        table: str,
        data: Sequence[Sequence[Any]],
        column_names: Sequence[str],
    ) -> Any:
        """Bulk-insert rows. `data` is a list of row tuples matching `column_names`."""
        client = await self.connect()
        return await client.insert(
            table, list(data), column_names=list(column_names)
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None


clickhouse_client = ClickHouseClient()


async def get_clickhouse() -> ClickHouseClient:
    """FastAPI dependency returning the shared ClickHouse client."""
    await clickhouse_client.connect()
    return clickhouse_client
