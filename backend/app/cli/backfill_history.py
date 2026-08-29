"""Backfill historical fixtures CLI for SmartBetBot."""

from __future__ import annotations

import argparse
import asyncio
from datetime import date
from time import monotonic

from app.core.config import get_settings
from app.domain.ingestion import WorkerName
from app.domain.sports import FixtureQuery, LeagueQuery
from app.workers.runtime import build_worker_runtime


async def backfill(
    league_id: str, season: int, from_date: date | None = None, to_date: date | None = None
) -> None:
    settings = get_settings()
    print("=" * 60)
    print(f"  SmartBetBot Historical Backfill: League {league_id}, Season {season}")
    if from_date or to_date:
        print(f"  Date Range: {from_date} to {to_date}")
    print("=" * 60)

    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    try:
        resp = await runtime.provider.list_leagues(
            LeagueQuery(external_id=league_id, current_only=False)
        )
        if not resp.items:
            print(f"Error: League {league_id} not found in provider.")
            return
        league = resp.items[0]
        query = FixtureQuery(
            league_external_id=league.ref.external_id,
            season=season,
            date_from=from_date,
            date_to=to_date,
        )
        print(f"Fetching fixtures from {runtime.provider.name}...")
        start = monotonic()
        fixtures_resp = await runtime.provider.list_fixtures(query)
        fetch_time = round(monotonic() - start, 2)
        print(
            f"Fetched {len(fixtures_resp.items)} fixtures ({fetch_time}s). Writing to database..."
        )

        written = await runtime.repository.upsert_fixtures(fixtures_resp.items)
        print(
            f"Successfully backfilled {len(fixtures_resp.items)} fixtures "
            f"({written} DB rows affected)."
        )
        print("=" * 60)
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill historical fixtures for a league and season."
    )
    parser.add_argument("--league", required=True, help="Provider league ID (e.g. 39)")
    parser.add_argument("--season", type=int, required=True, help="Season year (e.g. 2024)")
    parser.add_argument("--from", dest="from_date", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="to_date", help="End date (YYYY-MM-DD)")
    args = parser.parse_args()

    from_d = date.fromisoformat(args.from_date) if args.from_date else None
    to_d = date.fromisoformat(args.to_date) if args.to_date else None

    asyncio.run(backfill(args.league, args.season, from_d, to_d))


if __name__ == "__main__":
    main()
