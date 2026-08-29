from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SettlementModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SettlementStatus(StrEnum):
    WON = "won"
    LOST = "lost"
    VOID = "void"
    PUSH = "push"
    PENDING = "pending"


class SettlementTarget(SettlementModel):
    signal_id: UUID
    fixture_id: UUID
    fixture_status: str
    market: str
    selection: str
    line: Decimal | None = None
    decimal_odds: Decimal = Field(gt=1)
    home_score: int | None = Field(default=None, ge=0)
    away_score: int | None = Field(default=None, ge=0)
    match_minute: int | None = Field(default=None, ge=0, le=150)
    next_goal_side: str | None = None


class SettlementDecision(SettlementModel):
    signal_id: UUID
    status: SettlementStatus
    home_score: int | None = None
    away_score: int | None = None
    stake_units: Decimal = Decimal("1")
    profit_loss_units: Decimal
    reason: str
