from __future__ import annotations

import hashlib
import json
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from math import exp, factorial, floor

from app.domain.intelligence import (
    PreviousSignal,
    SignalCategory,
    SignalDecision,
    SignalOpportunity,
    SignalReason,
    SmartScoreInput,
)
from app.signals.pressure import calculate_live_pressure
from app.signals.quality import evaluate_data_quality
from app.signals.smart_score import calculate_smart_score

SIX_PLACES = Decimal("0.000001")
SEVEN_PLACES = Decimal("0.0000001")


def fair_market_probability(opportunity: SignalOpportunity) -> Decimal | None:
    prices = tuple(
        price
        for price in opportunity.market_prices
        if price.bookmaker == opportunity.quote.bookmaker
        and price.market == opportunity.market
        and price.line == opportunity.line
        and price.captured_at == opportunity.quote.captured_at
        and not price.stopped
    )
    required = {
        "match_winner": {"home", "draw", "away"},
        "total_goals": {"over", "under"},
        "both_teams_to_score": {"yes", "no"},
    }.get(opportunity.market)
    latest_by_selection = {price.selection: price for price in prices}
    if required is None or not required.issubset(latest_by_selection):
        return None
    denominator = sum(
        latest_by_selection[selection].raw_implied_probability for selection in required
    )
    if denominator <= 0 or opportunity.selection not in latest_by_selection:
        return None
    return (
        latest_by_selection[opportunity.selection].raw_implied_probability / denominator
    ).quantize(SIX_PLACES, rounding=ROUND_HALF_UP)


def _fingerprint(opportunity: SignalOpportunity) -> str:
    payload = {
        "fixture_id": str(opportunity.fixture_id),
        "strategy_id": str(opportunity.strategy.id),
        "market": opportunity.market,
        "selection": opportunity.selection,
        "line": str(opportunity.line) if opportunity.line is not None else None,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _suppressed(
    opportunity: SignalOpportunity,
    reason: str,
    *,
    fair_probability: Decimal | None = None,
    edge: Decimal | None = None,
    expected_value: Decimal | None = None,
    data_quality: object,
    pressure: object = None,
    smart_score: object = None,
    evaluated_probability: Decimal | None = None,
) -> SignalDecision:
    return SignalDecision(
        qualified=False,
        suppression_reason=reason,
        evaluated_probability=evaluated_probability,
        fair_market_probability=fair_probability,
        edge=edge,
        expected_value=expected_value,
        data_quality=data_quality,
        live_pressure=pressure,
        smart_score=smart_score,
        fingerprint=_fingerprint(opportunity),
    )


def _live_probability(opportunity: SignalOpportunity, pressure_score: Decimal | None) -> Decimal:
    probability = opportunity.model_probability
    if (
        not opportunity.strategy.is_live
        or opportunity.market != "total_goals"
        or opportunity.line is None
        or opportunity.match_minute is None
        or opportunity.home_score is None
        or opportunity.away_score is None
    ):
        return probability
    current_goals = opportunity.home_score + opportunity.away_score
    maximum_under_total = floor(opportunity.line)
    if opportunity.selection == "over" and current_goals > opportunity.line:
        return Decimal("0.999999")
    if opportunity.selection == "under" and current_goals > maximum_under_total:
        return Decimal("0.000001")
    expected_total = (opportunity.expected_home_goals or Decimal("1.35")) + (
        opportunity.expected_away_goals or Decimal("1.10")
    )
    remaining_fraction = Decimal(max(0, 95 - opportunity.match_minute)) / Decimal("95")
    pressure_multiplier = Decimal("1")
    if pressure_score is not None:
        pressure_multiplier = Decimal("0.80") + pressure_score / Decimal("250")
    remaining_rate = float(expected_total * remaining_fraction * pressure_multiplier)
    if opportunity.selection == "over":
        needed = max(0, floor(opportunity.line) + 1 - current_goals)
        probability_value = 1 - sum(
            exp(-remaining_rate) * remaining_rate**goals / factorial(goals)
            for goals in range(needed)
        )
    elif opportunity.selection == "under":
        allowed = max(-1, maximum_under_total - current_goals)
        probability_value = sum(
            exp(-remaining_rate) * remaining_rate**goals / factorial(goals)
            for goals in range(allowed + 1)
        )
    else:
        return probability
    return Decimal(str(max(0.000001, min(0.999999, probability_value)))).quantize(
        SIX_PLACES, rounding=ROUND_HALF_UP
    )


def evaluate_opportunity(opportunity: SignalOpportunity) -> SignalDecision:
    minimum_quality = opportunity.strategy.min_data_quality * 100
    quality = evaluate_data_quality(opportunity.quality, minimum_score=minimum_quality)
    if opportunity.quote.stopped:
        return _suppressed(opportunity, "odds_stopped", data_quality=quality)
    if not quality.sufficient:
        return _suppressed(opportunity, "insufficient_data_quality", data_quality=quality)

    pressure = None
    pressure_score = None
    if opportunity.strategy.is_live:
        pressure = calculate_live_pressure(
            opportunity.pressure_snapshots, opportunity.pressure_events
        )
        if pressure.home_score is None or pressure.away_score is None:
            return _suppressed(
                opportunity,
                "insufficient_live_pressure",
                data_quality=quality,
                pressure=pressure,
            )
        if opportunity.selection == "home":
            pressure_score = pressure.home_score
        elif opportunity.selection == "away":
            pressure_score = pressure.away_score
        else:
            pressure_score = max(pressure.home_score, pressure.away_score)

    evaluated_probability = _live_probability(opportunity, pressure_score)
    fair = fair_market_probability(opportunity)
    comparison_probability = fair or opportunity.quote.raw_implied_probability
    edge = (evaluated_probability - comparison_probability).quantize(
        SEVEN_PLACES, rounding=ROUND_HALF_UP
    )
    expected_value = (evaluated_probability * opportunity.quote.decimal_odds - 1).quantize(
        SEVEN_PLACES, rounding=ROUND_HALF_UP
    )

    calibration_quality = Decimal("70")
    if opportunity.calibration_error is not None:
        calibration_quality = max(
            Decimal("0"), Decimal("100") * (1 - opportunity.calibration_error)
        )
    stability = Decimal("70")
    if opportunity.previous_odds is not None:
        change = (
            abs(opportunity.quote.decimal_odds - opportunity.previous_odds)
            / opportunity.previous_odds
        )
        stability = max(Decimal("0"), Decimal("100") - change * Decimal("500"))
    market_quality = Decimal("95") if fair is not None else Decimal("70")
    smart = calculate_smart_score(
        SmartScoreInput(
            phase="live" if opportunity.strategy.is_live else "prematch",
            model_probability=evaluated_probability,
            edge=edge,
            data_quality=quality.score,
            live_pressure=pressure_score,
            calibration_quality=calibration_quality,
            stability=stability,
            market_quality=market_quality,
        )
    )
    odds = opportunity.quote.decimal_odds
    rule = opportunity.strategy
    suppress_reason = None
    if evaluated_probability < rule.min_probability:
        suppress_reason = "probability_below_threshold"
    elif edge < rule.min_edge:
        suppress_reason = "edge_below_threshold"
    elif rule.min_odds is not None and odds < rule.min_odds:
        suppress_reason = "odds_below_threshold"
    elif rule.max_odds is not None and odds > rule.max_odds:
        suppress_reason = "odds_above_threshold"
    elif smart.score < rule.min_smart_score:
        suppress_reason = "smart_score_below_threshold"
    elif smart.category not in {
        SignalCategory.ELITE,
        SignalCategory.STRONG,
        SignalCategory.QUALIFIED,
    }:
        suppress_reason = "category_not_qualified"
    if suppress_reason:
        return _suppressed(
            opportunity,
            suppress_reason,
            fair_probability=fair,
            edge=edge,
            expected_value=expected_value,
            data_quality=quality,
            pressure=pressure,
            smart_score=smart,
            evaluated_probability=evaluated_probability,
        )

    reasons = (
        SignalReason(
            code="model_probability",
            label="Probabilidad del modelo",
            numeric_value=evaluated_probability * 100,
            unit="percent",
            sort_order=10,
        ),
        SignalReason(
            code="market_edge",
            label="Ventaja sobre el mercado",
            numeric_value=edge * 100,
            unit="percentage_points",
            sort_order=20,
        ),
        SignalReason(
            code="expected_value",
            label="Valor esperado por unidad",
            numeric_value=expected_value,
            unit="units",
            sort_order=30,
        ),
        SignalReason(
            code="data_quality",
            label="Calidad de datos",
            numeric_value=quality.score,
            unit="score_0_100",
            sort_order=40,
            metadata={"missing": list(quality.missing)},
        ),
        SignalReason(
            code="smart_score",
            label="Smart Score",
            numeric_value=smart.score,
            unit="score_0_100",
            sort_order=50,
            metadata={"category": smart.category.value},
        ),
        SignalReason(
            code="deterministic_summary",
            label="Explicación",
            text_value=(
                f"{opportunity.selection} califica con {smart.score}/100, "
                f"probabilidad {evaluated_probability * 100:.2f}% y "
                f"edge {edge * 100:.2f} pp."
            ),
            sort_order=60,
        ),
    )
    return SignalDecision(
        qualified=True,
        evaluated_probability=evaluated_probability,
        fair_market_probability=fair,
        edge=edge,
        expected_value=expected_value,
        data_quality=quality,
        live_pressure=pressure,
        smart_score=smart,
        fingerprint=_fingerprint(opportunity),
        reasons=reasons,
    )


def materially_changed(
    previous: PreviousSignal | None,
    opportunity: SignalOpportunity,
    decision: SignalDecision,
    *,
    now: datetime,
    odds_change: Decimal = Decimal("0.05"),
    edge_change: Decimal = Decimal("0.02"),
    smart_score_change: Decimal = Decimal("5"),
) -> bool:
    if previous is None:
        return True
    if (now - previous.triggered_at).total_seconds() >= opportunity.strategy.cooldown_seconds:
        return True
    if opportunity.critical_event and opportunity.critical_event != previous.critical_event:
        return True
    if opportunity.line != previous.line:
        return True
    if (
        abs(opportunity.quote.decimal_odds - previous.decimal_odds) / previous.decimal_odds
        >= odds_change
    ):
        return True
    if decision.edge is not None and abs(decision.edge - previous.edge) >= edge_change:
        return True
    return bool(
        decision.smart_score
        and abs(decision.smart_score.score - previous.smart_score) >= smart_score_change
    )
