from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.domain.intelligence import SignalCategory, SmartScoreInput, SmartScoreResult


def _clamp(value: Decimal) -> Decimal:
    return max(Decimal("0"), min(Decimal("100"), value))


def _category(score: Decimal) -> SignalCategory:
    if score >= 90:
        return SignalCategory.ELITE
    if score >= 80:
        return SignalCategory.STRONG
    if score >= 75:
        return SignalCategory.QUALIFIED
    if score >= 65:
        return SignalCategory.WATCH
    return SignalCategory.NO_BET


def calculate_smart_score(value: SmartScoreInput) -> SmartScoreResult:
    components = {
        "model_confidence": _clamp(value.model_probability * 100),
        "edge": _clamp(value.edge / Decimal("0.15") * 100),
        "data_quality": value.data_quality,
        "calibration": value.calibration_quality,
        "stability": value.stability,
        "market_quality": value.market_quality,
    }
    if value.phase == "live":
        components["live_pressure"] = value.live_pressure or Decimal("0")
        weights = {
            "model_confidence": Decimal("0.20"),
            "edge": Decimal("0.20"),
            "data_quality": Decimal("0.20"),
            "live_pressure": Decimal("0.15"),
            "calibration": Decimal("0.10"),
            "stability": Decimal("0.05"),
            "market_quality": Decimal("0.10"),
        }
    else:
        weights = {
            "model_confidence": Decimal("0.25"),
            "edge": Decimal("0.25"),
            "data_quality": Decimal("0.20"),
            "calibration": Decimal("0.15"),
            "stability": Decimal("0.05"),
            "market_quality": Decimal("0.10"),
        }
    score = sum(components[name] * weight for name, weight in weights.items()).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return SmartScoreResult(score=score, category=_category(score), components=components)
