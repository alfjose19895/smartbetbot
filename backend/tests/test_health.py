import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import app, create_app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_health_returns_service_metadata() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "smartbetbot-api"
    assert payload["environment"] == "development"
    assert payload["version"] == "0.4.0"
    assert payload["timestamp"]
    assert response.headers["X-Request-ID"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


@pytest.mark.anyio
async def test_rejects_untrusted_hosts() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://attacker.example") as client:
        response = await client.get("/health")

    assert response.status_code == 400


@pytest.mark.anyio
async def test_rejects_oversized_request_before_authentication() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/backtests/run",
            headers={"Content-Length": "1048577"},
            content=b"",
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"
    assert response.headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.anyio
async def test_production_hides_api_schema_and_sets_hsts() -> None:
    production = create_app(
        Settings(
            environment="production",
            cors_origins="https://app.example.test",
            allowed_hosts="api.example.test",
            supabase_url="https://project.supabase.co",
            database_url="postgresql://user:password@db.example.test/database",
            upstash_redis_rest_url="https://redis.example.test",
            upstash_redis_rest_token="token",
        )
    )
    transport = ASGITransport(app=production)
    async with AsyncClient(transport=transport, base_url="https://api.example.test") as client:
        health_response = await client.get("/health")
        docs_response = await client.get("/docs")
        openapi_response = await client.get("/openapi.json")

    assert health_response.status_code == 200
    assert health_response.json()["environment"] == "production"
    assert "max-age=31536000" in health_response.headers["Strict-Transport-Security"]
    assert docs_response.status_code == 404
    assert openapi_response.status_code == 404


@pytest.mark.anyio
async def test_staging_keeps_api_schema_and_sets_hsts() -> None:
    staging = create_app(
        Settings(
            environment="staging",
            cors_origins="https://staging.example.test",
            allowed_hosts="api-staging.example.test",
            supabase_url="https://staging.supabase.co",
            database_url="postgresql://user:password@db-staging.example.test/database",
            upstash_redis_rest_url="https://redis-staging.example.test",
            upstash_redis_rest_token="token",
        )
    )
    transport = ASGITransport(app=staging)
    async with AsyncClient(
        transport=transport,
        base_url="https://api-staging.example.test",
    ) as client:
        health_response = await client.get("/health")
        docs_response = await client.get("/docs")
        openapi_response = await client.get("/openapi.json")

    assert "max-age=31536000" in health_response.headers["Strict-Transport-Security"]
    assert docs_response.status_code == 200
    assert openapi_response.status_code == 200
