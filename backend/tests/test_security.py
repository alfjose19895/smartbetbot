from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ec import SECP256R1, generate_private_key

from app.core.config import Settings
from app.core.errors import AuthenticationError
from app.core.security import SupabaseJwtVerifier


def token_for(
    private_key: object,
    *,
    issuer: str,
    expires_at: datetime,
    role: str = "authenticated",
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": "11111111-1111-4111-8111-111111111111",
            "email": "user@example.test",
            "role": role,
            "aud": "authenticated",
            "iss": issuer,
            "iat": now,
            "exp": expires_at,
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )


def use_public_key(verifier: SupabaseJwtVerifier, public_key: object) -> None:
    async def get_signing_key(_key_id: str, _algorithm: str) -> object:
        return public_key

    verifier._get_signing_key = get_signing_key  # type: ignore[method-assign]


@pytest.mark.anyio
async def test_supabase_jwt_verifier_accepts_valid_es256_token() -> None:
    private_key = generate_private_key(SECP256R1())
    issuer = "https://project.supabase.co/auth/v1"
    verifier = SupabaseJwtVerifier(
        supabase_url="https://project.supabase.co",
        audience="authenticated",
    )
    use_public_key(verifier, private_key.public_key())
    token = token_for(
        private_key,
        issuer=issuer,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )

    user = await verifier.verify(token)

    assert user.id == UUID("11111111-1111-4111-8111-111111111111")
    assert user.email == "user@example.test"


@pytest.mark.anyio
async def test_supabase_jwt_verifier_rejects_expired_token() -> None:
    private_key = generate_private_key(SECP256R1())
    issuer = "https://project.supabase.co/auth/v1"
    verifier = SupabaseJwtVerifier(
        supabase_url="https://project.supabase.co",
        audience="authenticated",
    )
    use_public_key(verifier, private_key.public_key())
    token = token_for(
        private_key,
        issuer=issuer,
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )

    with pytest.raises(AuthenticationError):
        await verifier.verify(token)


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "production",
        "cors_origins": "https://app.example.test",
        "allowed_hosts": "api.example.test",
        "supabase_url": "https://project.supabase.co",
        "database_url": "postgresql://user:password@db.example.test/database",
        "upstash_redis_rest_url": "https://redis.example.test",
        "upstash_redis_rest_token": "token",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_settings_require_https_explicit_origins() -> None:
    with pytest.raises(ValueError, match="HTTPS"):
        production_settings(cors_origins="http://app.example.test")
    with pytest.raises(ValueError, match="explicit origins"):
        Settings(cors_origins="*")


def test_production_settings_reject_demo_and_local_hosts() -> None:
    with pytest.raises(ValueError, match="DEMO_MODE"):
        production_settings(demo_mode=True)
    with pytest.raises(ValueError, match="local hosts"):
        production_settings(allowed_hosts="localhost")


def test_production_settings_require_cloud_dependencies() -> None:
    with pytest.raises(ValueError, match="Upstash"):
        production_settings(upstash_redis_rest_url=None, upstash_redis_rest_token=None)


@pytest.mark.anyio
async def test_supabase_jwt_verifier_rejects_privileged_non_user_role() -> None:
    private_key = generate_private_key(SECP256R1())
    issuer = "https://project.supabase.co/auth/v1"
    verifier = SupabaseJwtVerifier(
        supabase_url="https://project.supabase.co",
        audience="authenticated",
    )
    use_public_key(verifier, private_key.public_key())
    token = token_for(
        private_key,
        issuer=issuer,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        role="service_role",
    )

    with pytest.raises(AuthenticationError):
        await verifier.verify(token)
