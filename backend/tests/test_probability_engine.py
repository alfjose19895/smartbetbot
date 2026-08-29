from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from app.domain.intelligence import HistoricalFixture, ModelVersionRecord, PredictionTarget
from app.ml.evaluation import chronological_split, evaluate_binary
from app.ml.features import BaselineFeatureBuilder
from app.ml.models import PoissonEloModel
from app.services.intelligence import ProbabilityEngineService

LEAGUE_ID = UUID("10000000-0000-4000-8000-000000000001")
HOME_ID = UUID("20000000-0000-4000-8000-000000000001")
AWAY_ID = UUID("30000000-0000-4000-8000-000000000001")
THIRD_ID = UUID("40000000-0000-4000-8000-000000000001")
TARGET_ID = UUID("50000000-0000-4000-8000-000000000001")
MODEL_ID = UUID("60000000-0000-4000-8000-000000000001")


def _match(
    index: int,
    kickoff: datetime,
    home: UUID,
    away: UUID,
    home_score: int,
    away_score: int,
) -> HistoricalFixture:
    return HistoricalFixture(
        fixture_id=UUID(f"00000000-0000-4000-8000-{index:012d}"),
        canonical_league_id=LEAGUE_ID,
        canonical_home_team_id=home,
        canonical_away_team_id=away,
        kickoff_at=kickoff,
        home_score=home_score,
        away_score=away_score,
    )


def _dataset() -> tuple[tuple[HistoricalFixture, ...], PredictionTarget]:
    start = datetime(2026, 1, 1, tzinfo=UTC)
    history = (
        _match(1, start, HOME_ID, AWAY_ID, 2, 0),
        _match(2, start + timedelta(days=7), THIRD_ID, HOME_ID, 1, 1),
        _match(3, start + timedelta(days=14), AWAY_ID, THIRD_ID, 2, 1),
        _match(4, start + timedelta(days=21), HOME_ID, THIRD_ID, 3, 1),
        _match(5, start + timedelta(days=28), THIRD_ID, AWAY_ID, 0, 1),
        # This future result must never enter target features.
        _match(6, start + timedelta(days=50), HOME_ID, AWAY_ID, 9, 9),
    )
    target = PredictionTarget(
        fixture_id=TARGET_ID,
        canonical_league_id=LEAGUE_ID,
        canonical_home_team_id=HOME_ID,
        canonical_away_team_id=AWAY_ID,
        kickoff_at=start + timedelta(days=35),
        status="scheduled",
    )
    return history, target


def test_feature_builder_is_leakage_safe_and_uses_required_feature_families() -> None:
    history, target = _dataset()
    features = BaselineFeatureBuilder().build(
        target, history, home_standing_rank=2, away_standing_rank=8
    )

    assert features.history_matches == 5
    assert features.feature_cutoff_at == history[4].kickoff_at
    assert features.values["home_standing_rank"] == 2
    assert features.values["home_elo"] is not None
    assert features.values["home_rest_days"] == 14.0
    assert features.values["home_btts_rate"] == pytest.approx(2 / 3)
    assert features.values["h2h_matches"] == 1


def test_poisson_model_returns_coherent_canonical_markets_and_stable_fingerprints() -> None:
    history, target = _dataset()
    features = BaselineFeatureBuilder().build(target, history)
    model = PoissonEloModel()

    first = model.predict(features)
    second = model.predict(features)
    by_key = {(item.market, item.selection, item.line): item for item in first}

    match_winner_total = sum(
        by_key[("match_winner", selection, None)].probability
        for selection in ("home", "draw", "away")
    )
    assert match_winner_total == pytest.approx(Decimal("1"), abs=Decimal("0.000002"))
    assert by_key[("total_goals", "over", Decimal("1.500"))].probability > 0
    assert by_key[("both_teams_to_score", "yes", None)].probability > 0
    assert by_key[("double_chance", "1x", None)].probability == pytest.approx(
        by_key[("match_winner", "home", None)].probability
        + by_key[("match_winner", "draw", None)].probability,
        abs=Decimal("0.000002"),
    )
    assert [item.fingerprint for item in first] == [item.fingerprint for item in second]


def test_chronological_evaluation_reports_all_required_metrics() -> None:
    train, validation, test = chronological_split(tuple(range(20)))
    metrics = evaluate_binary((0.9, 0.8, 0.2, 0.1), (1, 1, 0, 0))

    assert train == tuple(range(14))
    assert validation == tuple(range(14, 17))
    assert test == tuple(range(17, 20))
    assert metrics.observations == 4
    assert metrics.brier_score == pytest.approx(0.025)
    assert metrics.log_loss is not None
    assert metrics.calibration_error is not None
    assert metrics.accuracy == 1
    assert metrics.roc_auc == 1
    assert metrics.precision == 1
    assert metrics.recall == 1


class _ProbabilityRepository:
    def __init__(self, history: tuple[HistoricalFixture, ...], target: PredictionTarget) -> None:
        self.history = history[:-1]
        self.target = target
        self.persisted = 0
        self.groups: object = None

    async def sync_canonical_catalog(self, groups: object) -> int:
        self.groups = groups
        return 6

    async def load_history(self) -> tuple[HistoricalFixture, ...]:
        return self.history

    async def list_prediction_targets(self, **_values: object) -> tuple[PredictionTarget, ...]:
        return (self.target,)

    async def load_standing_ranks(self) -> dict[tuple[object, object], int]:
        return {(LEAGUE_ID, HOME_ID): 1, (LEAGUE_ID, AWAY_ID): 5}

    async def activate_model_version(self, **_values: object) -> ModelVersionRecord:
        return ModelVersionRecord(
            id=MODEL_ID,
            name="prematch_poisson_elo",
            version="1.0.0",
            calibration_error=0.1,
        )

    async def persist_predictions(self, _model: object, estimates: tuple[object, ...]) -> int:
        self.persisted += len(estimates)
        return len(estimates)


@pytest.mark.anyio
async def test_probability_service_links_providers_versions_and_persists_predictions() -> None:
    history, target = _dataset()
    repository = _ProbabilityRepository(history, target)
    service = ProbabilityEngineService(
        repository,  # type: ignore[arg-type]
        target_provider="football_data",
        league_link_groups=((("api_football", "39"), ("football_data", "2021")),),
        clock=lambda: datetime(2026, 1, 30, tzinfo=UTC),
    )

    report = await service.run_once()

    assert report.worker.value == "probability"
    assert report.fixtures_seen == 1
    assert report.records_written == 13
    assert repository.persisted == 13
    assert repository.groups is not None
