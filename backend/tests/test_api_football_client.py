from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest

from app.providers.sports.api_football.client import ApiFootballClient
from app.providers.sports.errors import (
    ProviderAuthenticationError,
    ProviderPayloadError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from app.providers.sports.usage import ApiUsageEvent


def envelope(
    response: list[dict[str, Any]] | dict[str, Any],
    *,
    current: int = 1,
    total: int = 1,
    errors: dict[str, Any] | list[Any] | None = None,
) -> dict[str, Any]:
    return {
        "get": "fixtures",
        "parameters": {},
        "errors": errors or [],
        "results": len(response) if isinstance(response, list) else 1,
        "paging": {"current": current, "total": total},
        "response": response,
    }


class MemoryCache:
    def __init__(self) -> None:
        self.values: dict[str, dict[str, Any]] = {}
        self.ttls: list[int] = []

    async def get(self, key: str) -> dict[str, Any] | None:
        return self.values.get(key)

    async def set(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        self.values[key] = value
        self.ttls.append(ttl_seconds)

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
) -> tuple[ApiFootballClient, httpx.AsyncClient]:
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = ApiFootballClient(
        api_key="server-secret",
        base_url="https://v3.football.api-sports.io",
        http_client=http_client,
        cache=cache,
        usage_recorder=recorder,
        max_retries=max_retries,
        backoff_jitter_seconds=0,
        sleep=sleep,
    )
    return client, http_client


@pytest.mark.anyio
async def test_success_uses_server_header_and_exposes_quota_metadata() -> None:
    requests: list[httpx.Request] = []
    recorder = MemoryUsageRecorder()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json=envelope([{"fixture": {"id": 1}}]),
            headers={
                "x-ratelimit-requests-limit": "100",
                "x-ratelimit-requests-remaining": "99",
                "x-ratelimit-limit": "10",
                "x-ratelimit-remaining": "9",
            },
        )

    client, http_client = make_client(handler, recorder=recorder)
    try:
        result = await client.get("/fixtures", params={"id": 1}, ttl_seconds=60)
    finally:
        await http_client.aclose()

    assert requests[0].headers["x-apisports-key"] == "server-secret"
    assert "server-secret" not in str(requests[0].url)
    assert result.metadata.quota_limit == 100
    assert result.metadata.quota_remaining == 99
    assert result.metadata.external_requests == 1
    assert recorder.events[0].metadata["minute_remaining"] == 9


@pytest.mark.anyio
async def test_retry_after_and_telemetry_cover_every_attempt() -> None:
    attempts = 0
    delays: list[float] = []
    recorder = MemoryUsageRecorder()

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, json={}, headers={"retry-after": "0.2"})
        return httpx.Response(200, json=envelope([{"id": 1}]))

    async def capture_sleep(delay: float) -> None:
        delays.append(delay)

    client, http_client = make_client(handler, recorder=recorder, sleep=capture_sleep)
    try:
        result = await client.get("fixtures", ttl_seconds=10)
    finally:
        await http_client.aclose()

    assert attempts == 2
    assert delays == [0.2]
    assert result.metadata.external_requests == 2
    assert [event.response_status for event in recorder.events] == [429, 200]


@pytest.mark.anyio
async def test_exhausted_retryable_errors_are_classified() -> None:
    def unavailable(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={})

    client, http_client = make_client(unavailable, max_retries=1)
    try:
        with pytest.raises(ProviderUnavailableError) as captured:
            await client.get("fixtures", ttl_seconds=10)
    finally:
        await http_client.aclose()
    assert captured.value.retryable is True

    def limited(_: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={}, headers={"retry-after": "1"})

    client, http_client = make_client(limited, max_retries=0)
    try:
        with pytest.raises(ProviderRateLimitError) as captured:
            await client.get("fixtures", ttl_seconds=10)
    finally:
        await http_client.aclose()
    assert captured.value.retry_after_seconds == 1


@pytest.mark.anyio
async def test_transport_failures_retry_without_leaking_low_level_details() -> None:
    calls = 0
    recorder = MemoryUsageRecorder()

    def disconnected(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError("upstream disconnected", request=request)

    client, http_client = make_client(disconnected, recorder=recorder, max_retries=1)
    try:
        with pytest.raises(ProviderUnavailableError) as captured:
            await client.get("fixtures", ttl_seconds=10)
    finally:
        await http_client.aclose()

    assert calls == 2
    assert len(recorder.events) == 2
    assert all(event.response_status is None for event in recorder.events)
    assert "upstream disconnected" not in str(captured.value)


@pytest.mark.anyio
async def test_authentication_and_provider_payload_errors_are_not_retried() -> None:
    calls = 0

    def forbidden(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(403, json={})

    client, http_client = make_client(forbidden)
    try:
        with pytest.raises(ProviderAuthenticationError) as captured:
            await client.get("fixtures", ttl_seconds=10)
    finally:
        await http_client.aclose()
    assert calls == 1
    assert "server-secret" not in str(captured.value)

    def provider_error(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=envelope([], errors={"parameters": "Invalid fixture identifier"}),
        )

    client, http_client = make_client(provider_error)
    try:
        with pytest.raises(ProviderPayloadError):
            await client.get("fixtures", ttl_seconds=10)
    finally:
        await http_client.aclose()


@pytest.mark.anyio
async def test_cache_hit_avoids_external_request_and_retains_ttl() -> None:
    calls = 0
    cache = MemoryCache()

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=envelope([{"id": 7}]))

    client, http_client = make_client(handler, cache=cache)
    try:
        first = await client.get("fixtures", params={"id": 7}, ttl_seconds=45)
        second = await client.get("fixtures", params={"id": 7}, ttl_seconds=45)
    finally:
        await http_client.aclose()

    assert calls == 1
    assert cache.ttls == [45]
    assert first.metadata.from_cache is False
    assert second.metadata.from_cache is True
    assert second.metadata.external_requests == 0
    assert second.items == ({"id": 7},)
    assert second.observed_at == first.observed_at


@pytest.mark.anyio
async def test_pagination_is_bounded_and_aggregated() -> None:
    pages: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        page = request.url.params.get("page", "1")
        pages.append(page)
        return httpx.Response(
            200,
            json=envelope([{"page": int(page)}], current=int(page), total=2),
        )

    client, http_client = make_client(handler)
    try:
        result = await client.get("odds", ttl_seconds=60, all_pages=True)
    finally:
        await http_client.aclose()

    assert pages == ["1", "2"]
    assert result.items == ({"page": 1}, {"page": 2})
    assert result.metadata.external_requests == 2
    assert result.metadata.total_pages == 2
