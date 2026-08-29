from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
from collections.abc import Awaitable, Callable, Mapping
from datetime import UTC, datetime
from time import monotonic
from typing import Any

import httpx
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.domain.sports import ProviderRequestMetadata
from app.providers.sports.cache import NoopSportsDataCache, SportsDataCache
from app.providers.sports.errors import (
    ProviderAuthenticationError,
    ProviderPayloadError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from app.providers.sports.usage import ApiUsageEvent, ApiUsageRecorder, NullApiUsageRecorder

logger = logging.getLogger(__name__)


class _CachedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any]
    quota_remaining: int | None = Field(default=None, ge=0)
    observed_at: AwareDatetime


class FootballDataResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    payload: dict[str, Any]
    metadata: ProviderRequestMetadata
    observed_at: AwareDatetime


class FootballDataClient:
    """Small resilient HTTP client for football-data.org API v4."""

    provider_name = "football_data"
    _retryable_statuses = frozenset({429, 499, 500, 502, 503, 504})

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_seconds: float = 10,
        max_retries: int = 2,
        backoff_base_seconds: float = 1,
        backoff_max_seconds: float = 15,
        backoff_jitter_seconds: float = 0.25,
        usage_write_timeout_seconds: float = 2,
        cache: SportsDataCache | None = None,
        usage_recorder: ApiUsageRecorder | None = None,
        http_client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        random_source: Callable[[], float] = random.random,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._max_retries = max_retries
        self._backoff_base_seconds = backoff_base_seconds
        self._backoff_max_seconds = backoff_max_seconds
        self._backoff_jitter_seconds = backoff_jitter_seconds
        self._usage_write_timeout_seconds = usage_write_timeout_seconds
        self._cache = cache or NoopSportsDataCache()
        self._usage_recorder = usage_recorder or NullApiUsageRecorder()
        self._client = http_client or httpx.AsyncClient(timeout=timeout_seconds)
        self._owns_client = http_client is None
        self._sleep = sleep
        self._random = random_source

    async def get(
        self,
        endpoint: str,
        *,
        params: Mapping[str, str | int] | None = None,
        ttl_seconds: int,
        operation: str | None = None,
        request_id: str | None = None,
        worker: str | None = None,
    ) -> FootballDataResult:
        normalized_endpoint = "/" + endpoint.strip("/")
        operation_name = operation or normalized_endpoint.strip("/").replace("/", "_")
        normalized_params = {key: str(value) for key, value in (params or {}).items()}
        cache_key = self._cache_key(normalized_endpoint, normalized_params)
        requested_at = datetime.now(UTC)
        started = monotonic()

        cached = await self._read_cache(cache_key)
        if cached is not None:
            return FootballDataResult(
                payload=cached.payload,
                observed_at=cached.observed_at,
                metadata=ProviderRequestMetadata(
                    provider=self.provider_name,
                    operation=operation_name,
                    requested_at=requested_at,
                    duration_ms=(monotonic() - started) * 1000,
                    external_requests=0,
                    quota_remaining=cached.quota_remaining,
                    from_cache=True,
                ),
            )

        payload, headers, attempts = await self._request(
            normalized_endpoint,
            normalized_params,
            operation=operation_name,
            request_id=request_id,
            worker=worker,
        )
        quota_remaining = self._integer_header(headers, "x-requests-available-minute")
        observed_at = datetime.now(UTC)
        await self._write_cache(
            cache_key,
            _CachedPayload(
                payload=payload,
                quota_remaining=quota_remaining,
                observed_at=observed_at,
            ),
            ttl_seconds,
        )
        return FootballDataResult(
            payload=payload,
            observed_at=observed_at,
            metadata=ProviderRequestMetadata(
                provider=self.provider_name,
                operation=operation_name,
                requested_at=requested_at,
                duration_ms=(monotonic() - started) * 1000,
                external_requests=attempts,
                quota_remaining=quota_remaining,
            ),
        )

    async def _request(
        self,
        endpoint: str,
        params: Mapping[str, str],
        *,
        operation: str,
        request_id: str | None,
        worker: str | None,
    ) -> tuple[dict[str, Any], httpx.Headers, int]:
        url = f"{self._base_url}{endpoint}"
        for attempt in range(self._max_retries + 1):
            requested_at = datetime.now(UTC)
            started = monotonic()
            response: httpx.Response | None = None
            try:
                response = await self._client.get(
                    url,
                    params=params,
                    headers={
                        "Accept": "application/json",
                        "User-Agent": "smartbetbot/0.4.0",
                        "X-Auth-Token": self._api_key,
                    },
                )
                duration_ms = round((monotonic() - started) * 1000)
                await self._record_usage(
                    endpoint=endpoint,
                    status=response.status_code,
                    duration_ms=duration_ms,
                    headers=response.headers,
                    attempt=attempt + 1,
                    request_id=request_id,
                    worker=worker,
                    requested_at=requested_at,
                )
                if response.status_code in {401, 403}:
                    raise ProviderAuthenticationError(
                        provider=self.provider_name,
                        operation=operation,
                    )
                if response.status_code in self._retryable_statuses:
                    if attempt < self._max_retries:
                        await self._sleep(self._retry_delay(attempt, response.headers))
                        continue
                    if response.status_code == 429:
                        raise ProviderRateLimitError(
                            provider=self.provider_name,
                            operation=operation,
                            retry_after_seconds=self._retry_after(response.headers),
                        )
                    raise ProviderUnavailableError(
                        provider=self.provider_name,
                        operation=operation,
                    )
                if response.status_code >= 400:
                    raise ProviderPayloadError(provider=self.provider_name, operation=operation)
                try:
                    payload = response.json()
                except ValueError as error:
                    raise ProviderPayloadError(
                        provider=self.provider_name,
                        operation=operation,
                    ) from error
                if not isinstance(payload, dict):
                    raise ProviderPayloadError(provider=self.provider_name, operation=operation)
                return payload, response.headers, attempt + 1
            except httpx.TransportError as error:
                duration_ms = round((monotonic() - started) * 1000)
                await self._record_usage(
                    endpoint=endpoint,
                    status=None,
                    duration_ms=duration_ms,
                    headers=httpx.Headers(),
                    attempt=attempt + 1,
                    request_id=request_id,
                    worker=worker,
                    requested_at=requested_at,
                )
                if attempt < self._max_retries:
                    await self._sleep(self._retry_delay(attempt, httpx.Headers()))
                    continue
                raise ProviderUnavailableError(
                    provider=self.provider_name,
                    operation=operation,
                ) from error
        raise ProviderUnavailableError(provider=self.provider_name, operation=operation)

    async def _read_cache(self, key: str) -> _CachedPayload | None:
        try:
            value = await self._cache.get(key)
            return _CachedPayload.model_validate(value) if value is not None else None
        except Exception:
            logger.warning("sports_cache_read_failed", extra={"provider": self.provider_name})
            return None

    async def _write_cache(
        self,
        key: str,
        payload: _CachedPayload,
        ttl_seconds: int,
    ) -> None:
        try:
            await self._cache.set(key, payload.model_dump(mode="json"), ttl_seconds)
        except Exception:
            logger.warning("sports_cache_write_failed", extra={"provider": self.provider_name})

    async def _record_usage(
        self,
        *,
        endpoint: str,
        status: int | None,
        duration_ms: int,
        headers: httpx.Headers,
        attempt: int,
        request_id: str | None,
        worker: str | None,
        requested_at: datetime,
    ) -> None:
        event = ApiUsageEvent(
            provider=self.provider_name,
            endpoint=endpoint,
            response_status=status,
            rate_limit_remaining=self._integer_header(
                headers,
                "x-requests-available-minute",
            ),
            duration_ms=max(0, duration_ms),
            request_id=request_id,
            worker=worker,
            metadata={
                "attempt": attempt,
                "counter_reset_seconds": self._integer_header(
                    headers,
                    "x-requestcounter-reset",
                ),
            },
            requested_at=requested_at,
        )
        try:
            await asyncio.wait_for(
                self._usage_recorder.record(event),
                timeout=self._usage_write_timeout_seconds,
            )
        except Exception:
            logger.warning("api_usage_record_failed", extra={"provider": self.provider_name})

    def _retry_delay(self, attempt: int, headers: httpx.Headers) -> float:
        retry_after = self._retry_after(headers)
        if retry_after is not None:
            return min(retry_after, self._backoff_max_seconds)
        exponential = min(
            self._backoff_max_seconds,
            self._backoff_base_seconds * (2**attempt),
        )
        return exponential + (self._random() * self._backoff_jitter_seconds)

    @staticmethod
    def _retry_after(headers: httpx.Headers) -> float | None:
        raw_value = headers.get("retry-after") or headers.get("x-requestcounter-reset")
        if raw_value is None:
            return None
        try:
            return max(0, float(raw_value))
        except ValueError:
            return None

    @staticmethod
    def _integer_header(headers: httpx.Headers, name: str) -> int | None:
        value = headers.get(name)
        if value is None:
            return None
        try:
            return max(0, int(value))
        except ValueError:
            return None

    @classmethod
    def _cache_key(cls, endpoint: str, params: Mapping[str, str]) -> str:
        canonical = json.dumps(
            {"endpoint": endpoint, "params": dict(sorted(params.items()))},
            sort_keys=True,
            separators=(",", ":"),
        )
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        return f"sports:{cls.provider_name}:{digest}"

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
        await self._cache.close()
