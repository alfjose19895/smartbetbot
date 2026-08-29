from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from app.domain.backtesting import (
    BacktestBet,
    BacktestFilters,
    BacktestMetrics,
    BacktestResult,
)

FOUR_PLACES = Decimal("0.0001")


class BacktestRepositoryProtocol(Protocol):
    async def list_bets(self, filters: BacktestFilters) -> tuple[BacktestBet, ...]: ...


def calculate_backtest_metrics(bets: tuple[BacktestBet, ...]) -> BacktestMetrics:
    ordered = tuple(sorted(bets, key=lambda item: (item.settled_at, str(item.signal_id))))
    won = sum(item.result_status == "won" for item in ordered)
    lost = sum(item.result_status == "lost" for item in ordered)
    void = sum(item.result_status == "void" for item in ordered)
    push = sum(item.result_status == "push" for item in ordered)
    resolved = won + lost
    risked = won + lost + push
    outcomes = tuple(
        item.decimal_odds - 1
        if item.result_status == "won"
        else Decimal("-1")
        if item.result_status == "lost"
        else Decimal("0")
        for item in ordered
    )
    profit = sum((value for value in outcomes if value > 0), Decimal("0"))
    loss = -sum((value for value in outcomes if value < 0), Decimal("0"))
    net = sum(outcomes, Decimal("0"))
    cumulative = Decimal("0")
    peak = Decimal("0")
    maximum_drawdown = Decimal("0")
    for value in outcomes:
        cumulative += value
        peak = max(peak, cumulative)
        maximum_drawdown = max(maximum_drawdown, peak - cumulative)

    longest_winning = longest_losing = current_winning = current_losing = 0
    for item in ordered:
        if item.result_status == "won":
            current_winning += 1
            current_losing = 0
        elif item.result_status == "lost":
            current_losing += 1
            current_winning = 0
        else:
            continue
        longest_winning = max(longest_winning, current_winning)
        longest_losing = max(longest_losing, current_losing)

    def ratio(numerator: Decimal, denominator: int) -> Decimal | None:
        return (
            (numerator / denominator).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
            if denominator
            else None
        )

    return BacktestMetrics(
        total_bets=len(ordered),
        won=won,
        lost=lost,
        void=void,
        push=push,
        win_rate=ratio(Decimal(won), resolved),
        average_odds=(
            sum((item.decimal_odds for item in ordered), Decimal("0")) / len(ordered)
        ).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
        if ordered
        else None,
        profit_units=profit.quantize(FOUR_PLACES),
        loss_units=loss.quantize(FOUR_PLACES),
        net_units=net.quantize(FOUR_PLACES),
        roi=ratio(net, risked),
        yield_rate=ratio(net, len(ordered)),
        maximum_drawdown=maximum_drawdown.quantize(FOUR_PLACES),
        longest_winning_streak=longest_winning,
        longest_losing_streak=longest_losing,
    )


class BacktestEngine:
    def __init__(
        self,
        repository: BacktestRepositoryProtocol,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(UTC))

    async def run(self, filters: BacktestFilters) -> BacktestResult:
        bets = await self.repository.list_bets(filters)
        return BacktestResult(
            filters=filters,
            metrics=calculate_backtest_metrics(bets),
            generated_at=self.clock(),
            methodology=(
                "Retrospective filter over immutable settled SmartBetBot signals; "
                "fixed 1-unit statistical stake, no automatic betting."
            ),
        )
