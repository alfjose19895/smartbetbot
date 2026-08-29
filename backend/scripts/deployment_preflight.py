"""Validate staging/production configuration without exposing any value."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_REQUIRED = {
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
}
BACKEND_REQUIRED = {
    "ENVIRONMENT",
    "CORS_ORIGINS",
    "ALLOWED_HOSTS",
    "LOG_LEVEL",
    "MAX_REQUEST_BODY_BYTES",
    "API_RATE_LIMIT_REQUESTS",
    "API_RATE_LIMIT_WINDOW_SECONDS",
    "API_RATE_LIMIT_TIMEOUT_SECONDS",
    "SUPABASE_URL",
    "SUPABASE_JWT_AUDIENCE",
    "DATABASE_URL",
    "DATABASE_POOL_SIZE",
    "DATABASE_MAX_OVERFLOW",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "SPORTS_DATA_PROVIDER",
    "PREMATCH_LEAGUE_IDS",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "WORKER_RUN_ONCE",
    "DEMO_MODE",
}
SERVER_ONLY_MARKERS = ("DATABASE", "SECRET", "PRIVATE", "SERVICE_ROLE", "REST_TOKEN")


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not name:
            raise ValueError(f"invalid env syntax at line {number}")
        if name in values:
            raise ValueError(f"duplicate env key: {name}")
        values[name] = value.strip().strip('"').strip("'")
    return values


def _origin(value: str) -> tuple[str, str, int | None]:
    parsed = urlsplit(value)
    return parsed.scheme, parsed.hostname or "", parsed.port


def _database_identity(value: str) -> tuple[str, str, int | None, str]:
    parsed = urlsplit(value)
    return parsed.username or "", parsed.hostname or "", parsed.port, parsed.path


def _host_allowed(host: str, patterns: set[str]) -> bool:
    return host in patterns or any(
        pattern.startswith("*.") and host.endswith(pattern[1:]) for pattern in patterns
    )


def validate_environment(
    target: str,
    frontend: dict[str, str],
    backend: dict[str, str],
) -> list[str]:
    failures: list[str] = []
    for key in sorted(FRONTEND_REQUIRED):
        if not frontend.get(key):
            failures.append(f"frontend missing {key}")
    for key in sorted(BACKEND_REQUIRED):
        if not backend.get(key):
            failures.append(f"backend missing {key}")
    provider_key = {
        "api_football": "API_FOOTBALL_KEY",
        "football_data": "FOOTBALL_DATA_API_KEY",
    }.get(backend.get("SPORTS_DATA_PROVIDER", ""))
    if provider_key is None:
        failures.append("backend SPORTS_DATA_PROVIDER is unsupported")
    elif not backend.get(provider_key):
        failures.append(f"backend missing {provider_key}")

    if backend.get("ENVIRONMENT") != target:
        failures.append("backend ENVIRONMENT does not match target")
    if backend.get("DEMO_MODE", "false").lower() not in {"false", "0", "no"}:
        failures.append("DEMO_MODE must be false")
    if backend.get("WORKER_RUN_ONCE", "false").lower() not in {"false", "0", "no"}:
        failures.append("WORKER_RUN_ONCE must be false")
    if backend.get("SUPABASE_JWT_AUDIENCE") != "authenticated":
        failures.append("SUPABASE_JWT_AUDIENCE must be authenticated")
    if backend.get("LOG_LEVEL", "").upper() not in {
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR",
        "CRITICAL",
    }:
        failures.append("LOG_LEVEL is invalid")

    positive_integer_keys = (
        "MAX_REQUEST_BODY_BYTES",
        "API_RATE_LIMIT_REQUESTS",
        "API_RATE_LIMIT_WINDOW_SECONDS",
        "DATABASE_POOL_SIZE",
    )
    for key in positive_integer_keys:
        try:
            valid = int(backend.get(key, "")) > 0
        except ValueError:
            valid = False
        if not valid:
            failures.append(f"backend {key} must be a positive integer")
    try:
        max_overflow_valid = int(backend.get("DATABASE_MAX_OVERFLOW", "")) >= 0
    except ValueError:
        max_overflow_valid = False
    if not max_overflow_valid:
        failures.append("backend DATABASE_MAX_OVERFLOW must be a non-negative integer")
    try:
        timeout_valid = float(backend.get("API_RATE_LIMIT_TIMEOUT_SECONDS", "")) > 0
    except ValueError:
        timeout_valid = False
    if not timeout_valid:
        failures.append("backend API_RATE_LIMIT_TIMEOUT_SECONDS must be positive")

    for key in (
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
    ):
        value = frontend.get(key)
        if value and _origin(value)[0] != "https":
            failures.append(f"frontend {key} must use HTTPS")
    for key in ("SUPABASE_URL", "UPSTASH_REDIS_REST_URL"):
        value = backend.get(key)
        if value and _origin(value)[0] != "https":
            failures.append(f"backend {key} must use HTTPS")
    database_url = backend.get("DATABASE_URL", "")
    if database_url and urlsplit(database_url).scheme not in {"postgres", "postgresql"}:
        failures.append("backend DATABASE_URL must use PostgreSQL")

    public_server_keys = sorted(
        key for key in frontend if any(marker in key for marker in SERVER_ONLY_MARKERS)
    )
    if public_server_keys:
        failures.append("frontend contains server-only keys: " + ",".join(public_server_keys))

    app_url = frontend.get("NEXT_PUBLIC_APP_URL", "")
    cors = {value.strip().rstrip("/") for value in backend.get("CORS_ORIGINS", "").split(",")}
    if "*" in cors:
        failures.append("CORS_ORIGINS cannot contain a wildcard")
    if app_url and app_url.rstrip("/") not in cors:
        failures.append("CORS_ORIGINS does not include NEXT_PUBLIC_APP_URL")
    api_host = _origin(frontend.get("NEXT_PUBLIC_API_URL", ""))[1]
    allowed_hosts = {value.strip().lower() for value in backend.get("ALLOWED_HOSTS", "").split(",")}
    if "*" in allowed_hosts or any("://" in host or "/" in host for host in allowed_hosts):
        failures.append("ALLOWED_HOSTS contains an unsafe pattern")
    if api_host and not _host_allowed(api_host, allowed_hosts):
        failures.append("ALLOWED_HOSTS does not include the API hostname")
    if frontend.get("NEXT_PUBLIC_SUPABASE_URL") != backend.get("SUPABASE_URL"):
        failures.append("frontend/backend Supabase projects do not match")
    if frontend.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID") != backend.get("FIREBASE_PROJECT_ID"):
        failures.append("frontend/backend Firebase projects do not match")
    private_key = backend.get("FIREBASE_PRIVATE_KEY", "")
    if private_key and "BEGIN PRIVATE KEY" not in private_key:
        failures.append("FIREBASE_PRIVATE_KEY has an invalid format")
    return failures


def validate_isolation(
    frontend: dict[str, str],
    backend: dict[str, str],
    other_frontend: dict[str, str],
    other_backend: dict[str, str],
) -> list[str]:
    failures: list[str] = []
    frontend_identity_keys = (
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    )
    backend_identity_keys = ("SUPABASE_URL", "UPSTASH_REDIS_REST_URL", "FIREBASE_PROJECT_ID")
    for key in frontend_identity_keys:
        if frontend.get(key) and frontend.get(key) == other_frontend.get(key):
            failures.append(f"environments share frontend resource {key}")
    for key in backend_identity_keys:
        if backend.get(key) and backend.get(key) == other_backend.get(key):
            failures.append(f"environments share backend resource {key}")
    current_database = backend.get("DATABASE_URL")
    other_database = other_backend.get("DATABASE_URL")
    if (
        current_database
        and other_database
        and _database_identity(current_database) == _database_identity(other_database)
    ):
        failures.append("environments share DATABASE_URL identity")
    return failures


def repository_failures() -> list[str]:
    required = (
        ".github/workflows/ci.yml",
        ".github/workflows/deployment-smoke.yml",
        "Procfile",
        "docs/deployment.md",
        "docs/staging.md",
        "docs/production.md",
        "docs/security.md",
        "docs/release-checklist.md",
        "deploy/environments/staging.frontend.env.example",
        "deploy/environments/staging.backend.env.example",
        "deploy/environments/production.frontend.env.example",
        "deploy/environments/production.backend.env.example",
    )
    failures = [f"repository missing {path}" for path in required if not (ROOT / path).exists()]
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    if ".env.local" not in gitignore or "backend/.env" not in gitignore:
        failures.append("runtime env files are not ignored")
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate SmartBetBot deployment configuration.")
    parser.add_argument("--target", choices=("staging", "production"))
    parser.add_argument("--frontend-env", type=Path)
    parser.add_argument("--backend-env", type=Path)
    parser.add_argument("--compare-frontend-env", type=Path)
    parser.add_argument("--compare-backend-env", type=Path)
    parser.add_argument("--check-repository", action="store_true")
    args = parser.parse_args()
    failures = repository_failures() if args.check_repository else []
    if args.target:
        if not args.frontend_env or not args.backend_env:
            parser.error("--frontend-env and --backend-env are required with --target")
        frontend = parse_env(args.frontend_env)
        backend = parse_env(args.backend_env)
        failures.extend(validate_environment(args.target, frontend, backend))
        if bool(args.compare_frontend_env) != bool(args.compare_backend_env):
            parser.error("both compare env files must be provided together")
        if args.compare_frontend_env and args.compare_backend_env:
            failures.extend(
                validate_isolation(
                    frontend,
                    backend,
                    parse_env(args.compare_frontend_env),
                    parse_env(args.compare_backend_env),
                )
            )
    if failures:
        print(json.dumps({"status": "failed", "errors": failures}, separators=(",", ":")))
        raise SystemExit(1)
    print(json.dumps({"status": "ok", "target": args.target or "repository"}))


if __name__ == "__main__":
    main()
