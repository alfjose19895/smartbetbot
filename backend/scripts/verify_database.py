"""Read-only verification for the SmartBetBot Phase 3 database contract."""

from __future__ import annotations

import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from dotenv import dotenv_values

EXPECTED_TABLES = {
    "api_usage",
    "audit_logs",
    "countries",
    "canonical_leagues",
    "canonical_teams",
    "fixture_events",
    "fixture_injury_snapshots",
    "fixture_lineup_snapshots",
    "fixture_stats_snapshots",
    "fixtures",
    "leagues",
    "league_standings_snapshots",
    "league_provider_links",
    "model_versions",
    "notifications",
    "odds_snapshots",
    "predictions",
    "provider_prediction_snapshots",
    "profiles",
    "push_subscriptions",
    "seasons",
    "signal_reasons",
    "signal_results",
    "signals",
    "sports",
    "strategies",
    "teams",
    "team_season_stats_snapshots",
    "team_provider_links",
    "user_preferences",
    "worker_runs",
}

EXPECTED_POLICY_COUNTS = {
    "profiles": 2,
    "push_subscriptions": 4,
    "user_preferences": 4,
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def load_database_url() -> str:
    default_path = Path(__file__).resolve().parents[1] / ".env"
    env_path = Path(os.environ.get("SMARTBETBOT_DB_ENV_FILE", default_path))
    database_url = dotenv_values(env_path).get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing in the selected database environment file")
    return database_url


def verify_schema(connection: psycopg.Connection[tuple[object, ...]]) -> None:
    table_rows = connection.execute(
        "select tablename from pg_tables where schemaname = 'public'"
    ).fetchall()
    actual_tables = {str(row[0]) for row in table_rows}
    missing_tables = EXPECTED_TABLES - actual_tables
    require(not missing_tables, f"Missing tables: {sorted(missing_tables)}")

    ingestion_columns = connection.execute(
        """
        select table_name, column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (
            ('leagues', 'provider_id'),
            ('teams', 'provider_id'),
            ('fixtures', 'provider_id'),
            ('odds_snapshots', 'raw_implied_probability'),
            ('odds_snapshots', 'fingerprint'),
            ('fixture_stats_snapshots', 'fingerprint'),
            ('predictions', 'fingerprint')
          )
        """
    ).fetchall()
    columns = {
        (str(table), str(column)): (str(data_type), str(nullable))
        for table, column, data_type, nullable in ingestion_columns
    }
    for table in ("leagues", "teams", "fixtures"):
        require(columns.get((table, "provider_id")) == ("text", "NO"), f"{table} ID type")
    require(
        columns.get(("odds_snapshots", "raw_implied_probability")) == ("numeric", "NO"),
        "Odds implied probability contract missing",
    )
    require(
        columns.get(("odds_snapshots", "fingerprint")) == ("text", "NO"),
        "Odds fingerprint contract missing",
    )
    require(
        columns.get(("fixture_stats_snapshots", "fingerprint")) == ("text", "NO"),
        "Statistics fingerprint contract missing",
    )
    require(
        columns.get(("predictions", "fingerprint")) == ("text", "NO"),
        "Prediction fingerprint contract missing",
    )

    ingestion_indexes = connection.execute(
        """
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname = any(%s)
        """,
        (
            [
                "fixture_stats_snapshots_fingerprint_idx",
                "odds_snapshots_fingerprint_idx",
                "odds_snapshots_movement_idx",
                "predictions_fingerprint_idx",
                "notifications_user_signal_push_idx",
                "signal_results_settled_signal_idx",
                "signals_backtest_filters_idx",
            ],
        ),
    ).fetchall()
    require(len(ingestion_indexes) == 7, "Phase 7-25 integrity indexes are incomplete")

    rls_rows = connection.execute(
        """
        select cls.relname, cls.relrowsecurity
        from pg_class as cls
        join pg_namespace as ns on ns.oid = cls.relnamespace
        where ns.nspname = 'public'
          and cls.relkind = 'r'
          and cls.relname = any(%s)
        """,
        (list(EXPECTED_TABLES),),
    ).fetchall()
    rls_disabled = sorted(str(name) for name, enabled in rls_rows if not enabled)
    require(not rls_disabled, f"RLS disabled on: {rls_disabled}")

    policy_rows = connection.execute(
        """
        select tablename, count(*)
        from pg_policies
        where schemaname = 'public'
        group by tablename
        """
    ).fetchall()
    policy_counts = {str(table): int(count) for table, count in policy_rows}
    require(policy_counts == EXPECTED_POLICY_COUNTS, f"Unexpected policies: {policy_counts}")

    anon_grants = connection.execute(
        """
        select count(*)
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee = 'anon'
          and table_name = any(%s)
        """,
        (list(EXPECTED_TABLES),),
    ).fetchone()
    require(anon_grants is not None and int(anon_grants[0]) == 0, "anon has table grants")

    authenticated_tables = connection.execute(
        """
        select distinct table_name
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee = 'authenticated'
          and table_name = any(%s)
        """,
        (list(EXPECTED_TABLES),),
    ).fetchall()
    granted_tables = {str(row[0]) for row in authenticated_tables}
    require(
        granted_tables == set(EXPECTED_POLICY_COUNTS),
        f"Unexpected authenticated grants: {sorted(granted_tables)}",
    )

    profile_update_columns = connection.execute(
        """
        select column_name
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'profiles'
          and grantee = 'authenticated'
          and privilege_type = 'UPDATE'
        """
    ).fetchall()
    require(
        {str(row[0]) for row in profile_update_columns}
        == {"avatar_url", "display_name", "timezone"},
        "Profile update grants could permit role escalation",
    )

    seed_row = connection.execute(
        """
        select
          (select count(*) from public.sports where slug = 'football'),
          (select count(*) from public.strategies where slug in (
            'live-over-05-pressure',
            'prematch-over-15',
            'btts-prematch',
            'double-chance-prematch'
          )),
          (select count(*) from auth.users),
          (select count(*) from public.profiles),
          (select count(*) from public.user_preferences)
        """
    ).fetchone()
    require(seed_row is not None, "Seed verification query failed")
    football_count, strategy_count, user_count, profile_count, preference_count = map(int, seed_row)
    require(football_count == 1, "Football seed is missing or duplicated")
    require(strategy_count == 4, "Strategy seeds are missing")
    require(user_count == profile_count == preference_count, "Auth profile backfill is incomplete")

    trigger_count = connection.execute(
        """
        select count(*)
        from pg_trigger
        where tgname = 'on_auth_user_created'
          and not tgisinternal
        """
    ).fetchone()
    require(trigger_count is not None and int(trigger_count[0]) == 1, "Auth trigger missing")

    print(
        "schema=ok "
        f"tables={len(EXPECTED_TABLES)} policies={sum(policy_counts.values())} "
        f"users={user_count} strategies={strategy_count}"
    )


def verify_user_isolation(connection: psycopg.Connection[tuple[object, ...]]) -> None:
    row = connection.execute("select id from auth.users order by created_at limit 1").fetchone()
    if row is None:
        print("rls_runtime=skipped reason=no_auth_users")
        return

    user_id = str(row[0])
    with connection.transaction():
        connection.execute("set local role authenticated")
        connection.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": user_id, "role": "authenticated"}),),
        )
        own_count = connection.execute("select count(*) from public.profiles").fetchone()
        require(own_count is not None and int(own_count[0]) == 1, "User cannot read own profile")

    with connection.transaction():
        connection.execute("set local role authenticated")
        connection.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": str(uuid4()), "role": "authenticated"}),),
        )
        other_count = connection.execute("select count(*) from public.profiles").fetchone()
        require(other_count is not None and int(other_count[0]) == 0, "Cross-user profile leak")

    print("rls_runtime=ok own_rows=1 cross_user_rows=0")


def main() -> None:
    database_url = load_database_url()
    with psycopg.connect(database_url, connect_timeout=10, autocommit=True) as connection:
        verify_schema(connection)
        verify_user_isolation(connection)


if __name__ == "__main__":
    main()
