from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def fetch_page(
    connection: AsyncConnection,
    statement: str,
    parameters: dict[str, Any],
) -> tuple[list[dict[str, Any]], int]:
    result = await connection.execute(text(statement), parameters)
    rows = [dict(row) for row in result.mappings().all()]
    if not rows:
        return [], 0

    total = int(rows[0].pop("total_count"))
    for row in rows[1:]:
        row.pop("total_count", None)
    return rows, total


async def fetch_all(
    connection: AsyncConnection,
    statement: str,
    parameters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    result = await connection.execute(text(statement), parameters or {})
    return [dict(row) for row in result.mappings().all()]


async def fetch_one(
    connection: AsyncConnection,
    statement: str,
    parameters: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    result = await connection.execute(text(statement), parameters or {})
    row = result.mappings().one_or_none()
    return dict(row) if row is not None else None
