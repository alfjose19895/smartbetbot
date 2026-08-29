from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.settlement import SettlementDecision, SettlementTarget


class SettlementRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def list_unsettled(self, *, limit: int) -> tuple[SettlementTarget, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select s.id as signal_id, s.fixture_id, f.status as fixture_status,
                      s.market, s.selection, s.line, s.decimal_odds,
                      f.home_score, f.away_score, s.match_minute,
                      case
                        when s.market = 'next_goal' then (
                          select case
                            when event.team_id = f.home_team_id then 'home'
                            when event.team_id = f.away_team_id then 'away'
                            else null
                          end
                          from public.fixture_events event
                          where event.fixture_id = f.id and event.event_type = 'goal'
                            and event.match_minute > coalesce(s.match_minute, -1)
                          order by event.match_minute, event.id limit 1
                        )
                      end as next_goal_side
                    from public.signals s
                    join public.fixtures f on f.id = s.fixture_id
                    left join public.signal_results result on result.signal_id = s.id
                    where result.signal_id is null
                      and s.status in ('qualified', 'cancelled')
                      and f.status in ('finished', 'cancelled', 'abandoned')
                    order by f.kickoff_at, s.triggered_at, s.id
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
            return tuple(SettlementTarget.model_validate(dict(row)) for row in result.mappings())

    async def persist_decisions(
        self, decisions: tuple[SettlementDecision, ...], *, settled_at: datetime
    ) -> int:
        if not decisions:
            return 0
        rows = [item.model_dump(mode="json") for item in decisions]
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    with inserted as (
                      insert into public.signal_results (
                        signal_id, result_status, home_score, away_score, settled_at,
                        settlement_odds, stake_units, profit_loss_units, settlement_details
                      )
                      select candidate.signal_id::uuid, candidate.status,
                        candidate.home_score::smallint, candidate.away_score::smallint,
                        :settled_at, s.decimal_odds, candidate.stake_units::numeric,
                        candidate.profit_loss_units::numeric,
                        jsonb_build_object('reason', candidate.reason, 'engine_version', 1)
                      from jsonb_to_recordset(cast(:rows as jsonb)) as candidate (
                        signal_id text, status text, home_score integer, away_score integer,
                        stake_units text, profit_loss_units text, reason text
                      )
                      join public.signals s on s.id = candidate.signal_id::uuid
                      on conflict (signal_id) do nothing
                      returning signal_id
                    ), updated as (
                      update public.signals s set status = 'settled'
                      where s.id in (select signal_id from inserted)
                      returning s.id
                    )
                    select count(*)::integer from updated
                    """
                ),
                {"settled_at": settled_at, "rows": json.dumps(rows)},
            )
            return int(result.scalar_one())
