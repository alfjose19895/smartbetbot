from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from app.domain.backtesting import BacktestBet, BacktestFilters
from app.services.backtesting import BacktestEngine, calculate_backtest_metrics

START = datetime(2026, 1, 1, tzinfo=UTC)


def _bet(index: int, status: str, odds: str) -> BacktestBet:
    return BacktestBet(
        signal_id=UUID(f"00000000-0000-4000-8000-{index:012d}"),
        settled_at=START + timedelta(days=index),
        result_status=status,
        decimal_odds=Decimal(odds),
    )


def test_backtest_metrics_cover_units_drawdown_and_streaks() -> None:
    metrics = calculate_backtest_metrics(
        (
            _bet(1, "won", "2.00"),
            _bet(2, "won", "1.50"),
            _bet(3, "lost", "1.80"),
            _bet(4, "lost", "1.70"),
            _bet(5, "push", "2.10"),
            _bet(6, "void", "1.90"),
            _bet(7, "won", "3.00"),
        )
    )

    assert metrics.total_bets == 7
    assert (metrics.won, metrics.lost, metrics.push, metrics.void) == (3, 2, 1, 1)
    assert metrics.win_rate == Decimal("0.6000")
    assert metrics.profit_units == Decimal("3.5000")
    assert metrics.loss_units == Decimal("2.0000")
    assert metrics.net_units == Decimal("1.5000")
    assert metrics.roi == Decimal("0.2500")
    assert metrics.maximum_drawdown == Decimal("2.0000")
    assert metrics.longest_winning_streak == 2
    assert metrics.longest_losing_streak == 2


class _Repository:
    async def list_bets(self, filters: BacktestFilters) -> tuple[BacktestBet, ...]:
        assert filters.market == "total_goals"
        return (_bet(1, "won", "1.65"), _bet(2, "lost", "1.80"))


@pytest.mark.anyio
async def test_backtest_engine_is_deterministic_and_declares_methodology() -> None:
    filters = BacktestFilters(
        date_from=START,
        date_to=START + timedelta(days=30),
        market="total_goals",
        min_probability=Decimal("0.75"),
        min_edge=Decimal("0.05"),
        min_smart_score=Decimal("75"),
    )
    engine = BacktestEngine(_Repository(), clock=lambda: START)

    result = await engine.run(filters)

    assert result.generated_at == START
    assert result.metrics.net_units == Decimal("-0.3500")
    assert "1-unit" in result.methodology
    assert "no automatic betting" in result.methodology


def test_required_probability_odds_edge_and_ev_example() -> None:
    probability = Decimal("0.81")
    odds = Decimal("1.65")
    implied = Decimal("1") / odds
    edge = probability - implied
    expected_value = probability * odds - 1

    assert implied.quantize(Decimal("0.0001")) == Decimal("0.6061")
    assert edge.quantize(Decimal("0.0001")) == Decimal("0.2039")
    assert expected_value == Decimal("0.3365")
