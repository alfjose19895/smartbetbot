from __future__ import annotations

import json
from typing import Any, Protocol

import httpx


class SportsDataCache(Protocol):
    async def get(self, key: str) -> dict[str, Any] | None: ...

    async def set(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None: ...

    async def close(self) -> None: ...


class NoopSportsDataCache:
    async def get(self, key: str) -> dict[str, Any] | None:
        return None

    async def set(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        return None

    async def close(self) -> None:
        return None


class UpstashSportsDataCache:
    """Minimal Upstash REST cache; credentials are sent only in request headers."""

    def __init__(
        self,
        *,
        rest_url: str,
        token: str,
        timeout_seconds: float = 3,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._rest_url = rest_url.rstrip("/")
        self._token = token
        self._client = http_client or httpx.AsyncClient(timeout=timeout_seconds)
        self._owns_client = http_client is None

    async def _command(self, command: list[object]) -> Any:
        response = await self._client.post(
            self._rest_url,
            headers={"Authorization": f"Bearer {self._token}"},
            json=command,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or "result" not in payload:
            raise ValueError("Upstash returned an invalid command response")
        return payload["result"]

    async def get(self, key: str) -> dict[str, Any] | None:
        result = await self._command(["GET", key])
        if result is None:
            return None
        payload = json.loads(result)
        if not isinstance(payload, dict):
            raise ValueError("Cached sports-data response is not an object")
        return payload

    async def set(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        serialized = json.dumps(value, separators=(",", ":"), default=str)
        await self._command(["SET", key, serialized, "EX", ttl_seconds])

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
