from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.repositories.base import fetch_one, fetch_page

FIXTURE_COLUMNS = """
    f.id,
    jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'country', c.name,
      'logo_url', l.logo_url
    ) as league,
    jsonb_build_object('id', ht.id, 'name', ht.name, 'logo_url', ht.logo_url) as home_team,
    jsonb_build_object('id', at.id, 'name', at.name, 'logo_url', at.logo_url) as away_team,
    f.kickoff_at,
    f.status,
    f.provider_status,
    f.match_minute,
    f.added_time,
    f.home_score,
    f.away_score,
    f.round,
    f.has_events,
    f.has_statistics,
    f.has_odds,
    f.last_synced_at
"""

FIXTURE_JOINS = """
from public.fixtures as f
join public.leagues as l on l.id = f.league_id
left join public.countries as c on c.id = l.country_id
join public.teams as ht on ht.id = f.home_team_id
join public.teams as at on at.id = f.away_team_id
"""


class FixtureRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self.connection = connection

    async def list_live(self, *, limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
        return await fetch_page(
            self.connection,
            f"""
            select {FIXTURE_COLUMNS}, count(*) over() as total_count
            {FIXTURE_JOINS}
            where f.status in ('live', 'halftime')
            order by f.kickoff_at, f.id
            limit :limit offset :offset
            """,
            {"limit": limit, "offset": offset},
        )

    async def list_upcoming(
        self,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        return await fetch_page(
            self.connection,
            f"""
            select {FIXTURE_COLUMNS}, count(*) over() as total_count
            {FIXTURE_JOINS}
            where f.status = 'scheduled'
              and f.kickoff_at >= now()
            order by f.kickoff_at, f.id
            limit :limit offset :offset
            """,
            {"limit": limit, "offset": offset},
        )

    async def get(self, fixture_id: UUID) -> dict[str, Any] | None:
        return await fetch_one(
            self.connection,
            f"""
            select
              {FIXTURE_COLUMNS},
              f.season_id,
              f.halftime_home_score,
              f.halftime_away_score,
              f.referee,
              f.venue,
              f.created_at,
              f.updated_at
            {FIXTURE_JOINS}
            where f.id = :fixture_id
            """,
            {"fixture_id": fixture_id},
        )

    async def list_live_analysis(
        self, *, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        items, total = await self.list_live(limit=limit, offset=offset)
        await self._attach_live_analysis(items)
        return items, total

    async def _attach_live_analysis(self, items: list[dict[str, Any]]) -> None:
        fixture_ids = [item["id"] for item in items]
        if not fixture_ids:
            return
        stats = await self.connection.execute(
            text(
                """
                select distinct on (snapshot.fixture_id, snapshot.team_id)
                  snapshot.fixture_id, snapshot.team_id, snapshot.captured_at,
                  snapshot.match_minute, snapshot.shots, snapshot.shots_on_target,
                  snapshot.possession::double precision as possession,
                  snapshot.corners, snapshot.yellow_cards, snapshot.red_cards,
                  snapshot.attacks, snapshot.dangerous_attacks
                from public.fixture_stats_snapshots snapshot
                where snapshot.fixture_id = any(:fixture_ids)
                order by snapshot.fixture_id, snapshot.team_id,
                  snapshot.captured_at desc, snapshot.id desc
                """
            ),
            {"fixture_ids": fixture_ids},
        )
        fixtures_by_id = {item["id"]: item for item in items}
        for item in items:
            item["home_statistics"] = None
            item["away_statistics"] = None
            item["current_signals"] = []
        for row in stats.mappings():
            fixture = fixtures_by_id[row["fixture_id"]]
            values = dict(row)
            values.pop("fixture_id")
            team_id = values.pop("team_id")
            side = "home_statistics" if team_id == fixture["home_team"]["id"] else "away_statistics"
            fixture[side] = values
        signals = await self.connection.execute(
            text(
                """
                select id, fixture_id, market, selection, line::double precision as line,
                  smart_score::double precision as smart_score,
                  live_pressure_score::double precision as live_pressure_score,
                  category, triggered_at
                from public.signals
                where fixture_id = any(:fixture_ids) and signal_type = 'live'
                  and status = 'qualified'
                order by triggered_at desc, id
                """
            ),
            {"fixture_ids": fixture_ids},
        )
        for row in signals.mappings():
            values = dict(row)
            fixture_id = values.pop("fixture_id")
            fixtures_by_id[fixture_id]["current_signals"].append(values)

    async def list_upcoming_analysis(
        self,
        *,
        limit: int,
        offset: int,
        date_from: datetime,
        date_to: datetime,
        league_id: UUID | None,
        market: str | None,
        minimum_smart_score: int | None,
    ) -> tuple[list[dict[str, Any]], int]:
        conditions = [
            "f.status = 'scheduled'",
            "f.kickoff_at >= :date_from",
            "f.kickoff_at < :date_to",
        ]
        parameters: dict[str, object] = {
            "limit": limit,
            "offset": offset,
            "date_from": date_from,
            "date_to": date_to,
        }
        if league_id is not None:
            conditions.append("f.league_id = :league_id")
            parameters["league_id"] = league_id
        if market is not None:
            conditions.append(
                "exists (select 1 from public.predictions p "
                "where p.fixture_id = f.id and p.market = :market)"
            )
            parameters["market"] = market
        if minimum_smart_score is not None:
            conditions.append(
                "exists (select 1 from public.signals s where s.fixture_id = f.id "
                "and s.smart_score >= :minimum_smart_score)"
            )
            parameters["minimum_smart_score"] = minimum_smart_score
        items, total = await fetch_page(
            self.connection,
            f"""
            select {FIXTURE_COLUMNS}, count(*) over() as total_count
            {FIXTURE_JOINS}
            where {" and ".join(conditions)}
            order by f.kickoff_at, f.id
            limit :limit offset :offset
            """,
            parameters,
        )
        for item in items:
            item["predictions"] = []
        fixture_ids = [item["id"] for item in items]
        if not fixture_ids:
            return items, total
        prediction_conditions = ["latest.fixture_id = any(:fixture_ids)"]
        if market is not None:
            prediction_conditions.append("latest.market = :market")
        predictions = await self.connection.execute(
            text(
                f"""
                with latest as (
                  select distinct on (fixture_id, market, selection, line)
                    id, fixture_id, model_version_id, market, selection, line,
                    coalesce(calibrated_probability, probability) as probability
                  from public.predictions
                  where fixture_id = any(:fixture_ids)
                  order by fixture_id, market, selection, line,
                    feature_cutoff_at desc, predicted_at desc, id desc
                )
                select latest.id, latest.fixture_id, latest.model_version_id,
                  latest.market, latest.selection, latest.line::double precision as line,
                  latest.probability::double precision as probability,
                  signal.decimal_odds::double precision as decimal_odds,
                  signal.fair_market_probability::double precision as fair_market_probability,
                  signal.edge::double precision as edge,
                  signal.expected_value::double precision as expected_value,
                  signal.smart_score::double precision as smart_score,
                  signal.category, strategy.name as strategy_name
                from latest
                left join lateral (
                  select candidate.* from public.signals candidate
                  where candidate.prediction_id = latest.id
                  order by candidate.triggered_at desc, candidate.id desc limit 1
                ) signal on true
                left join public.strategies strategy on strategy.id = signal.strategy_id
                where {" and ".join(prediction_conditions)}
                order by latest.fixture_id, latest.market, latest.line, latest.selection
                """
            ),
            {"fixture_ids": fixture_ids, "market": market},
        )
        fixtures_by_id = {item["id"]: item for item in items}
        for row in predictions.mappings():
            values = dict(row)
            fixture_id = values.pop("fixture_id")
            fixtures_by_id[fixture_id]["predictions"].append(values)
        return items, total
