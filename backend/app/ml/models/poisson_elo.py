from __future__ import annotations

import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal
from math import exp, factorial

from app.domain.intelligence import FeatureVector, ProbabilityEstimate
from app.ml.calibration import LogisticCalibrator

PROBABILITY_STEP = Decimal("0.000001")


def _probability(value: float) -> Decimal:
    return Decimal(str(min(1.0, max(0.0, value)))).quantize(
        PROBABILITY_STEP, rounding=ROUND_HALF_UP
    )


def _poisson_mass(rate: float, goals: int) -> float:
    return exp(-rate) * rate**goals / factorial(goals)


class PoissonEloModel:
    name = "prematch_poisson_elo"
    version = "1.0.0"
    model_type = "statistical"

    def __init__(self, calibrator: LogisticCalibrator | None = None) -> None:
        self.calibrator = calibrator or LogisticCalibrator()

    def _rates(self, features: FeatureVector) -> tuple[float, float]:
        values = features.values
        league_home = float(values["league_home_goals_avg"] or 1.35)
        league_away = float(values["league_away_goals_avg"] or 1.10)
        home_for = float(values["home_goals_for_home"] or league_home)
        home_against = float(values["home_goals_against_home"] or league_away)
        away_for = float(values["away_goals_for_away"] or league_away)
        away_against = float(values["away_goals_against_away"] or league_home)
        home_recent_for = float(values["home_recent_goals_for"] or home_for)
        home_recent_against = float(values["home_recent_goals_against"] or home_against)
        away_recent_for = float(values["away_recent_goals_for"] or away_for)
        away_recent_against = float(values["away_recent_goals_against"] or away_against)

        # Venue form dominates, recent form adjusts it, and sparse samples shrink to league mean.
        home_sample = min(1.0, features.home_history_matches / 8)
        away_sample = min(1.0, features.away_history_matches / 8)
        home_attack = (home_for / max(league_home, 0.2)) * 0.65 + (
            home_recent_for / max(league_home, 0.2)
        ) * 0.35
        away_defence = (away_against / max(league_home, 0.2)) * 0.65 + (
            away_recent_against / max(league_home, 0.2)
        ) * 0.35
        away_attack = (away_for / max(league_away, 0.2)) * 0.65 + (
            away_recent_for / max(league_away, 0.2)
        ) * 0.35
        home_defence = (home_against / max(league_away, 0.2)) * 0.65 + (
            home_recent_against / max(league_away, 0.2)
        ) * 0.35
        raw_home = league_home * home_attack * away_defence
        raw_away = league_away * away_attack * home_defence
        home_rate = league_home * (1 - min(home_sample, away_sample)) + raw_home * min(
            home_sample, away_sample
        )
        away_rate = league_away * (1 - min(home_sample, away_sample)) + raw_away * min(
            home_sample, away_sample
        )

        # Elo changes the goal balance but not the expected total excessively.
        elo_difference = float(values["home_elo"] or 1500) - float(values["away_elo"] or 1500) + 60
        adjustment = max(-0.22, min(0.22, elo_difference / 1600))
        home_rate *= 1 + adjustment
        away_rate *= 1 - adjustment

        # H2H is deliberately low weight and cannot overpower league/team form.
        h2h_matches = int(values["h2h_matches"] or 0)
        if h2h_matches:
            h2h_home_points = float(values["h2h_home_points_per_match"] or 1)
            h2h_adjustment = max(-0.04, min(0.04, (h2h_home_points - 1.5) / 20))
            home_rate *= 1 + h2h_adjustment
            away_rate *= 1 - h2h_adjustment
        return max(0.15, min(4.5, home_rate)), max(0.15, min(4.5, away_rate))

    def predict(self, features: FeatureVector) -> tuple[ProbabilityEstimate, ...]:
        home_rate, away_rate = self._rates(features)
        grid = {
            (home, away): _poisson_mass(home_rate, home) * _poisson_mass(away_rate, away)
            for home in range(11)
            for away in range(11)
        }
        total_mass = sum(grid.values())
        grid = {score: mass / total_mass for score, mass in grid.items()}

        home_win = sum(mass for (home, away), mass in grid.items() if home > away)
        draw = sum(mass for (home, away), mass in grid.items() if home == away)
        away_win = sum(mass for (home, away), mass in grid.items() if home < away)
        probabilities: list[tuple[str, str, Decimal | None, float]] = [
            ("match_winner", "home", None, home_win),
            ("match_winner", "draw", None, draw),
            ("match_winner", "away", None, away_win),
            ("double_chance", "1x", None, home_win + draw),
            ("double_chance", "x2", None, draw + away_win),
        ]
        for line in (Decimal("0.500"), Decimal("1.500"), Decimal("2.500")):
            threshold = int(line)
            over = sum(mass for (home, away), mass in grid.items() if home + away > threshold)
            probabilities.extend(
                (
                    ("total_goals", "over", line, over),
                    ("total_goals", "under", line, 1 - over),
                )
            )
        btts_yes = sum(mass for (home, away), mass in grid.items() if home > 0 and away > 0)
        probabilities.extend(
            (
                ("both_teams_to_score", "yes", None, btts_yes),
                ("both_teams_to_score", "no", None, 1 - btts_yes),
            )
        )

        feature_payload: dict[str, object] = {
            **features.values,
            "history_matches": features.history_matches,
            "home_history_matches": features.home_history_matches,
            "away_history_matches": features.away_history_matches,
            "expected_home_goals": round(home_rate, 6),
            "expected_away_goals": round(away_rate, 6),
        }
        estimates: list[ProbabilityEstimate] = []
        for market, selection, line, raw_probability in probabilities:
            identity = {
                "version": 1,
                "fixture_id": str(features.fixture_id),
                "model": f"{self.name}:{self.version}",
                "market": market,
                "selection": selection,
                "line": str(line) if line is not None else None,
                "feature_cutoff_at": features.feature_cutoff_at.isoformat(),
                "features": feature_payload,
            }
            fingerprint = hashlib.sha256(
                json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            estimates.append(
                ProbabilityEstimate(
                    fixture_id=features.fixture_id,
                    market=market,
                    selection=selection,
                    line=line,
                    probability=_probability(raw_probability),
                    calibrated_probability=_probability(self.calibrator.transform(raw_probability)),
                    feature_cutoff_at=features.feature_cutoff_at,
                    features=feature_payload,
                    fingerprint=fingerprint,
                )
            )
        return tuple(estimates)
