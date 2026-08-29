"""Doctor CLI tool for SmartBetBot environment and dependency diagnostics."""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime
from time import monotonic

import httpx
import psycopg

from app.core.config import Settings, get_settings
from app.domain.sports import LeagueQuery
from app.providers.sports.factory import build_sports_data_provider


async def check_configuration(settings: Settings) -> tuple[bool, str]:
    try:
        origins = settings.cors_origin_list
        hosts = settings.allowed_host_list
        env = settings.environment
        if not origins:
            return False, "CORS origins not configured"
        if not hosts:
            return False, "Allowed hosts not configured"
        return (
            True,
            f"Environment: {env}, CORS Origins: {len(origins)}, Allowed Hosts: {len(hosts)}",
        )
    except Exception as e:
        return False, str(e)


async def check_database(settings: Settings) -> tuple[bool, str]:
    if not settings.database_dsn:
        return False, "DATABASE_URL is not set"
    try:
        start = monotonic()
        conn = await psycopg.AsyncConnection.connect(
            settings.database_dsn,
            connect_timeout=float(settings.database_connect_timeout_seconds),
        )
        async with conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
            )
            row = await cur.fetchone()
            table_count = row[0] if row else 0
        latency_ms = round((monotonic() - start) * 1000, 1)
        return True, f"Connected ({latency_ms}ms, {table_count} public tables)"
    except Exception as e:
        return False, f"Connection failed: {e.__class__.__name__}: {str(e).splitlines()[0]}"


async def check_redis(settings: Settings) -> tuple[bool, str]:
    if not settings.upstash_redis_rest_url or not settings.upstash_token:
        if settings.environment == "development":
            return True, "Not configured (optional in development)"
        return False, "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing"
    try:
        start = monotonic()
        async with httpx.AsyncClient(timeout=float(settings.readiness_timeout_seconds)) as client:
            resp = await client.post(
                f"{settings.upstash_redis_rest_url.rstrip('/')}/ping",
                headers={"Authorization": f"Bearer {settings.upstash_token}"},
            )
        latency_ms = round((monotonic() - start) * 1000, 1)
        if resp.status_code == 200:
            return True, f"Connected ({latency_ms}ms, ping: {resp.json().get('result')})"
        return False, f"HTTP {resp.status_code}: {resp.text[:100]}"
    except Exception as e:
        return False, f"Connection failed: {e.__class__.__name__}: {str(e).splitlines()[0]}"


async def check_supabase(settings: Settings) -> tuple[bool, str]:
    if not settings.supabase_url:
        return False, "SUPABASE_URL is missing"
    try:
        start = monotonic()
        async with httpx.AsyncClient(timeout=float(settings.readiness_timeout_seconds)) as client:
            resp = await client.get(f"{settings.supabase_url.rstrip('/')}/rest/v1/")
        latency_ms = round((monotonic() - start) * 1000, 1)
        return True, f"Reachable ({latency_ms}ms, HTTP {resp.status_code})"
    except Exception as e:
        return False, f"Failed: {e.__class__.__name__}: {str(e).splitlines()[0]}"


async def check_api_football(settings: Settings) -> tuple[bool, str]:
    if not settings.api_football_key_value:
        return False, "API_FOOTBALL_KEY is not set"
    try:
        provider = build_sports_data_provider(settings)
        try:
            start = monotonic()
            response = await provider.list_leagues(
                LeagueQuery(external_id="39", current_only=True)
            )
            latency_ms = round((monotonic() - start) * 1000, 1)
            quota_rem = response.metadata.quota_remaining
            quota_lim = response.metadata.quota_limit
            from_cache = response.metadata.from_cache
            return True, (
                f"Connected ({latency_ms}ms, Quota: {quota_rem}/{quota_lim}, Cached: {from_cache})"
            )
        finally:
            await provider.close()
    except Exception as e:
        return False, f"Check failed: {e.__class__.__name__}: {str(e).splitlines()[0]}"


async def run_doctor() -> bool:
    settings = get_settings()
    print("=" * 60)
    print("  SmartBetBot System Diagnostics (Doctor)")
    print(f"  Time: {datetime.now(UTC).isoformat()}")
    print("=" * 60)

    checks = [
        ("Configuration", check_configuration(settings)),
        ("Database", check_database(settings)),
        ("Redis", check_redis(settings)),
        ("Supabase", check_supabase(settings)),
        ("API-Football", check_api_football(settings)),
    ]

    all_ok = True
    for name, check_coro in checks:
        ok, detail = await check_coro
        status_str = "OK" if ok else "ERROR"
        print(f"{name:<18} {status_str:<6} {detail}")
        if not ok:
            all_ok = False

    print("=" * 60)
    if all_ok:
        print("Result: ALL CHECKS PASSED")
    else:
        print("Result: SOME CHECKS FAILED")
    print("=" * 60)
    return all_ok


def main() -> None:
    success = asyncio.run(run_doctor())
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
