from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

import httpx


@dataclass(frozen=True, slots=True)
class WorkerLease:
    key: str
    token: str
    acquired: bool


class WorkerLockManager(Protocol):
    async def acquire(self, key: str, ttl_seconds: int) -> WorkerLease: ...

    async def release(self, lease: WorkerLease) -> None: ...

    async def renew(self, lease: WorkerLease, ttl_seconds: int) -> bool: ...

    async def close(self) -> None: ...

    def hold(self, key: str, ttl_seconds: int) -> AbstractAsyncContextManager[bool]: ...


class LockManagerBase:
    @asynccontextmanager
    async def hold(self, key: str, ttl_seconds: int) -> AsyncIterator[bool]:
        lease = await self.acquire(key, ttl_seconds)
        renewal_task = (
            asyncio.create_task(self._renew_until_cancelled(lease, ttl_seconds))
            if lease.acquired
            else None
        )
        try:
            yield lease.acquired
        finally:
            if renewal_task is not None:
                renewal_task.cancel()
                with suppress(asyncio.CancelledError):
                    await renewal_task
            if lease.acquired:
                await self.release(lease)

    async def _renew_until_cancelled(self, lease: WorkerLease, ttl_seconds: int) -> None:
        interval = max(1.0, ttl_seconds / 3)
        while True:
            await asyncio.sleep(interval)
            if not await self.renew(lease, ttl_seconds):
                return


class InMemoryWorkerLockManager(LockManagerBase):
    """Process-local fallback for tests and development without Upstash."""

    def __init__(self) -> None:
        self._guard = asyncio.Lock()
        self._leases: dict[str, str] = {}

    async def acquire(self, key: str, ttl_seconds: int) -> WorkerLease:
        del ttl_seconds
        token = uuid4().hex
        async with self._guard:
            if key in self._leases:
                return WorkerLease(key=key, token=token, acquired=False)
            self._leases[key] = token
        return WorkerLease(key=key, token=token, acquired=True)

    async def release(self, lease: WorkerLease) -> None:
        async with self._guard:
            if self._leases.get(lease.key) == lease.token:
                self._leases.pop(lease.key, None)

    async def renew(self, lease: WorkerLease, ttl_seconds: int) -> bool:
        del ttl_seconds
        async with self._guard:
            return self._leases.get(lease.key) == lease.token

    async def close(self) -> None:
        return None


class UpstashWorkerLockManager(LockManagerBase):
    _release_script = (
        "if redis.call('get',KEYS[1]) == ARGV[1] then "
        "return redis.call('del',KEYS[1]) else return 0 end"
    )
    _renew_script = (
        "if redis.call('get',KEYS[1]) == ARGV[1] then "
        "return redis.call('expire',KEYS[1],ARGV[2]) else return 0 end"
    )

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

    async def _command(self, command: list[object]) -> object:
        response = await self._client.post(
            self._rest_url,
            headers={"Authorization": f"Bearer {self._token}"},
            json=command,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or "result" not in payload:
            raise ValueError("Upstash returned an invalid lock response")
        return payload["result"]

    async def acquire(self, key: str, ttl_seconds: int) -> WorkerLease:
        token = uuid4().hex
        result = await self._command(["SET", key, token, "NX", "EX", ttl_seconds])
        return WorkerLease(key=key, token=token, acquired=result == "OK")

    async def release(self, lease: WorkerLease) -> None:
        await self._command(["EVAL", self._release_script, 1, lease.key, lease.token])

    async def renew(self, lease: WorkerLease, ttl_seconds: int) -> bool:
        result = await self._command(
            ["EVAL", self._renew_script, 1, lease.key, lease.token, ttl_seconds]
        )
        return result == 1

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
