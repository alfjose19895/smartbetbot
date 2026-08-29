from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Protocol

import httpx
import jwt
from jwt.exceptions import PyJWTError

from app.domain.notifications import PushSendResult


class PushProvider(Protocol):
    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict[str, str],
    ) -> PushSendResult: ...

    async def close(self) -> None: ...


class FirebasePushProvider:
    def __init__(
        self,
        *,
        project_id: str,
        client_email: str,
        private_key: str,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.project_id = project_id
        self.client_email = client_email
        self.private_key = private_key
        self.client = http_client or httpx.AsyncClient(timeout=10)
        self.owns_client = http_client is None
        self._access_token: str | None = None
        self._expires_at = datetime.min.replace(tzinfo=UTC)
        self._token_lock = asyncio.Lock()

    async def _get_access_token(self) -> str:
        now = datetime.now(UTC)
        if self._access_token and now < self._expires_at - timedelta(seconds=60):
            return self._access_token
        async with self._token_lock:
            now = datetime.now(UTC)
            if self._access_token and now < self._expires_at - timedelta(seconds=60):
                return self._access_token
            assertion = jwt.encode(
                {
                    "iss": self.client_email,
                    "scope": "https://www.googleapis.com/auth/firebase.messaging",
                    "aud": "https://oauth2.googleapis.com/token",
                    "iat": int(now.timestamp()),
                    "exp": int((now + timedelta(minutes=55)).timestamp()),
                },
                self.private_key,
                algorithm="RS256",
            )
            response = await self.client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": assertion,
                },
            )
            response.raise_for_status()
            payload = response.json()
            self._access_token = str(payload["access_token"])
            self._expires_at = now + timedelta(seconds=int(payload.get("expires_in", 3600)))
            return self._access_token

    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict[str, str],
    ) -> PushSendResult:
        try:
            access_token = await self._get_access_token()
            response = await self.client.post(
                f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "message": {
                        "token": token,
                        "notification": {"title": title, "body": body},
                        "data": data,
                        "webpush": {"fcm_options": {"link": data.get("url", "/dashboard")}},
                    }
                },
            )
            if response.status_code in {400, 404}:
                return PushSendResult(success=False, error_code="invalid_registration")
            response.raise_for_status()
            name = response.json().get("name")
            return PushSendResult(
                success=True,
                provider_message_id=str(name) if name else None,
            )
        except httpx.TimeoutException:
            return PushSendResult(success=False, error_code="firebase_timeout")
        except (httpx.HTTPError, KeyError, TypeError, ValueError, PyJWTError):
            return PushSendResult(success=False, error_code="firebase_error")

    async def close(self) -> None:
        if self.owns_client:
            await self.client.aclose()
