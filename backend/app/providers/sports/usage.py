from __future__ import annotations

import json
from typing import Any, Protocol

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


class ApiUsageEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    provider: str
    endpoint: str
    http_method: str = "GET"
    response_status: int | None = Field(default=None, ge=100, le=599)
    requests_used: int = Field(default=1, ge=0)
    rate_limit_remaining: int | None = Field(default=None, ge=0)
    duration_ms: int = Field(ge=0)
    request_id: str | None = None
    worker: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    requested_at: AwareDatetime


class ApiUsageRecorder(Protocol):
    async def record(self, event: ApiUsageEvent) -> None: ...


class NullApiUsageRecorder:
    async def record(self, event: ApiUsageEvent) -> None:
        return None


class SqlAlchemyApiUsageRecorder:
    """Persists provider calls without coupling the adapter to a request transaction."""

    def __init__(self, engine: AsyncEngine, *, worker: str | None = None) -> None:
        self._engine = engine
        self._worker = worker

    async def record(self, event: ApiUsageEvent) -> None:
        values = event.model_dump(mode="json")
        if values["worker"] is None:
            values["worker"] = self._worker
        async with self._engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    insert into public.api_usage (
                      provider, endpoint, http_method, response_status, requests_used,
                      rate_limit_remaining, duration_ms, request_id, worker, metadata,
                      requested_at
                    ) values (
                      :provider, :endpoint, :http_method, :response_status, :requests_used,
                      :rate_limit_remaining, :duration_ms, :request_id, :worker,
                      cast(:metadata as jsonb), :requested_at
                    )
                    """
                ),
                {**values, "metadata": json.dumps(values["metadata"])},
            )
