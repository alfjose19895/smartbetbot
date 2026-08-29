from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class BacktestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class BacktestFilters(BacktestModel):
    date_from: AwareDatetime
    date_to: AwareDatetime
    market: str | None = None
    league_id: UUID | None = None
    strategy_id: UUID | None = None
    signal_type: Literal["live", "prematch"] | None = None
    min_probability: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    min_edge: Decimal = Field(default=Decimal("-1"), ge=-1, le=1)
    min_smart_score: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    min_odds: Decimal | None = Field(default=None, gt=1)
    max_odds: Decimal | None = Field(default=None, gt=1)

    @model_validator(mode="after")
    def validate_ranges(self) -> BacktestFilters:
        if self.date_from >= self.date_to:
            raise ValueError("date_from must be before date_to")
        if (
            self.min_odds is not None
            and self.max_odds is not None
            and self.min_odds > self.max_odds
        ):
            raise ValueError("min_odds cannot exceed max_odds")
        return self


class BacktestBet(BacktestModel):
    signal_id: UUID
    settled_at: AwareDatetime
    result_status: Literal["won", "lost", "void", "push"]
    decimal_odds: Decimal = Field(gt=1)


class BacktestMetrics(BacktestModel):
    total_bets: int = Field(ge=0)
    won: int = Field(ge=0)
    lost: int = Field(ge=0)
    void: int = Field(ge=0)
    push: int = Field(ge=0)
    win_rate: Decimal | None = None
    average_odds: Decimal | None = None
    profit_units: Decimal
    loss_units: Decimal
    net_units: Decimal
    roi: Decimal | None = None
    yield_rate: Decimal | None = None
    maximum_drawdown: Decimal
    longest_winning_streak: int = Field(ge=0)
    longest_losing_streak: int = Field(ge=0)


class BacktestResult(BacktestModel):
    filters: BacktestFilters
    metrics: BacktestMetrics
    generated_at: datetime
    methodology: str
