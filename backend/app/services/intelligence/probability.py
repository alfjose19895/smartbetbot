from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol

from app.domain.ingestion import IngestionReport, WorkerName
from app.domain.intelligence import (
    EvaluationMetrics,
    HistoricalFixture,
    ModelVersionRecord,
    PredictionTarget,
    ProbabilityEstimate,
)
from app.ml.features import BaselineFeatureBuilder
from app.ml.models import PoissonEloModel
from app.ml.training import evaluate_baseline_walk_forward


class ProbabilityRepository(Protocol):
    async def sync_canonical_catalog(
        self, groups: tuple[tuple[tuple[str, str], ...], ...]
    ) -> int: ...

    async def load_history(self) -> tuple[HistoricalFixture, ...]: ...

    async def list_prediction_targets(
        self,
        *,
        provider: str,
        now: datetime,
        horizon_days: int,
        limit: int,
    ) -> tuple[PredictionTarget, ...]: ...

    async def load_standing_ranks(self) -> dict[tuple[object, object], int]: ...

    async def activate_model_version(
        self,
        *,
        name: str,
        version: str,
        model_type: str,
        training_cutoff: datetime,
        feature_schema: dict[str, object],
        hyperparameters: dict[str, object],
        metrics: EvaluationMetrics,
    ) -> ModelVersionRecord: ...

    async def persist_predictions(
        self, model_version_id: object, estimates: tuple[ProbabilityEstimate, ...]
    ) -> int: ...


class ProbabilityEngineService:
    def __init__(
        self,
        repository: ProbabilityRepository,
        *,
        target_provider: str,
        league_link_groups: tuple[tuple[tuple[str, str], ...], ...],
        horizon_days: int = 14,
        target_limit: int = 200,
        clock: Callable[[], datetime] | None = None,
        feature_builder: BaselineFeatureBuilder | None = None,
        model: PoissonEloModel | None = None,
    ) -> None:
        self.repository = repository
        self.target_provider = target_provider
        self.league_link_groups = league_link_groups
        self.horizon_days = horizon_days
        self.target_limit = target_limit
        self.clock = clock or (lambda: datetime.now(UTC))
        self.feature_builder = feature_builder or BaselineFeatureBuilder()
        self.model = model or PoissonEloModel()

    async def run_once(self) -> IngestionReport:
        now = self.clock()
        if not self.league_link_groups:
            return IngestionReport(
                worker=WorkerName.PROBABILITY,
                skipped_reason="no_canonical_league_links",
            )
        await self.repository.sync_canonical_catalog(self.league_link_groups)
        history = await self.repository.load_history()
        targets = await self.repository.list_prediction_targets(
            provider=self.target_provider,
            now=now,
            horizon_days=self.horizon_days,
            limit=self.target_limit,
        )
        if not history:
            return IngestionReport(
                worker=WorkerName.PROBABILITY,
                fixtures_seen=len(targets),
                skipped_reason="no_finished_history",
            )
        metrics = evaluate_baseline_walk_forward(history)
        training_cutoff = max(match.kickoff_at for match in history)
        model_version = await self.repository.activate_model_version(
            name=self.model.name,
            version=self.model.version,
            model_type=self.model.model_type,
            training_cutoff=training_cutoff,
            feature_schema={
                "version": 1,
                "leakage_rule": "fixture.kickoff_at < target.kickoff_at",
                "families": [
                    "poisson",
                    "elo",
                    "recent_form",
                    "home_away",
                    "goals_for_against",
                    "league_averages",
                    "btts_over_clean_sheets",
                    "standings",
                    "rest_days",
                    "h2h_low_weight",
                ],
            },
            hyperparameters={
                "elo_k": 20,
                "elo_home_advantage": 60,
                "recent_matches": 5,
                "h2h_matches": 5,
                "poisson_max_goals": 10,
            },
            metrics=metrics,
        )
        if not targets:
            return IngestionReport(
                worker=WorkerName.PROBABILITY,
                skipped_reason="no_upcoming_targets",
            )
        ranks = await self.repository.load_standing_ranks()
        estimates: list[ProbabilityEstimate] = []
        errors: list[str] = []
        for target in targets:
            try:
                features = self.feature_builder.build(
                    target,
                    history,
                    home_standing_rank=ranks.get(
                        (target.canonical_league_id, target.canonical_home_team_id)
                    ),
                    away_standing_rank=ranks.get(
                        (target.canonical_league_id, target.canonical_away_team_id)
                    ),
                )
                estimates.extend(self.model.predict(features))
            except Exception as error:  # isolate one malformed target
                errors.append(f"prediction:{target.fixture_id}:{type(error).__name__}")
        inserted = await self.repository.persist_predictions(model_version.id, tuple(estimates))
        return IngestionReport(
            worker=WorkerName.PROBABILITY,
            fixtures_seen=len(targets),
            fixtures_written=len({item.fixture_id for item in estimates}),
            records_written=inserted,
            errors=tuple(errors),
        )
