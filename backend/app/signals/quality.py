from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.domain.intelligence import DataQualityInput, DataQualityResult

PREMATCH_WEIGHTS = {
    "odds": 30,
    "historical_features": 45,
    "lineups": 15,
    "standings": 10,
}

LIVE_WEIGHTS = {
    "minute": 7,
    "score": 7,
    "events": 8,
    "statistics": 8,
    "shots": 8,
    "shots_on_target": 8,
    "possession": 6,
    "corners": 6,
    "cards": 6,
    "odds": 15,
    "historical_features": 15,
    "lineups": 6,
}


def evaluate_data_quality(
    evidence: DataQualityInput, *, minimum_score: Decimal = Decimal("70")
) -> DataQualityResult:
    weights = PREMATCH_WEIGHTS if evidence.phase == "prematch" else LIVE_WEIGHTS
    available = tuple(name for name in weights if bool(getattr(evidence, name)))
    missing = tuple(name for name in weights if not bool(getattr(evidence, name)))
    score = Decimal(sum(weights[name] for name in available)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    required = {"odds", "historical_features"}
    if evidence.phase == "live":
        required.update({"minute", "score"})
    sufficient = score >= minimum_score and all(bool(getattr(evidence, name)) for name in required)
    return DataQualityResult(
        score=score,
        sufficient=sufficient,
        available=available,
        missing=missing,
    )
