from __future__ import annotations

import asyncio
from functools import lru_cache
from time import monotonic
from typing import Annotated, Any
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWK
from jwt.exceptions import PyJWTError
from pydantic import BaseModel

from app.core.config import Settings
from app.core.errors import AuthenticationError, ServiceUnavailableError

bearer_scheme = HTTPBearer(auto_error=False, description="Supabase Auth access token")


class CurrentUser(BaseModel):
    id: UUID
    email: str | None = None
    auth_role: str


class SupabaseJwtVerifier:
    def __init__(self, *, supabase_url: str, audience: str) -> None:
        issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        self._issuer = issuer
        self._audience = audience
        self._jwks_url = f"{issuer}/.well-known/jwks.json"
        self._keys: dict[str, tuple[object, str]] = {}
        self._keys_expire_at = 0.0
        self._refresh_lock = asyncio.Lock()

    async def _refresh_keys(self, *, force: bool = False) -> None:
        async with self._refresh_lock:
            if not force and self._keys and monotonic() < self._keys_expire_at:
                return
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    response = await client.get(self._jwks_url)
                    response.raise_for_status()
                raw_keys = response.json().get("keys", [])
                parsed_keys: dict[str, tuple[object, str]] = {}
                for raw_key in raw_keys:
                    key_id = raw_key.get("kid")
                    algorithm = raw_key.get("alg")
                    if key_id and algorithm in {"ES256", "RS256", "EdDSA"}:
                        parsed_keys[str(key_id)] = (PyJWK.from_dict(raw_key).key, str(algorithm))
                self._keys = parsed_keys
                self._keys_expire_at = monotonic() + 600
            except (httpx.HTTPError, KeyError, TypeError, ValueError, PyJWTError) as exc:
                raise ServiceUnavailableError(
                    code="authentication_keys_unavailable",
                    message="Authentication keys are temporarily unavailable.",
                ) from exc

    async def _get_signing_key(self, key_id: str, algorithm: str) -> object:
        await self._refresh_keys()
        cached = self._keys.get(key_id)
        if cached is None:
            await self._refresh_keys(force=True)
            cached = self._keys.get(key_id)
        if cached is None or cached[1] != algorithm:
            raise AuthenticationError()
        return cached[0]

    async def verify(self, token: str) -> CurrentUser:
        try:
            header = jwt.get_unverified_header(token)
            algorithm = str(header.get("alg", ""))
            key_id = str(header.get("kid", ""))
            if algorithm not in {"ES256", "RS256", "EdDSA"} or not key_id:
                raise AuthenticationError()
            signing_key = await self._get_signing_key(key_id, algorithm)
            claims: dict[str, Any] = jwt.decode(
                token,
                signing_key,
                algorithms=[algorithm],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iat", "sub", "role"]},
            )
            user_id = UUID(str(claims["sub"]))
            role = str(claims["role"])
            if role != "authenticated":
                raise AuthenticationError()
            email = claims.get("email")
            return CurrentUser(
                id=user_id,
                email=str(email) if email is not None else None,
                auth_role=role,
            )
        except AuthenticationError:
            raise
        except ServiceUnavailableError:
            raise
        except (KeyError, TypeError, ValueError, PyJWTError) as exc:
            raise AuthenticationError() from exc


@lru_cache
def _jwt_verifier(supabase_url: str, audience: str) -> SupabaseJwtVerifier:
    return SupabaseJwtVerifier(supabase_url=supabase_url, audience=audience)


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError()
    settings: Settings = request.app.state.settings
    if not settings.supabase_url:
        raise ServiceUnavailableError(
            code="authentication_not_configured",
            message="Supabase authentication is not configured for this service.",
        )

    verifier = _jwt_verifier(settings.supabase_url, settings.supabase_jwt_audience)
    user = await verifier.verify(credentials.credentials)
    rate_limiter = getattr(request.app.state, "rate_limiter", None)
    if rate_limiter is not None:
        await rate_limiter.check(str(user.id))
    return user
