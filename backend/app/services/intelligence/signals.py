from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Protocol

from app.domain.ingestion import IngestionReport, WorkerName
from app.domain.intelligence import (
    PersistedSignal,
    PreviousSignal,
    SignalDecision,
    SignalOpportunity,
)
from app.signals.engine import evaluate_opportunity, materially_changed


class SignalEngineRepository(Protocol):
    async def list_signal_opportunities(self, *, limit: int) -> tuple[SignalOpportunity, ...]: ...

    async def latest_signal(self, fingerprint: str) -> PreviousSignal | None: ...

    async def persist_signal(
        self,
        opportunity: SignalOpportunity,
        decision: SignalDecision,
        *,
        triggered_at: datetime,
    ) -> PersistedSignal | None: ...


class SignalEngineService:
    def __init__(
        self,
        repository: SignalEngineRepository,
        *,
        target_limit: int = 100,
        material_odds_change: Decimal = Decimal("0.05"),
        material_edge_change: Decimal = Decimal("0.02"),
        material_smart_score_change: Decimal = Decimal("5"),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = repository
        self.target_limit = target_limit
        self.material_odds_change = material_odds_change
        self.material_edge_change = material_edge_change
        self.material_smart_score_change = material_smart_score_change
        self.clock = clock or (lambda: datetime.now(UTC))

    async def run_once(self) -> IngestionReport:
        opportunities = await self.repository.list_signal_opportunities(limit=self.target_limit)
        if not opportunities:
            return IngestionReport(
                worker=WorkerName.SIGNAL,
                skipped_reason="no_enabled_strategy_opportunities",
            )
        generated = 0
        errors: list[str] = []
        for opportunity in opportunities:
            try:
                now = self.clock()
                decision = evaluate_opportunity(opportunity)
                if not decision.qualified or decision.fingerprint is None:
                    continue
                previous = await self.repository.latest_signal(decision.fingerprint)
                if not materially_changed(
                    previous,
                    opportunity,
                    decision,
                    now=now,
                    odds_change=self.material_odds_change,
                    edge_change=self.material_edge_change,
                    smart_score_change=self.material_smart_score_change,
                ):
                    continue
                generated += int(
                    await self.repository.persist_signal(opportunity, decision, triggered_at=now)
                    is not None
                )
            except Exception as error:  # isolate a single fixture/market
                errors.append(
                    f"signal:{opportunity.fixture_id}:{opportunity.market}:{type(error).__name__}"
                )
        return IngestionReport(
            worker=WorkerName.SIGNAL,
            fixtures_seen=len({item.fixture_id for item in opportunities}),
            records_written=generated,
            signals_generated=generated,
            errors=tuple(errors),
        )
