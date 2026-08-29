"""Bootstrap sports data CLI for SmartBetBot.

Performs idempotent bootstrap of catalog, teams, and upcoming fixtures
for enabled leagues without exhausting API quotas or downloading unnecessary leagues.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import UTC, datetime
from time import monotonic

import psycopg

from app.core.config import Settings, get_settings
from app.domain.ingestion import WorkerName
from app.domain.sports import FixtureQuery, LeagueQuery, TeamQuery
from app.workers.runtime import build_worker_runtime


async def get_enabled_league_ids(settings: Settings) -> tuple[str, ...]:
    configured = settings.prematch_league_id_list
    if configured:
        return configured

    if settings.database_dsn:
        try:
            conn = await psycopg.AsyncConnection.connect(
                settings.database_dsn,
                connect_timeout=float(settings.database_connect_timeout_seconds),
            )
            async with conn, conn.cursor() as cur:
                await cur.execute(
                    "SELECT provider_id FROM leagues WHERE is_active = true AND provider = %s;",
                    (settings.sports_data_provider,),
                )
                rows = await cur.fetchall()
                if rows:
                    return tuple(row[0] for row in rows)
        except Exception:
            pass

    if settings.sports_data_provider == "api_football":
        return ("39", "140")
    return ("2021", "2014")


async def bootstrap(
    league_ids: tuple[str, ...] | None = None,
    season_override: int | None = None,
    lookahead_days: int = 14,
) -> bool:
    settings = get_settings()
    print("=" * 60)
    print("  SmartBetBot Sports Data Bootstrap")
    print(f"  Time:     {datetime.now(UTC).isoformat()}")
    print(f"  Provider: {settings.sports_data_provider}")
    print("=" * 60)

    target_leagues = league_ids or await get_enabled_league_ids(settings)
    print(f"Target Leagues: {', '.join(target_leagues)}")

    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    try:
        start_time = monotonic()
        total_leagues = 0
        total_teams = 0
        total_fixtures = 0

        now = datetime.now(UTC)
        for league_id in target_leagues:
            print(f"\n[1/3] Fetching League {league_id}...")
            resp = await runtime.provider.list_leagues(
                LeagueQuery(external_id=league_id, current_only=True)
            )
            if not resp.items:
                print(f"  Warning: League {league_id} not found in provider.")
                continue
            league = resp.items[0]
            current_season = next(
                (s for s in league.seasons if s.is_current),
                league.seasons[0] if league.seasons else None,
            )
            if not current_season:
                continue

            season_year = season_override or current_season.year
            await runtime.repository.upsert_league(league, current_season)
            total_leagues += 1
            print(f"  League: {league.name} (Season {season_year}) - OK")

            print(f"[2/3] Syncing Teams for {league.name}...")
            teams_resp = await runtime.provider.list_teams(
                TeamQuery(league_external_id=league.ref.external_id, season=season_year)
            )
            teams_written = await runtime.repository.upsert_teams(
                league, current_season, teams_resp.items
            )
            total_teams += len(teams_resp.items)
            print(
                f"  Teams: {len(teams_resp.items)} fetched, {teams_written} DB records written."
            )

            print(f"[3/3] Syncing Upcoming Fixtures (lookahead: {lookahead_days}d)...")
            from_d = now.date()
            to_d = datetime.fromtimestamp(now.timestamp() + lookahead_days * 86400, tz=UTC).date()
            fixtures_resp = await runtime.provider.list_fixtures(
                FixtureQuery(
                    league_external_id=league.ref.external_id,
                    season=season_year,
                    date_from=from_d,
                    date_to=to_d,
                )
            )
            fixtures_written = await runtime.repository.upsert_fixtures(fixtures_resp.items)
            total_fixtures += len(fixtures_resp.items)
            print(
                f"  Fixtures: {len(fixtures_resp.items)} fetched, "
                f"{fixtures_written} DB records written."
            )

        duration_s = round(monotonic() - start_time, 2)
        print("\n" + "=" * 60)
        print("  Bootstrap Summary")
        print(f"  Duration:           {duration_s}s")
        print(f"  Leagues Processed:  {total_leagues}")
        print(f"  Teams Processed:    {total_teams}")
        print(f"  Fixtures Processed: {total_fixtures}")

        if settings.database_dsn:
            conn = await psycopg.AsyncConnection.connect(settings.database_dsn)
            async with conn, conn.cursor() as cur:
                await cur.execute(
                    """
                        SELECT
                            (SELECT count(*) FROM countries),
                            (SELECT count(*) FROM leagues),
                            (SELECT count(*) FROM teams),
                            (SELECT count(*) FROM fixtures),
                            (SELECT count(*) FROM fixtures
                             WHERE kickoff_at >= now()
                               AND kickoff_at <= now() + interval '14 days')
                        """
                )
                counts = await cur.fetchone()
                if counts:
                    print("\nDatabase State:")
                    print(f"  Total Countries:          {counts[0]}")
                    print(f"  Total Leagues:            {counts[1]}")
                    print(f"  Total Teams:              {counts[2]}")
                    print(f"  Total Fixtures:           {counts[3]}")
                    print(f"  Upcoming (Next 14 Days):  {counts[4]}")

        print("=" * 60)
        print("Result: BOOTSTRAP COMPLETED SUCCESSFULLY")
        return True
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bootstrap SmartBetBot sports catalog and fixtures."
    )
    parser.add_argument(
        "--leagues",
        help="Comma-separated provider league IDs (e.g. 39,140). Defaults to active leagues.",
    )
    parser.add_argument(
        "--season",
        type=int,
        help="Optional season year override (e.g. 2024). Defaults to current.",
    )
    parser.add_argument(
        "--lookahead",
        type=int,
        default=14,
        help="Lookahead days for upcoming fixtures (default 14).",
    )
    args = parser.parse_args()

    leagues = (
        tuple(item.strip() for item in args.leagues.split(",") if item.strip())
        if args.leagues
        else None
    )
    success = asyncio.run(
        bootstrap(
            league_ids=leagues,
            season_override=args.season,
            lookahead_days=args.lookahead,
        )
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
