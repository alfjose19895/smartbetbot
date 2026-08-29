from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest

from app.domain.settlement import SettlementStatus, SettlementTarget
from app.services.settlement import SettlementEngine, SettlementService

SIGNAL_ID = UUID("10000000-0000-4000-8000-000000000001")
FIXTURE_ID = UUID("20000000-0000-4000-8000-000000000001")


def _target(
    market: str,
    selection: str,
    *,
    line: str | None = None,
    home: int = 2,
    away: int = 1,
    status: str = "finished",
    next_goal_side: str | None = None,
) -> SettlementTarget:
    return SettlementTarget(
        signal_id=SIGNAL_ID,
        fixture_id=FIXTURE_ID,
        fixture_status=status,
        market=market,
        selection=selection,
        line=Decimal(line) if line else None,
        decimal_odds=Decimal("1.65"),
        home_score=home,
        away_score=away,
        match_minute=60,
        next_goal_side=next_goal_side,
    )


@pytest.mark.parametrize(
    ("target", "expected"),
    (
        (_target("total_goals", "over", line="2.5"), SettlementStatus.WON),
        (_target("total_goals", "under", line="2.5"), SettlementStatus.LOST),
        (_target("total_goals", "over", line="3"), SettlementStatus.PUSH),
        (_target("both_teams_to_score", "yes"), SettlementStatus.WON),
        (_target("both_teams_to_score", "no"), SettlementStatus.LOST),
        (_target("match_winner", "home"), SettlementStatus.WON),
        (_target("match_winner", "draw"), SettlementStatus.LOST),
        (_target("double_chance", "1x"), SettlementStatus.WON),
        (_target("double_chance", "x2"), SettlementStatus.LOST),
        (
            _target("next_goal", "away", next_goal_side="away"),
            SettlementStatus.WON,
        ),
        (_target("next_goal", "away"), SettlementStatus.VOID),
        (_target("unsupported", "yes"), SettlementStatus.VOID),
        (_target("match_winner", "home", status="cancelled"), SettlementStatus.VOID),
        (_target("match_winner", "home", status="live"), SettlementStatus.PENDING),
    ),
)
def test_settlement_market_rules(target: SettlementTarget, expected: SettlementStatus) -> None:
    result = SettlementEngine().settle(target)

    assert result.status == expected
    expected_profit = {
        SettlementStatus.WON: Decimal("0.6500"),
        SettlementStatus.LOST: Decimal("-1.0000"),
        SettlementStatus.PUSH: Decimal("0.0000"),
        SettlementStatus.VOID: Decimal("0.0000"),
        SettlementStatus.PENDING: Decimal("0.0000"),
    }[expected]
    assert result.profit_loss_units == expected_profit


class _Repository:
    def __init__(self, targets: tuple[SettlementTarget, ...]) -> None:
        self.targets = targets
        self.decisions: tuple[object, ...] = ()

    async def list_unsettled(self, *, limit: int) -> tuple[SettlementTarget, ...]:
        assert limit == 20
        return self.targets

    async def persist_decisions(
        self, decisions: tuple[object, ...], *, settled_at: datetime
    ) -> int:
        assert settled_at == datetime(2026, 8, 25, tzinfo=UTC)
        self.decisions = decisions
        return len(decisions)


@pytest.mark.anyio
async def test_settlement_service_persists_only_final_idempotent_decisions() -> None:
    repository = _Repository(
        (
            _target("match_winner", "home"),
            _target("match_winner", "home", status="live"),
        )
    )
    service = SettlementService(
        repository,  # type: ignore[arg-type]
        target_limit=20,
        clock=lambda: datetime(2026, 8, 25, tzinfo=UTC),
    )

    report = await service.run_once()

    assert report.fixtures_seen == 1
    assert report.records_written == 1
    assert len(repository.decisions) == 1
