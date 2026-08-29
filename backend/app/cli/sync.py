"""Selective sports data synchronization CLI for SmartBetBot."""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime

from app.core.config import Settings, get_settings
from app.domain.ingestion import WorkerName
from app.domain.sports import FixtureQuery, LeagueQuery, TeamQuery
from app.services.ingestion.live import LiveIngestionService, LiveIngestionSettings
from app.services.ingestion.prematch import PrematchIngestionPolicy, PrematchIngestionService
from app.workers.runtime import build_worker_runtime


async def sync_leagues(settings: Settings, target_leagues: tuple[str, ...]) -> None:
    print(f"Syncing leagues: {target_leagues}...")
    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    try:
        count = 0
        for league_id in target_leagues:
            response = await runtime.provider.list_leagues(
                LeagueQuery(external_id=league_id, current_only=True)
            )
            for league in response.items:
                current_season = next(
                    (s for s in league.seasons if s.is_current),
                    league.seasons[0] if league.seasons else None,
                )
                if current_season:
                    await runtime.repository.upsert_league(league, current_season)
                    count += 1
                    print(f"  - Upserted league: {league.name} ({league.ref.external_id})")
        print(f"Successfully synchronized {count} leagues.")
    finally:
        await runtime.close()


async def sync_teams(settings: Settings, target_leagues: tuple[str, ...]) -> None:
    print(f"Syncing teams for leagues: {target_leagues}...")
    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    try:
        for league_id in target_leagues:
            resp = await runtime.provider.list_leagues(
                LeagueQuery(external_id=league_id, current_only=True)
            )
            if not resp.items:
                print(f"League {league_id} not found.")
                continue
            league = resp.items[0]
            current_season = next(
                (s for s in league.seasons if s.is_current),
                league.seasons[0] if league.seasons else None,
            )
            if not current_season:
                continue
            teams_resp = await runtime.provider.list_teams(
                TeamQuery(league_external_id=league.ref.external_id, season=current_season.year)
            )
            written = await runtime.repository.upsert_teams(
                league, current_season, teams_resp.items
            )
            print(
                f"League {league.name}: Upserted {len(teams_resp.items)} teams "
                f"({written} records written)."
            )
    finally:
        await runtime.close()


async def sync_fixtures(
    settings: Settings, target_leagues: tuple[str, ...], lookahead: int = 14
) -> None:
    print(f"Syncing fixtures for leagues: {target_leagues} (lookahead: {lookahead}d)...")
    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    try:
        now = datetime.now(UTC)
        for league_id in target_leagues:
            resp = await runtime.provider.list_leagues(
                LeagueQuery(external_id=league_id, current_only=True)
            )
            if not resp.items:
                continue
            league = resp.items[0]
            current_season = next(
                (s for s in league.seasons if s.is_current),
                league.seasons[0] if league.seasons else None,
            )
            if not current_season:
                continue
            from_d = now.date()
            to_d = datetime.fromtimestamp(now.timestamp() + lookahead * 86400, tz=UTC).date()
            fixtures_resp = await runtime.provider.list_fixtures(
                FixtureQuery(
                    league_external_id=league.ref.external_id,
                    season=current_season.year,
                    date_from=from_d,
                    date_to=to_d,
                )
            )
            written = await runtime.repository.upsert_fixtures(fixtures_resp.items)
            print(
                f"League {league.name}: Upserted {len(fixtures_resp.items)} fixtures "
                f"({written} records written)."
            )
    finally:
        await runtime.close()


async def sync_prematch(settings: Settings, target_leagues: tuple[str, ...]) -> None:
    print("Running prematch cycle...")
    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    try:
        service = PrematchIngestionService(runtime.provider, runtime.repository)
        report = await service.run_once(PrematchIngestionPolicy(league_external_ids=target_leagues))
        print(
            f"Prematch cycle complete: {report.fixtures_written} fixtures written, "
            f"{report.records_written} records written."
        )
    finally:
        await runtime.close()


async def sync_live(settings: Settings) -> None:
    print("Running live match discovery cycle...")
    runtime = await build_worker_runtime(settings, WorkerName.LIVE)
    try:
        service = LiveIngestionService(
            provider=runtime.provider,
            repository=runtime.repository,
            locks=runtime.locks,
            settings=LiveIngestionSettings(
                warmup_minutes=settings.live_candidate_warmup_minutes,
                stale_candidate_hours=settings.live_candidate_stale_hours,
                max_concurrency=settings.live_max_concurrency,
                lock_ttl_seconds=settings.live_worker_lock_seconds,
            ),
        )
        report = await service.run_once()
        print(
            f"Live cycle complete: {report.fixtures_seen} live matches seen, "
            f"{report.records_written} records written."
        )
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronize sports data on demand.")
    parser.add_argument("target", choices=["leagues", "teams", "fixtures", "prematch", "live"])
    parser.add_argument("--leagues", default="39,140", help="Comma-separated league IDs")
    parser.add_argument("--lookahead", type=int, default=14, help="Days lookahead for fixtures")
    args = parser.parse_args()

    settings = get_settings()
    league_tuple = tuple(item.strip() for item in args.leagues.split(",") if item.strip())

    if args.target == "leagues":
        asyncio.run(sync_leagues(settings, league_tuple))
    elif args.target == "teams":
        asyncio.run(sync_teams(settings, league_tuple))
    elif args.target == "fixtures":
        asyncio.run(sync_fixtures(settings, league_tuple, args.lookahead))
    elif args.target == "prematch":
        asyncio.run(sync_prematch(settings, league_tuple))
    elif args.target == "live":
        asyncio.run(sync_live(settings))


if __name__ == "__main__":
    main()
