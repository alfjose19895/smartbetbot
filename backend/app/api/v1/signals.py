from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.v1.pagination import PaginationParams, get_pagination
from app.api.v1.schemas.common import ERROR_RESPONSES, Pagination
from app.api.v1.schemas.signals import (
    SignalDetail,
    SignalDetailResponse,
    SignalPageResponse,
)
from app.core.constants import RESPONSIBLE_USE_NOTICE
from app.core.database import get_connection
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.repositories.signals import SignalRepository

router = APIRouter(
    prefix="/signals",
    tags=["signals"],
    dependencies=[Depends(get_current_user)],
    responses=ERROR_RESPONSES,
)


async def _list_signals(
    *,
    signal_type: Literal["live", "prematch"] | None,
    since: datetime | None,
    pagination: PaginationParams,
    connection: AsyncConnection,
) -> SignalPageResponse:
    items, total = await SignalRepository(connection).list(
        signal_type=signal_type,
        since=since,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return SignalPageResponse(
        items=items,
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )


@router.get("", response_model=SignalPageResponse, operation_id="list_signals")
async def list_signals(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
    days: Annotated[int | None, Query(ge=1, le=3650)] = None,
) -> SignalPageResponse:
    since = datetime.now(UTC) - timedelta(days=days) if days else None
    return await _list_signals(
        signal_type=None,
        since=since,
        pagination=pagination,
        connection=connection,
    )


@router.get("/live", response_model=SignalPageResponse, operation_id="list_live_signals")
async def list_live_signals(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> SignalPageResponse:
    return await _list_signals(
        signal_type="live", since=None, pagination=pagination, connection=connection
    )


@router.get(
    "/prematch",
    response_model=SignalPageResponse,
    operation_id="list_prematch_signals",
)
async def list_prematch_signals(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> SignalPageResponse:
    return await _list_signals(
        signal_type="prematch", since=None, pagination=pagination, connection=connection
    )


@router.get("/{signal_id}", response_model=SignalDetailResponse, operation_id="get_signal")
async def get_signal(
    signal_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> SignalDetailResponse:
    signal = await SignalRepository(connection).get(signal_id)
    if signal is None:
        raise NotFoundError("Signal")
    return SignalDetailResponse(
        signal=SignalDetail.model_validate(signal),
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )
