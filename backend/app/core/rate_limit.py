from __future__ import annotations

from typing import Protocol

import httpx

from app.core.errors import RateLimitExceededError, ServiceUnavailableError


class ApiRateLimiter(Protocol):
    async def check(self, identity: str) -> None: ...


class NoopApiRateLimiter:
    async def check(self, identity: str) -> None:
        del identity


class UpstashApiRateLimiter:
    """Distributed fixed-window limit. Keys contain only the authenticated user UUID."""

    _script = (
        "local count=redis.call('incr',KEYS[1]);"
        "if count==1 then redis.call('expire',KEYS[1],ARGV[1]); end;"
        "local ttl=redis.call('ttl',KEYS[1]); return {count,ttl};"
    )

    def __init__(
        self,
        *,
        rest_url: str,
        token: str,
        request_limit: int,
        window_seconds: int,
        fail_closed: bool,
        http_client: httpx.AsyncClient,
    ) -> None:
        self._rest_url = rest_url.rstrip("/")
        self._token = token
        self._request_limit = request_limit
        self._window_seconds = window_seconds
        self._fail_closed = fail_closed
        self._client = http_client

    async def check(self, identity: str) -> None:
        key = f"smartbetbot:rate:api:{identity}"
        try:
            response = await self._client.post(
                self._rest_url,
                headers={"Authorization": f"Bearer {self._token}"},
                json=["EVAL", self._script, 1, key, self._window_seconds],
            )
            response.raise_for_status()
            payload = response.json()
            result = payload.get("result") if isinstance(payload, dict) else None
            if not isinstance(result, list) or len(result) != 2:
                raise ValueError("invalid rate-limit response")
            count, ttl = int(result[0]), max(1, int(result[1]))
        except (httpx.HTTPError, TypeError, ValueError) as exc:
            if self._fail_closed:
                raise ServiceUnavailableError(
                    code="rate_limit_unavailable",
                    message="Request protection is temporarily unavailable.",
                ) from exc
            return
        if count > self._request_limit:
            raise RateLimitExceededError(ttl)
