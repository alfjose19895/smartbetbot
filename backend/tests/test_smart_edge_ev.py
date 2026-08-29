"""Explicit mathematical and boundary tests for Smart Edge and Expected Value."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from app.domain.intelligence import (
    DataQualityInput,
    MarketPrice,
    SignalOpportunity,
    StrategyRule,
)
from app.signals.engine import evaluate_opportunity

FIXTURE_ID = UUID("10000000-0000-4000-8000-000000000001")
PREDICTION_ID = UUID("20000000-0000-4000-8000-000000000001")
MODEL_ID = UUID("30000000-0000-4000-8000-000000000001")
STRATEGY_ID = UUID("40000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 8, 25, 15, tzinfo=UTC)


def test_smart_edge_formula_standard_benchmark() -> None:
    """Validate model_prob = 0.80, odds = 1.70 yields implied ~0.588235, edge ~0.211765 (21.18%)."""
    model_probability = Decimal("0.80")
    decimal_odds = Decimal("1.70")

    implied_probability = Decimal("1") / decimal_odds
    edge = model_probability - implied_probability

    assert round(implied_probability, 6) == Decimal("0.588235")
    assert round(edge, 6) == Decimal("0.211765")
    assert round(edge * 100, 2) == Decimal("21.18")


def test_expected_value_formula_standard_benchmark() -> None:
    """Validate model_prob = 0.80, odds = 1.70 yields EV = +0.36 (+36%)."""
    model_probability = Decimal("0.80")
    decimal_odds = Decimal("1.70")

    ev = (model_probability * decimal_odds) - Decimal("1")

    assert ev == Decimal("0.36")
    assert round(ev * 100, 1) == Decimal("36.0")


def test_signal_engine_evaluates_exact_edge_and_ev() -> None:
    quote = MarketPrice(
        bookmaker="pinnacle",
        market="match_winner",
        selection="home",
        line=None,
        decimal_odds=Decimal("1.70"),
        raw_implied_probability=Decimal("1") / Decimal("1.70"),
        captured_at=NOW,
        stopped=False,
    )
    opp = SignalOpportunity(
        fixture_id=FIXTURE_ID,
        prediction_id=PREDICTION_ID,
        model_version_id=MODEL_ID,
        market="match_winner",
        selection="home",
        line=None,
        model_probability=Decimal("0.80"),
        calibration_error=Decimal("0.02"),
        quote=quote,
        market_prices=(quote,),
        strategy=StrategyRule(
            id=STRATEGY_ID,
            slug="prematch-value-home",
            market="match_winner",
            is_live=False,
            min_probability=Decimal("0.75"),
            min_edge=Decimal("0.05"),
            min_data_quality=Decimal("0.70"),
            min_smart_score=Decimal("75"),
            cooldown_seconds=300,
        ),
        quality=DataQualityInput(
            phase="prematch",
            odds=True,
            historical_features=True,
            lineups=True,
            standings=True,
        ),
    )

    decision = evaluate_opportunity(opp)
    assert decision.qualified is True
    assert decision.edge is not None
    assert round(decision.edge, 4) == Decimal("0.2118")
    assert decision.expected_value is not None
    assert round(decision.expected_value, 4) == Decimal("0.3600")
