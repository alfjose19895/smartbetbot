from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app.providers.sports.cache import UpstashSportsDataCache
from app.providers.sports.usage import ApiUsageEvent, SqlAlchemyApiUsageRecorder


@pytest.mark.anyio
async def test_upstash_cache_uses_rest_commands_ttl_and_bearer_authentication() -> None:
    commands: list[list[object]] = []
    authorizations: list[str] = []
    stored: str | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal stored
        command = json.loads(request.content)
        commands.append(command)
        authorizations.append(request.headers["authorization"])
        if command[0] == "SET":
            stored = command[2]
            return httpx.Response(200, json={"result": "OK"})
        return httpx.Response(200, json={"result": stored})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        cache = UpstashSportsDataCache(
            rest_url="https://cache.example.test",
            token="redis-secret",
            http_client=http_client,
        )
        await cache.set("sports:key", {"items": [{"id": 1}]}, 60)
        value = await cache.get("sports:key")
        await cache.close()

    assert commands[0][:2] == ["SET", "sports:key"]
    assert commands[0][-2:] == ["EX", 60]
    assert commands[1] == ["GET", "sports:key"]
    assert value == {"items": [{"id": 1}]}
    assert authorizations == ["Bearer redis-secret", "Bearer redis-secret"]


class FakeConnection:
    def __init__(self) -> None:
        self.parameters: dict[str, Any] | None = None

    async def execute(self, statement: object, parameters: dict[str, Any]) -> None:
        assert "insert into public.api_usage" in str(statement)
        self.parameters = parameters


class FakeTransaction:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection

    async def __aenter__(self) -> FakeConnection:
        return self.connection

    async def __aexit__(self, *args: object) -> None:
        return None


class FakeEngine:
    def __init__(self) -> None:
        self.connection = FakeConnection()

    def begin(self) -> FakeTransaction:
        return FakeTransaction(self.connection)


@pytest.mark.anyio
async def test_api_usage_recorder_writes_only_safe_operational_metadata() -> None:
    from datetime import UTC, datetime

    engine = FakeEngine()
    recorder = SqlAlchemyApiUsageRecorder(engine, worker="live")  # type: ignore[arg-type]
    event = ApiUsageEvent(
        provider="api_football",
        endpoint="/fixtures",
        response_status=200,
        rate_limit_remaining=99,
        duration_ms=42,
        metadata={"attempt": 1},
        requested_at=datetime(2026, 8, 25, tzinfo=UTC),
    )

    await recorder.record(event)

    parameters = engine.connection.parameters
    assert parameters is not None
    assert parameters["worker"] == "live"
    assert parameters["rate_limit_remaining"] == 99
    assert json.loads(parameters["metadata"]) == {"attempt": 1}
    assert "credential" not in parameters
    assert "headers" not in parameters
