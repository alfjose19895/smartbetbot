from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from app.domain.ingestion import IngestionReport, WorkerName
from app.domain.settlement import (
    SettlementDecision,
    SettlementStatus,
    SettlementTarget,
)


def _profit(status: SettlementStatus, odds: Decimal) -> Decimal:
    if status == SettlementStatus.WON:
        return (odds - 1).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    if status == SettlementStatus.LOST:
        return Decimal("-1.0000")
    return Decimal("0.0000")


def _decision(
    target: SettlementTarget, status: SettlementStatus, reason: str
) -> SettlementDecision:
    return SettlementDecision(
        signal_id=target.signal_id,
        status=status,
        home_score=target.home_score,
        away_score=target.away_score,
        profit_loss_units=_profit(status, target.decimal_odds),
        reason=reason,
    )


class SettlementEngine:
    def settle(self, target: SettlementTarget) -> SettlementDecision:
        if target.fixture_status in {"cancelled", "abandoned"}:
            return _decision(target, SettlementStatus.VOID, "fixture_not_completed")
        if target.fixture_status != "finished":
            return _decision(target, SettlementStatus.PENDING, "fixture_not_final")
        if target.home_score is None or target.away_score is None:
            return _decision(target, SettlementStatus.PENDING, "final_score_missing")

        home = target.home_score
        away = target.away_score
        total = Decimal(home + away)
        market = target.market
        selection = target.selection.lower()
        status: SettlementStatus
        reason: str
        if market == "total_goals" and target.line is not None:
            if total == target.line:
                status, reason = SettlementStatus.PUSH, "total_equals_line"
            elif selection == "over":
                status = SettlementStatus.WON if total > target.line else SettlementStatus.LOST
                reason = (
                    "total_over_line" if status == SettlementStatus.WON else "total_not_over_line"
                )
            elif selection == "under":
                status = SettlementStatus.WON if total < target.line else SettlementStatus.LOST
                reason = (
                    "total_under_line" if status == SettlementStatus.WON else "total_not_under_line"
                )
            else:
                status, reason = SettlementStatus.VOID, "unsupported_total_selection"
        elif market == "both_teams_to_score":
            both_scored = home > 0 and away > 0
            if selection == "yes":
                status = SettlementStatus.WON if both_scored else SettlementStatus.LOST
            elif selection == "no":
                status = SettlementStatus.WON if not both_scored else SettlementStatus.LOST
            else:
                status = SettlementStatus.VOID
            reason = (
                "btts_evaluated" if selection in {"yes", "no"} else "unsupported_btts_selection"
            )
        elif market == "match_winner":
            outcome = "home" if home > away else "away" if away > home else "draw"
            status = SettlementStatus.WON if selection == outcome else SettlementStatus.LOST
            reason = f"match_winner_{outcome}"
        elif market == "double_chance":
            won = (selection == "1x" and home >= away) or (selection == "x2" and away >= home)
            if selection not in {"1x", "x2"}:
                status, reason = SettlementStatus.VOID, "unsupported_double_chance_selection"
            else:
                status = SettlementStatus.WON if won else SettlementStatus.LOST
                reason = "double_chance_evaluated"
        elif market == "next_goal":
            if target.next_goal_side is None:
                status, reason = SettlementStatus.VOID, "next_goal_evidence_unavailable"
            else:
                status = (
                    SettlementStatus.WON
                    if selection == target.next_goal_side
                    else SettlementStatus.LOST
                )
                reason = f"next_goal_{target.next_goal_side}"
        else:
            status, reason = SettlementStatus.VOID, "unsupported_market"
        return _decision(target, status, reason)


class SettlementRepositoryProtocol(Protocol):
    async def list_unsettled(self, *, limit: int) -> tuple[SettlementTarget, ...]: ...

    async def persist_decisions(
        self, decisions: tuple[SettlementDecision, ...], *, settled_at: datetime
    ) -> int: ...


class SettlementService:
    def __init__(
        self,
        repository: SettlementRepositoryProtocol,
        *,
        target_limit: int = 500,
        clock: Callable[[], datetime] | None = None,
        engine: SettlementEngine | None = None,
    ) -> None:
        self.repository = repository
        self.target_limit = target_limit
        self.clock = clock or (lambda: datetime.now(UTC))
        self.engine = engine or SettlementEngine()

    async def run_once(self) -> IngestionReport:
        targets = await self.repository.list_unsettled(limit=self.target_limit)
        if not targets:
            return IngestionReport(
                worker=WorkerName.SETTLEMENT,
                skipped_reason="no_unsettled_terminal_signals",
            )
        decisions = tuple(self.engine.settle(target) for target in targets)
        final = tuple(item for item in decisions if item.status != SettlementStatus.PENDING)
        written = await self.repository.persist_decisions(final, settled_at=self.clock())
        return IngestionReport(
            worker=WorkerName.SETTLEMENT,
            fixtures_seen=len({item.fixture_id for item in targets}),
            records_written=written,
        )
