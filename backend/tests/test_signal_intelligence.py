from __future__ import annotations

import inspect
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from app.domain.intelligence import (
    DataQualityInput,
    LiveEvent,
    LiveMetricSnapshot,
    MarketPrice,
    PersistedSignal,
    PreviousSignal,
    SignalCategory,
    SignalOpportunity,
    SmartScoreInput,
    StrategyRule,
)
from app.repositories.intelligence import IntelligenceRepository
from app.services.intelligence import SignalEngineService
from app.signals import calculate_live_pressure, calculate_smart_score, evaluate_data_quality
from app.signals.engine import evaluate_opportunity, materially_changed

FIXTURE_ID = UUID("10000000-0000-4000-8000-000000000001")
PREDICTION_ID = UUID("20000000-0000-4000-8000-000000000001")
MODEL_ID = UUID("30000000-0000-4000-8000-000000000001")
STRATEGY_ID = UUID("40000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 8, 25, 15, tzinfo=UTC)


def test_signal_persistence_uses_sqlalchemy_safe_postgres_casts() -> None:
    source = inspect.getsource(IntelligenceRepository.persist_signal)

    assert re.search(r":[a-zA-Z_][a-zA-Z0-9_]*::", source) is None
    assert "cast(:smart_score as text)" in source
    assert "cast(:signal_id as text)" in source
    assert "cast(:market as text)" in source
    assert "cast(:selection as text)" in source
    assert "cast(:signal_type as text)" in source


def test_data_quality_is_phase_aware_and_required_inputs_fail_closed() -> None:
    complete_prematch = DataQualityInput(
        phase="prematch", odds=True, historical_features=True, lineups=True, standings=True
    )
    missing_odds = complete_prematch.model_copy(update={"odds": False})
    live_without_minute = DataQualityInput(
        phase="live",
        score=True,
        events=True,
        statistics=True,
        shots=True,
        shots_on_target=True,
        possession=True,
        corners=True,
        cards=True,
        odds=True,
        historical_features=True,
        lineups=True,
    )

    assert evaluate_data_quality(complete_prematch).score == 100
    assert evaluate_data_quality(complete_prematch).sufficient is True
    assert evaluate_data_quality(missing_odds).sufficient is False
    assert evaluate_data_quality(live_without_minute).sufficient is False


def _snapshots() -> tuple[LiveMetricSnapshot, ...]:
    snapshots: list[LiveMetricSnapshot] = []
    for minute, home_shots, away_shots in ((5, 1, 0), (10, 3, 1), (15, 5, 2), (20, 9, 3)):
        captured = NOW + timedelta(minutes=minute)
        snapshots.extend(
            (
                LiveMetricSnapshot(
                    captured_at=captured,
                    match_minute=minute,
                    side="home",
                    shots=home_shots,
                    shots_on_target=max(0, home_shots - 3),
                    possession=Decimal("61"),
                    corners=minute // 5,
                    attacks=minute * 2,
                    dangerous_attacks=minute,
                    yellow_cards=1,
                    red_cards=0,
                ),
                LiveMetricSnapshot(
                    captured_at=captured,
                    match_minute=minute,
                    side="away",
                    shots=away_shots,
                    shots_on_target=max(0, away_shots - 2),
                    possession=Decimal("39"),
                    corners=max(0, minute // 10 - 1),
                    attacks=minute,
                    dangerous_attacks=minute // 3,
                    yellow_cards=2,
                    red_cards=0,
                ),
            )
        )
    return tuple(snapshots)


def test_live_pressure_uses_real_windows_and_does_not_invent_missing_snapshots() -> None:
    pressure = calculate_live_pressure(
        _snapshots(), (LiveEvent(side="home", event_type="goal", match_minute=18),)
    )
    missing = calculate_live_pressure(_snapshots()[-2:])

    assert pressure.windows_available == (5, 10, 15)
    assert pressure.home_score is not None and pressure.away_score is not None
    assert pressure.home_score > pressure.away_score
    assert pressure.dominant_side == "home"
    assert missing.home_score is None
    assert "home_window_history" in missing.missing


def test_smart_score_is_deterministic_and_uses_documented_categories() -> None:
    value = SmartScoreInput(
        phase="prematch",
        model_probability=Decimal("0.90"),
        edge=Decimal("0.15"),
        data_quality=Decimal("100"),
        calibration_quality=Decimal("95"),
        stability=Decimal("90"),
        market_quality=Decimal("95"),
    )
    first = calculate_smart_score(value)
    second = calculate_smart_score(value)

    assert first == second
    assert first.score >= 90
    assert first.category == SignalCategory.ELITE


def _opportunity(*, is_live: bool = False) -> SignalOpportunity:
    strategy = StrategyRule(
        id=STRATEGY_ID,
        slug="test-strategy",
        market="total_goals",
        is_live=is_live,
        min_probability=Decimal("0.75"),
        min_edge=Decimal("0.05"),
        min_smart_score=Decimal("75"),
        min_data_quality=Decimal("0.70"),
        min_odds=Decimal("1.10"),
        max_odds=Decimal("3.00"),
        cooldown_seconds=300,
    )
    quote = MarketPrice(
        bookmaker="Book",
        market="total_goals",
        selection="over",
        line=Decimal("1.500"),
        decimal_odds=Decimal("2.00"),
        raw_implied_probability=Decimal("0.500000"),
        captured_at=NOW,
    )
    prices = (
        quote,
        MarketPrice(
            bookmaker="Book",
            market="total_goals",
            selection="under",
            line=Decimal("1.500"),
            decimal_odds=Decimal("1.90"),
            raw_implied_probability=Decimal("0.526316"),
            captured_at=NOW,
        ),
    )
    quality = DataQualityInput(
        phase="live" if is_live else "prematch",
        minute=is_live,
        score=is_live,
        events=is_live,
        statistics=is_live,
        shots=is_live,
        shots_on_target=is_live,
        possession=is_live,
        corners=is_live,
        cards=is_live,
        odds=True,
        historical_features=True,
        lineups=True,
        standings=not is_live,
    )
    return SignalOpportunity(
        fixture_id=FIXTURE_ID,
        prediction_id=PREDICTION_ID,
        model_version_id=MODEL_ID,
        strategy=strategy,
        market="total_goals",
        selection="over",
        line=Decimal("1.500"),
        model_probability=Decimal("0.85"),
        quote=quote,
        market_prices=prices,
        match_minute=20 if is_live else None,
        quality=quality,
        pressure_snapshots=_snapshots() if is_live else (),
        calibration_error=Decimal("0.05"),
        previous_odds=Decimal("2.10"),
    )


def test_signal_engine_calculates_devig_edge_ev_reasons_and_thresholds() -> None:
    opportunity = _opportunity()
    decision = evaluate_opportunity(opportunity)

    assert decision.qualified is True
    assert decision.fair_market_probability == Decimal("0.487179")
    assert decision.edge == Decimal("0.3628210")
    assert decision.expected_value == Decimal("0.7000000")
    assert decision.smart_score is not None
    assert {reason.code for reason in decision.reasons} == {
        "model_probability",
        "market_edge",
        "expected_value",
        "data_quality",
        "smart_score",
        "deterministic_summary",
    }

    low_probability = opportunity.model_copy(update={"model_probability": Decimal("0.60")})
    suppressed = evaluate_opportunity(low_probability)
    assert suppressed.qualified is False
    assert suppressed.suppression_reason == "probability_below_threshold"


def test_live_signal_recalculates_probability_from_score_minute_and_pressure() -> None:
    base = _opportunity(is_live=True).model_copy(
        update={
            "home_score": 0,
            "away_score": 0,
            "expected_home_goals": Decimal("1.50"),
            "expected_away_goals": Decimal("1.10"),
        }
    )
    scoreless = evaluate_opportunity(base)
    after_goal = evaluate_opportunity(base.model_copy(update={"home_score": 1}))

    assert scoreless.evaluated_probability is not None
    assert after_goal.evaluated_probability is not None
    assert scoreless.evaluated_probability != base.model_probability
    assert after_goal.evaluated_probability > scoreless.evaluated_probability


def test_signal_cooldown_allows_only_material_change_or_critical_event() -> None:
    opportunity = _opportunity()
    decision = evaluate_opportunity(opportunity)
    previous = PreviousSignal(
        triggered_at=NOW - timedelta(seconds=60),
        decimal_odds=Decimal("2.01"),
        edge=decision.edge or Decimal("0"),
        smart_score=decision.smart_score.score if decision.smart_score else Decimal("0"),
        line=opportunity.line,
    )

    assert materially_changed(previous, opportunity, decision, now=NOW) is False
    assert (
        materially_changed(
            previous,
            opportunity.model_copy(update={"critical_event": "red_card"}),
            decision,
            now=NOW,
        )
        is True
    )
    assert materially_changed(previous, opportunity, decision, now=NOW + timedelta(minutes=6))


class _SignalRepository:
    def __init__(self, opportunity: SignalOpportunity) -> None:
        self.opportunity = opportunity
        self.persisted = 0

    async def list_signal_opportunities(self, *, limit: int) -> tuple[SignalOpportunity, ...]:
        assert limit == 10
        return (self.opportunity,)

    async def latest_signal(self, _fingerprint: str) -> None:
        return None

    async def persist_signal(self, *_args: object, **_kwargs: object) -> PersistedSignal:
        self.persisted += 1
        return PersistedSignal(id=FIXTURE_ID, triggered_at=NOW)


@pytest.mark.anyio
async def test_signal_service_generates_only_qualified_idempotent_outputs() -> None:
    repository = _SignalRepository(_opportunity())
    service = SignalEngineService(
        repository,  # type: ignore[arg-type]
        target_limit=10,
        clock=lambda: NOW,
    )

    report = await service.run_once()

    assert report.signals_generated == 1
    assert report.records_written == 1
    assert repository.persisted == 1
