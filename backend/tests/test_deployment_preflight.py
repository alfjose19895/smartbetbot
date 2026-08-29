from pathlib import Path

import pytest

from scripts.deployment_preflight import (
    parse_env,
    repository_failures,
    validate_environment,
    validate_isolation,
)


def frontend(name: str) -> dict[str, str]:
    return {
        "NEXT_PUBLIC_APP_URL": f"https://{name}.example.test",
        "NEXT_PUBLIC_API_URL": f"https://api-{name}.example.test",
        "NEXT_PUBLIC_SUPABASE_URL": f"https://supabase-{name}.example.test",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": f"publishable-{name}",
        "NEXT_PUBLIC_FIREBASE_API_KEY": f"public-{name}",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": f"firebase-{name}.example.test",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID": f"firebase-{name}",
        "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET": f"firebase-{name}.example.test",
        "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": "1234567890",
        "NEXT_PUBLIC_FIREBASE_APP_ID": f"app-{name}",
        "NEXT_PUBLIC_FIREBASE_VAPID_KEY": f"vapid-{name}",
    }


def backend(name: str, target: str) -> dict[str, str]:
    return {
        "ENVIRONMENT": target,
        "CORS_ORIGINS": f"https://{name}.example.test",
        "ALLOWED_HOSTS": f"api-{name}.example.test",
        "LOG_LEVEL": "INFO",
        "MAX_REQUEST_BODY_BYTES": "1048576",
        "API_RATE_LIMIT_REQUESTS": "120",
        "API_RATE_LIMIT_WINDOW_SECONDS": "60",
        "API_RATE_LIMIT_TIMEOUT_SECONDS": "2",
        "SUPABASE_URL": f"https://supabase-{name}.example.test",
        "SUPABASE_JWT_AUDIENCE": "authenticated",
        "DATABASE_URL": f"postgresql://postgres.{name}:password@pool.example.test:5432/postgres",
        "DATABASE_POOL_SIZE": "5",
        "DATABASE_MAX_OVERFLOW": "5",
        "UPSTASH_REDIS_REST_URL": f"https://redis-{name}.example.test",
        "UPSTASH_REDIS_REST_TOKEN": f"token-{name}",
        "SPORTS_DATA_PROVIDER": "football_data",
        "FOOTBALL_DATA_API_KEY": f"sports-{name}",
        "PREMATCH_LEAGUE_IDS": "PL,PD",
        "FIREBASE_PROJECT_ID": f"firebase-{name}",
        "FIREBASE_CLIENT_EMAIL": f"service@firebase-{name}.example.test",
        "FIREBASE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\\nvalue\\n-----END PRIVATE KEY-----",
        "WORKER_RUN_ONCE": "false",
        "DEMO_MODE": "false",
    }


def test_complete_staging_environment_passes() -> None:
    assert validate_environment("staging", frontend("staging"), backend("staging", "staging")) == []


def test_environment_rejects_public_secrets_and_inconsistent_resources() -> None:
    public = frontend("staging")
    public["DATABASE_URL"] = "postgresql://leak"
    private = backend("staging", "staging")
    private["FIREBASE_PROJECT_ID"] = "different-project"

    failures = validate_environment("staging", public, private)

    assert any("server-only" in failure for failure in failures)
    assert any("Firebase projects do not match" in failure for failure in failures)


def test_environment_rejects_unsafe_runtime_controls() -> None:
    public = frontend("staging")
    private = backend("staging", "staging")
    private["CORS_ORIGINS"] += ",*"
    private["ALLOWED_HOSTS"] += ",*"
    private["API_RATE_LIMIT_REQUESTS"] = "0"
    private["API_RATE_LIMIT_TIMEOUT_SECONDS"] = "invalid"
    private["WORKER_RUN_ONCE"] = "true"

    failures = validate_environment("staging", public, private)

    assert "CORS_ORIGINS cannot contain a wildcard" in failures
    assert "ALLOWED_HOSTS contains an unsafe pattern" in failures
    assert "backend API_RATE_LIMIT_REQUESTS must be a positive integer" in failures
    assert "backend API_RATE_LIMIT_TIMEOUT_SECONDS must be positive" in failures
    assert "WORKER_RUN_ONCE must be false" in failures


def test_environment_isolation_detects_shared_cloud_resources() -> None:
    staging_frontend = frontend("staging")
    staging_backend = backend("staging", "staging")
    production_frontend = frontend("production")
    production_backend = backend("production", "production")
    production_backend["UPSTASH_REDIS_REST_URL"] = staging_backend["UPSTASH_REDIS_REST_URL"]

    failures = validate_isolation(
        production_frontend,
        production_backend,
        staging_frontend,
        staging_backend,
    )

    assert failures == ["environments share backend resource UPSTASH_REDIS_REST_URL"]


def test_env_parser_rejects_duplicate_keys(tmp_path: Path) -> None:
    env_file = tmp_path / "duplicate.env"
    env_file.write_text("ENVIRONMENT=staging\nENVIRONMENT=production\n", encoding="utf-8")

    with pytest.raises(ValueError, match="duplicate"):
        parse_env(env_file)


def test_repository_deployment_contract_is_complete() -> None:
    assert repository_failures() == []
