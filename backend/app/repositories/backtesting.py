from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.domain.backtesting import BacktestBet, BacktestFilters


class BacktestRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self.connection = connection

    async def list_bets(self, filters: BacktestFilters) -> tuple[BacktestBet, ...]:
        conditions = [
            "sr.settled_at >= :date_from",
            "sr.settled_at < :date_to",
            "sr.result_status <> 'pending'",
            "s.model_probability >= :min_probability",
            "s.edge >= :min_edge",
            "s.smart_score >= :min_smart_score",
        ]
        parameters = filters.model_dump(mode="python")
        optional = {
            "market": "s.market = :market",
            "league_id": "f.league_id = :league_id",
            "strategy_id": "s.strategy_id = :strategy_id",
            "signal_type": "s.signal_type = :signal_type",
            "min_odds": "s.decimal_odds >= :min_odds",
            "max_odds": "s.decimal_odds <= :max_odds",
        }
        conditions.extend(
            statement
            for field, statement in optional.items()
            if getattr(filters, field) is not None
        )
        result = await self.connection.execute(
            text(
                f"""
                select s.id as signal_id, sr.settled_at, sr.result_status, s.decimal_odds
                from public.signal_results sr
                join public.signals s on s.id = sr.signal_id
                join public.fixtures f on f.id = s.fixture_id
                where {" and ".join(conditions)}
                order by sr.settled_at, s.id
                """
            ),
            parameters,
        )
        return tuple(BacktestBet.model_validate(dict(row)) for row in result.mappings())
