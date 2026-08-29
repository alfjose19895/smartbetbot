from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncConnection

from app.repositories.base import fetch_all, fetch_one, fetch_page

SIGNAL_COLUMNS = """
    s.id,
    s.fixture_id,
    s.strategy_id,
    st.name as strategy_name,
    jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'country', c.name,
      'logo_url', l.logo_url
    ) as league,
    jsonb_build_object('id', ht.id, 'name', ht.name, 'logo_url', ht.logo_url) as home_team,
    jsonb_build_object('id', at.id, 'name', at.name, 'logo_url', at.logo_url) as away_team,
    f.kickoff_at,
    s.signal_type,
    s.market,
    s.selection,
    s.line::double precision as line,
    s.decimal_odds::double precision as decimal_odds,
    s.model_probability::double precision as model_probability,
    s.raw_implied_probability::double precision as raw_implied_probability,
    s.fair_market_probability::double precision as fair_market_probability,
    s.edge::double precision as edge,
    s.expected_value::double precision as expected_value,
    s.data_quality_score::double precision as data_quality_score,
    s.live_pressure_score::double precision as live_pressure_score,
    s.smart_score::double precision as smart_score,
    s.category,
    s.status,
    s.triggered_at,
    s.match_minute,
    s.critical_event
"""

SIGNAL_JOINS = """
from public.signals as s
join public.strategies as st on st.id = s.strategy_id
join public.fixtures as f on f.id = s.fixture_id
join public.leagues as l on l.id = f.league_id
left join public.countries as c on c.id = l.country_id
join public.teams as ht on ht.id = f.home_team_id
join public.teams as at on at.id = f.away_team_id
"""

PERFORMANCE_COLUMNS = """
    count(*)::integer as settled_signals,
    count(*) filter (where sr.result_status in ('won', 'lost'))::integer as resolved_signals,
    count(*) filter (where sr.result_status = 'won')::integer as wins,
    count(*) filter (where sr.result_status = 'lost')::integer as losses,
    count(*) filter (where sr.result_status = 'push')::integer as pushes,
    count(*) filter (where sr.result_status = 'void')::integer as voids,
    (
      count(*) filter (where sr.result_status = 'won')::double precision
      / nullif(count(*) filter (where sr.result_status in ('won', 'lost')), 0)
    ) as win_rate,
    avg(s.decimal_odds)::double precision as average_odds,
    coalesce(sum(sr.stake_units), 0)::double precision as stake_units,
    coalesce(sum(sr.profit_loss_units), 0)::double precision as profit_loss_units,
    (
      coalesce(sum(sr.profit_loss_units), 0)::double precision
      / nullif(sum(sr.stake_units), 0)::double precision
    ) as roi,
    (
      coalesce(sum(sr.profit_loss_units), 0)::double precision
      / nullif(sum(sr.stake_units), 0)::double precision
    ) as yield_rate
"""


class SignalRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self.connection = connection

    async def list(
        self,
        *,
        signal_type: Literal["live", "prematch"] | None,
        since: datetime | None,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        conditions: list[str] = []
        if signal_type:
            conditions.append("s.signal_type = :signal_type")
        if since:
            conditions.append("s.triggered_at >= :since")
        condition = f"where {' and '.join(conditions)}" if conditions else ""
        return await fetch_page(
            self.connection,
            f"""
            select {SIGNAL_COLUMNS}, count(*) over() as total_count
            {SIGNAL_JOINS}
            {condition}
            order by s.triggered_at desc, s.id
            limit :limit offset :offset
            """,
            {"signal_type": signal_type, "since": since, "limit": limit, "offset": offset},
        )

    async def get(self, signal_id: UUID) -> dict[str, Any] | None:
        signal = await fetch_one(
            self.connection,
            f"""
            select {SIGNAL_COLUMNS}, s.prediction_id, s.model_version_id
            {SIGNAL_JOINS}
            where s.id = :signal_id
            """,
            {"signal_id": signal_id},
        )
        if signal is None:
            return None

        signal["reasons"] = await fetch_all(
            self.connection,
            """
            select
              code,
              label,
              numeric_value::double precision as numeric_value,
              text_value,
              unit,
              sort_order,
              metadata
            from public.signal_reasons
            where signal_id = :signal_id
            order by sort_order, id
            """,
            {"signal_id": signal_id},
        )
        signal["result"] = await fetch_one(
            self.connection,
            """
            select
              result_status,
              home_score,
              away_score,
              settled_at,
              settlement_odds::double precision as settlement_odds,
              stake_units::double precision as stake_units,
              profit_loss_units::double precision as profit_loss_units
            from public.signal_results
            where signal_id = :signal_id
            """,
            {"signal_id": signal_id},
        )
        return signal

    async def performance(
        self,
        *,
        since: datetime | None = None,
        signal_type: Literal["live", "prematch"] | None = None,
        league_id: UUID | None = None,
        market: str | None = None,
        strategy_id: UUID | None = None,
    ) -> dict[str, Any]:
        conditions = ["sr.result_status <> 'pending'"]
        parameters: dict[str, object] = {}
        optional = {
            "since": (since, "sr.settled_at >= :since"),
            "signal_type": (signal_type, "s.signal_type = :signal_type"),
            "league_id": (league_id, "f.league_id = :league_id"),
            "market": (market, "s.market = :market"),
            "strategy_id": (strategy_id, "s.strategy_id = :strategy_id"),
        }
        for name, (value, statement) in optional.items():
            if value is not None:
                conditions.append(statement)
                parameters[name] = value
        row = await fetch_one(
            self.connection,
            f"""
            select {PERFORMANCE_COLUMNS}
            from public.signal_results as sr
            join public.signals as s on s.id = sr.signal_id
            join public.fixtures as f on f.id = s.fixture_id
            where {" and ".join(conditions)}
            """,
            parameters,
        )
        assert row is not None
        return row

    async def performance_by_market(self) -> list[dict[str, Any]]:
        return await fetch_all(
            self.connection,
            f"""
            select s.market as key, s.market as label, {PERFORMANCE_COLUMNS}
            from public.signal_results as sr
            join public.signals as s on s.id = sr.signal_id
            where sr.result_status <> 'pending'
            group by s.market
            order by settled_signals desc, s.market
            """,
        )

    async def performance_by_league(self) -> list[dict[str, Any]]:
        return await fetch_all(
            self.connection,
            f"""
            select l.id::text as key, l.name as label, {PERFORMANCE_COLUMNS}
            from public.signal_results as sr
            join public.signals as s on s.id = sr.signal_id
            join public.fixtures as f on f.id = s.fixture_id
            join public.leagues as l on l.id = f.league_id
            where sr.result_status <> 'pending'
            group by l.id, l.name
            order by settled_signals desc, l.name
            """,
        )

    async def track_record(
        self,
        *,
        limit: int,
        offset: int,
        since: datetime | None = None,
        signal_type: Literal["live", "prematch"] | None = None,
        league_id: UUID | None = None,
        market: str | None = None,
        strategy_id: UUID | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        conditions = ["sr.result_status <> 'pending'"]
        parameters: dict[str, object] = {"limit": limit, "offset": offset}
        optional = {
            "since": (since, "sr.settled_at >= :since"),
            "signal_type": (signal_type, "s.signal_type = :signal_type"),
            "league_id": (league_id, "f.league_id = :league_id"),
            "market": (market, "s.market = :market"),
            "strategy_id": (strategy_id, "s.strategy_id = :strategy_id"),
        }
        for name, (value, statement) in optional.items():
            if value is not None:
                conditions.append(statement)
                parameters[name] = value
        return await fetch_page(
            self.connection,
            f"""
            select
              s.id as signal_id,
              s.fixture_id,
              f.kickoff_at,
              ht.name as home_team,
              at.name as away_team,
              l.name as league,
              s.market,
              s.selection,
              s.signal_type,
              st.name as strategy_name,
              s.decimal_odds::double precision as decimal_odds,
              s.model_probability::double precision as model_probability,
              s.smart_score::double precision as smart_score,
              sr.result_status,
              sr.settled_at,
              sr.stake_units::double precision as stake_units,
              sr.profit_loss_units::double precision as profit_loss_units,
              count(*) over() as total_count
            from public.signal_results as sr
            join public.signals as s on s.id = sr.signal_id
            join public.fixtures as f on f.id = s.fixture_id
            join public.leagues as l on l.id = f.league_id
            join public.strategies as st on st.id = s.strategy_id
            join public.teams as ht on ht.id = f.home_team_id
            join public.teams as at on at.id = f.away_team_id
            where {" and ".join(conditions)}
            order by sr.settled_at desc, s.id
            limit :limit offset :offset
            """,
            parameters,
        )
