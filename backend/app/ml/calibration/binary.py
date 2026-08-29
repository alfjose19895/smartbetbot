from __future__ import annotations

from dataclasses import dataclass
from math import exp, log


def _clip(value: float) -> float:
    return min(0.999999, max(0.000001, value))


@dataclass(frozen=True, slots=True)
class LogisticCalibrator:
    """Small dependency-free Platt-style calibrator."""

    slope: float = 1.0
    intercept: float = 0.0

    def transform(self, probability: float) -> float:
        probability = _clip(probability)
        logit = log(probability / (1 - probability))
        return _clip(1 / (1 + exp(-(self.slope * logit + self.intercept))))
