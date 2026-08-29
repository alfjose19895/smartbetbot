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
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError

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


class _Paging(BaseModel):
    model_config = ConfigDict(extra="ignore")

    current: int = Field(default=1, ge=1)
    total: int = Field(default=1, ge=1)


class _Envelope(BaseModel):
    model_config = ConfigDict(extra="ignore")

    errors: dict[str, Any] | list[Any] = Field(default_factory=dict)
    results: int = Field(default=0, ge=0)
    paging: _Paging = Field(default_factory=_Paging)
    response: list[Any] | dict[str, Any] = Field(default_factory=list)


class _CachedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[dict[str, Any]]
    page: int = Field(ge=1)
    total_pages: int = Field(ge=1)
    quota_limit: int | None = Field(default=None, ge=0)
    quota_remaining: int | None = Field(default=None, ge=0)
    observed_at: AwareDatetime


class ApiFootballResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    items: tuple[dict[str, Any], ...]
    metadata: ProviderRequestMetadata
    observed_at: AwareDatetime


class ApiFootballClient:
    provider_name = "api_football"
    _retryable_statuses = frozenset({429, 499, 500, 502, 503, 504})

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_seconds: float = 10,
        max_retries: int = 2,
        backoff_base_seconds: float = 0.5,
        backoff_max_seconds: float = 8,
        backoff_jitter_seconds: float = 0.25,
        max_pages: int = 20,
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
        self._max_pages = max_pages
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
        all_pages: bool = False,
        operation: str | None = None,
        request_id: str | None = None,
        worker: str | None = None,
    ) -> ApiFootballResult:
        operation_name = operation or endpoint.strip("/").replace("/", "_")
        normalized_endpoint = "/" + endpoint.strip("/")
        normalized_params = {key: str(value) for key, value in (params or {}).items()}
        cache_key = self._cache_key(normalized_endpoint, normalized_params)
        requested_at = datetime.now(UTC)
        started = monotonic()

        cached = await self._read_cache(cache_key)
        if cached is not None:
            return ApiFootballResult(
                items=tuple(cached.items),
                observed_at=cached.observed_at,
                metadata=ProviderRequestMetadata(
                    provider=self.provider_name,
                    operation=operation_name,
                    requested_at=requested_at,
                    duration_ms=(monotonic() - started) * 1000,
                    external_requests=0,
                    quota_limit=cached.quota_limit,
                    quota_remaining=cached.quota_remaining,
                    page=cached.page,
                    total_pages=cached.total_pages,
                    from_cache=True,
                ),
            )

        items: list[dict[str, Any]] = []
        page = 1
        total_pages = 1
        external_requests = 0
        quota_limit: int | None = None
        quota_remaining: int | None = None
        while True:
            page_params = dict(normalized_params)
            if all_pages and page > 1:
                page_params["page"] = str(page)
            envelope, headers, attempts_used = await self._request_page(
                normalized_endpoint,
                page_params,
                operation=operation_name,
                request_id=request_id,
                worker=worker,
            )
            external_requests += attempts_used
            items.extend(self._object_items(envelope, operation_name))
            total_pages = envelope.paging.total
            quota_limit = self._integer_header(headers, "x-ratelimit-requests-limit")
            quota_remaining = self._integer_header(headers, "x-ratelimit-requests-remaining")
            if not all_pages or page >= total_pages:
                break
            if page >= self._max_pages:
                raise ProviderPayloadError(provider=self.provider_name, operation=operation_name)
            page += 1

        cached_payload = _CachedPayload(
            items=items,
            page=page,
            total_pages=total_pages,
            quota_limit=quota_limit,
            quota_remaining=quota_remaining,
            observed_at=requested_at,
        )
        await self._write_cache(cache_key, cached_payload, ttl_seconds)
        return ApiFootballResult(
            items=tuple(items),
            observed_at=requested_at,
            metadata=ProviderRequestMetadata(
                provider=self.provider_name,
                operation=operation_name,
                requested_at=requested_at,
                duration_ms=(monotonic() - started) * 1000,
                external_requests=external_requests,
                quota_limit=quota_limit,
                quota_remaining=quota_remaining,
                page=page,
                total_pages=total_pages,
            ),
        )

    async def _request_page(
        self,
        endpoint: str,
        params: Mapping[str, str],
        *,
        operation: str,
        request_id: str | None,
        worker: str | None,
    ) -> tuple[_Envelope, httpx.Headers, int]:
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
                        "User-Agent": "smartbetbot/0.1.0",
                        "x-apisports-key": self._api_key,
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
                        provider=self.provider_name, operation=operation
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
                    raise ProviderUnavailableError(provider=self.provider_name, operation=operation)
                if response.status_code >= 400:
                    raise ProviderPayloadError(provider=self.provider_name, operation=operation)

                try:
                    envelope = _Envelope.model_validate(response.json())
                except (ValueError, ValidationError) as error:
                    raise ProviderPayloadError(
                        provider=self.provider_name, operation=operation
                    ) from error
                if envelope.errors:
                    if self._is_rate_limit_error(envelope.errors):
                        if attempt < self._max_retries:
                            await self._sleep(self._retry_delay(attempt, response.headers))
                            continue
                        raise ProviderRateLimitError(
                            provider=self.provider_name,
                            operation=operation,
                            retry_after_seconds=self._retry_after(response.headers),
                        )
                    if self._is_authentication_error(envelope.errors):
                        raise ProviderAuthenticationError(
                            provider=self.provider_name, operation=operation
                        )
                    raise ProviderPayloadError(provider=self.provider_name, operation=operation)
                return envelope, response.headers, attempt + 1
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
                    provider=self.provider_name, operation=operation
                ) from error
        raise ProviderUnavailableError(provider=self.provider_name, operation=operation)

    async def _read_cache(self, key: str) -> _CachedPayload | None:
        try:
            value = await self._cache.get(key)
            return _CachedPayload.model_validate(value) if value is not None else None
        except Exception:
            logger.warning("sports_cache_read_failed", extra={"provider": self.provider_name})
            return None

    async def _write_cache(self, key: str, payload: _CachedPayload, ttl_seconds: int) -> None:
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
            rate_limit_remaining=self._integer_header(headers, "x-ratelimit-requests-remaining"),
            duration_ms=max(0, duration_ms),
            request_id=request_id,
            worker=worker,
            metadata={
                "attempt": attempt,
                "minute_limit": self._integer_header(headers, "x-ratelimit-limit"),
                "minute_remaining": self._integer_header(headers, "x-ratelimit-remaining"),
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
        raw_value = headers.get("retry-after")
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

    @staticmethod
    def _object_items(envelope: _Envelope, operation: str) -> list[dict[str, Any]]:
        if isinstance(envelope.response, dict):
            return [envelope.response]
        if any(not isinstance(item, dict) for item in envelope.response):
            raise ProviderPayloadError(provider="api_football", operation=operation)
        return envelope.response

    @staticmethod
    def _error_text(errors: dict[str, Any] | list[Any]) -> str:
        if isinstance(errors, dict):
            parts = [str(key) for key in errors]
        else:
            parts = [str(value) for value in errors]
        return " ".join(parts).lower()

    @classmethod
    def _is_rate_limit_error(cls, errors: dict[str, Any] | list[Any]) -> bool:
        error_text = cls._error_text(errors)
        return "rate" in error_text or "limit" in error_text or "requests" in error_text

    @classmethod
    def _is_authentication_error(cls, errors: dict[str, Any] | list[Any]) -> bool:
        error_text = cls._error_text(errors)
        return any(word in error_text for word in ("token", "key", "auth", "account"))

    @staticmethod
    def _cache_key(endpoint: str, params: Mapping[str, str]) -> str:
        canonical = json.dumps(
            {"endpoint": endpoint, "params": dict(sorted(params.items()))},
            separators=(",", ":"),
        )
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        return f"smartbetbot:sports:api_football:{digest}"

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
        await self._cache.close()
