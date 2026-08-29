from __future__ import annotations

import asyncio
from time import perf_counter

import httpx
from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings, get_settings


class ComponentHealth(BaseModel):
    status: str
    latency_ms: float | None = None


class ReadinessResult(BaseModel):
    ready: bool
    database: ComponentHealth
    redis: ComponentHealth


class ReadinessService:
    def __init__(
        self,
        *,
        settings: Settings,
        database_engine: AsyncEngine | None,
        http_client: httpx.AsyncClient,
    ) -> None:
        self.settings = settings
        self.database_engine = database_engine
        self.http_client = http_client

    async def _database(self) -> ComponentHealth:
        if self.database_engine is None:
            return ComponentHealth(status="not_configured")

        started = perf_counter()
        try:
            async with asyncio.timeout(self.settings.readiness_timeout_seconds):
                async with self.database_engine.connect() as connection:
                    await connection.execute(text("select 1"))
            return ComponentHealth(
                status="ok",
                latency_ms=round((perf_counter() - started) * 1000, 2),
            )
        except Exception:
            return ComponentHealth(
                status="error",
                latency_ms=round((perf_counter() - started) * 1000, 2),
            )

    async def _redis(self) -> ComponentHealth:
        if not self.settings.upstash_redis_rest_url or not self.settings.upstash_token:
            return ComponentHealth(status="not_configured")

        started = perf_counter()
        try:
            response = await self.http_client.get(
                f"{self.settings.upstash_redis_rest_url.rstrip('/')}/ping",
                headers={"Authorization": f"Bearer {self.settings.upstash_token}"},
                timeout=self.settings.readiness_timeout_seconds,
            )
            response.raise_for_status()
            is_pong = response.json().get("result") == "PONG"
            return ComponentHealth(
                status="ok" if is_pong else "error",
                latency_ms=round((perf_counter() - started) * 1000, 2),
            )
        except (httpx.HTTPError, ValueError):
            return ComponentHealth(
                status="error",
                latency_ms=round((perf_counter() - started) * 1000, 2),
            )

    async def check(self) -> ReadinessResult:
        database, redis = await asyncio.gather(self._database(), self._redis())
        return ReadinessResult(
            ready=database.status == "ok" and redis.status == "ok",
            database=database,
            redis=redis,
        )


async def get_readiness_service(request: Request) -> ReadinessService:
    settings: Settings | None = getattr(request.app.state, "settings", None)
    settings = settings or get_settings()
    engine: AsyncEngine | None = getattr(request.app.state, "database_engine", None)
    http_client: httpx.AsyncClient = request.app.state.http_client
    return ReadinessService(
        settings=settings,
        database_engine=engine,
        http_client=http_client,
    )
