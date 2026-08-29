from __future__ import annotations

from app.domain.intelligence import EvaluationMetrics, HistoricalFixture, PredictionTarget
from app.ml.evaluation import chronological_split, evaluate_binary
from app.ml.features import BaselineFeatureBuilder
from app.ml.models import PoissonEloModel


def evaluate_baseline_walk_forward(
    history: tuple[HistoricalFixture, ...],
    *,
    minimum_prior_matches: int = 40,
) -> EvaluationMetrics:
    """Walk-forward test of the primary Over 1.5 market without future-data leakage."""
    ordered = tuple(sorted(history, key=lambda item: (item.kickoff_at, str(item.fixture_id))))
    _, _, test = chronological_split(ordered)
    if not test:
        return EvaluationMetrics(observations=0)
    builder = BaselineFeatureBuilder()
    model = PoissonEloModel()
    probabilities: list[float] = []
    outcomes: list[int] = []
    first_test_index = len(ordered) - len(test)
    for offset, match in enumerate(test, start=first_test_index):
        prior = ordered[:offset]
        if len(prior) < minimum_prior_matches:
            continue
        target = PredictionTarget(
            fixture_id=match.fixture_id,
            canonical_league_id=match.canonical_league_id,
            canonical_home_team_id=match.canonical_home_team_id,
            canonical_away_team_id=match.canonical_away_team_id,
            kickoff_at=match.kickoff_at,
            status="finished",
        )
        features = builder.build(target, prior)
        prediction = next(
            item
            for item in model.predict(features)
            if item.market == "total_goals"
            and item.selection == "over"
            and str(item.line) == "1.500"
        )
        probabilities.append(float(prediction.calibrated_probability))
        outcomes.append(int(match.home_score + match.away_score > 1))
    return evaluate_binary(tuple(probabilities), tuple(outcomes))
