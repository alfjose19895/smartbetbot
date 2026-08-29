from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.v1.pagination import PaginationParams, get_pagination
from app.api.v1.schemas.common import ERROR_RESPONSES, Pagination
from app.api.v1.schemas.performance import (
    PerformanceGroup,
    PerformanceGroupsResponse,
    PerformanceMetrics,
    PerformanceResponse,
    TrackRecordResponse,
)
from app.core.constants import RESPONSIBLE_USE_NOTICE
from app.core.database import get_connection
from app.core.security import get_current_user
from app.repositories.signals import SignalRepository

router = APIRouter(
    tags=["performance"],
    dependencies=[Depends(get_current_user)],
    responses=ERROR_RESPONSES,
)


def _group(row: dict[str, object]) -> PerformanceGroup:
    values = dict(row)
    key = str(values.pop("key"))
    label = str(values.pop("label"))
    return PerformanceGroup(key=key, label=label, metrics=PerformanceMetrics.model_validate(values))


@router.get("/performance", response_model=PerformanceResponse, operation_id="get_performance")
async def get_performance(
    connection: Annotated[AsyncConnection, Depends(get_connection)],
    days: Annotated[int | None, Query(ge=1, le=3650)] = None,
    period: Annotated[Literal["today", "7d", "30d", "90d", "all"] | None, Query()] = None,
    signal_type: Annotated[Literal["live", "prematch"] | None, Query()] = None,
    league_id: Annotated[UUID | None, Query()] = None,
    market: Annotated[str | None, Query(max_length=80, pattern=r"^[a-z0-9_]+$")] = None,
    strategy_id: Annotated[UUID | None, Query()] = None,
) -> PerformanceResponse:
    now = datetime.now(UTC)
    since = datetime.now(UTC) - timedelta(days=days) if days else None
    if period:
        since = {
            "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
            "7d": now - timedelta(days=7),
            "30d": now - timedelta(days=30),
            "90d": now - timedelta(days=90),
            "all": None,
        }[period]
    metrics = await SignalRepository(connection).performance(
        since=since,
        signal_type=signal_type,
        league_id=league_id,
        market=market,
        strategy_id=strategy_id,
    )
    return PerformanceResponse(
        metrics=PerformanceMetrics.model_validate(metrics),
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )


@router.get(
    "/performance/markets",
    response_model=PerformanceGroupsResponse,
    operation_id="get_performance_by_market",
)
async def get_performance_by_market(
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> PerformanceGroupsResponse:
    rows = await SignalRepository(connection).performance_by_market()
    return PerformanceGroupsResponse(
        items=[_group(row) for row in rows],
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )


@router.get(
    "/performance/leagues",
    response_model=PerformanceGroupsResponse,
    operation_id="get_performance_by_league",
)
async def get_performance_by_league(
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> PerformanceGroupsResponse:
    rows = await SignalRepository(connection).performance_by_league()
    return PerformanceGroupsResponse(
        items=[_group(row) for row in rows],
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )


@router.get("/track-record", response_model=TrackRecordResponse, operation_id="get_track_record")
async def get_track_record(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
    period: Annotated[Literal["today", "7d", "30d", "90d", "all"], Query()] = "all",
    signal_type: Annotated[Literal["live", "prematch"] | None, Query()] = None,
    league_id: Annotated[UUID | None, Query()] = None,
    market: Annotated[str | None, Query(max_length=80, pattern=r"^[a-z0-9_]+$")] = None,
    strategy_id: Annotated[UUID | None, Query()] = None,
) -> TrackRecordResponse:
    now = datetime.now(UTC)
    since = {
        "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
        "7d": now - timedelta(days=7),
        "30d": now - timedelta(days=30),
        "90d": now - timedelta(days=90),
        "all": None,
    }[period]
    items, total = await SignalRepository(connection).track_record(
        limit=pagination.limit,
        offset=pagination.offset,
        since=since,
        signal_type=signal_type,
        league_id=league_id,
        market=market,
        strategy_id=strategy_id,
    )
    return TrackRecordResponse(
        items=items,
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )
