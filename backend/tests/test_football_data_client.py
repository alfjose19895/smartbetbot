from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest

from app.providers.sports.errors import (
    ProviderAuthenticationError,
    ProviderRateLimitError,
)
from app.providers.sports.football_data.client import FootballDataClient
from app.providers.sports.usage import ApiUsageEvent


class MemoryCache:
    def __init__(self) -> None:
        self.values: dict[str, dict[str, Any]] = {}

    async def get(self, key: str) -> dict[str, Any] | None:
        return self.values.get(key)

    async def set(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        self.values[key] = value

    async def close(self) -> None:
        return None


class MemoryUsageRecorder:
    def __init__(self) -> None:
        self.events: list[ApiUsageEvent] = []

    async def record(self, event: ApiUsageEvent) -> None:
        self.events.append(event)


async def no_sleep(_: float) -> None:
    return None


def make_client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    cache: MemoryCache | None = None,
    recorder: MemoryUsageRecorder | None = None,
    max_retries: int = 2,
    sleep: Callable[[float], Awaitable[None]] = no_sleep,
) -> tuple[FootballDataClient, httpx.AsyncClient]:
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = FootballDataClient(
        api_key="server-secret",
        base_url="https://api.football-data.org/v4",
        http_client=http_client,
        cache=cache,
        usage_recorder=recorder,
        max_retries=max_retries,
        backoff_jitter_seconds=0,
        sleep=sleep,
    )
    return client, http_client


@pytest.mark.anyio
async def test_success_uses_private_header_and_exposes_minute_quota() -> None:
    requests: list[httpx.Request] = []
    recorder = MemoryUsageRecorder()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"count": 1, "competitions": [{"id": 2021}]},
            headers={
                "x-requests-available-minute": "9",
                "x-requestcounter-reset": "6",
            },
        )

    client, http_client = make_client(handler, recorder=recorder)
    try:
        result = await client.get("/competitions", ttl_seconds=60)
    finally:
        await http_client.aclose()

    assert requests[0].headers["x-auth-token"] == "server-secret"
    assert "server-secret" not in str(requests[0].url)
    assert result.metadata.quota_remaining == 9
    assert result.metadata.external_requests == 1
    assert recorder.events[0].metadata["counter_reset_seconds"] == 6


@pytest.mark.anyio
async def test_cache_hit_preserves_observation_and_avoids_second_request() -> None:
    calls = 0
    cache = MemoryCache()

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"teams": [{"id": 1}]})

    client, http_client = make_client(handler, cache=cache)
    try:
        first = await client.get("/teams", ttl_seconds=60)
        second = await client.get("/teams", ttl_seconds=60)
    finally:
        await http_client.aclose()

    assert calls == 1
    assert second.metadata.from_cache is True
    assert second.metadata.external_requests == 0
    assert second.observed_at == first.observed_at


@pytest.mark.anyio
async def test_rate_limit_retries_using_provider_reset_header() -> None:
    attempts = 0
    delays: list[float] = []

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, json={}, headers={"x-requestcounter-reset": "2"})
        return httpx.Response(200, json={"matches": []})

    async def capture_sleep(delay: float) -> None:
        delays.append(delay)

    client, http_client = make_client(handler, sleep=capture_sleep)
    try:
        result = await client.get("/matches", ttl_seconds=10)
    finally:
        await http_client.aclose()

    assert attempts == 2
    assert delays == [2]
    assert result.metadata.external_requests == 2


@pytest.mark.anyio
async def test_authentication_failure_is_safe_and_not_retried() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(403, json={"message": "bad token"})

    client, http_client = make_client(handler)
    try:
        with pytest.raises(ProviderAuthenticationError) as captured:
            await client.get("/competitions", ttl_seconds=10)
    finally:
        await http_client.aclose()

    assert calls == 1
    assert "server-secret" not in str(captured.value)


@pytest.mark.anyio
async def test_exhausted_rate_limit_is_classified() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={}, headers={"retry-after": "3"})

    client, http_client = make_client(handler, max_retries=0)
    try:
        with pytest.raises(ProviderRateLimitError) as captured:
            await client.get("/matches", ttl_seconds=10)
    finally:
        await http_client.aclose()

    assert captured.value.retry_after_seconds == 3
