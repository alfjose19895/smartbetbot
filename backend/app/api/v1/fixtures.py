from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.v1.pagination import PaginationParams, get_pagination
from app.api.v1.schemas.common import ERROR_RESPONSES, Page, Pagination
from app.api.v1.schemas.fixtures import (
    FixtureDetail,
    FixtureSummary,
    LiveFixtureAnalysis,
    PrematchFixtureAnalysis,
)
from app.core.database import get_connection
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.repositories.fixtures import FixtureRepository

router = APIRouter(
    prefix="/fixtures",
    tags=["fixtures"],
    dependencies=[Depends(get_current_user)],
    responses=ERROR_RESPONSES,
)


@router.get("/live", response_model=Page[FixtureSummary], operation_id="list_live_fixtures")
async def list_live_fixtures(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[FixtureSummary]:
    items, total = await FixtureRepository(connection).list_live(
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return Page[FixtureSummary](
        items=items,
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
    )


@router.get(
    "/upcoming",
    response_model=Page[FixtureSummary],
    operation_id="list_upcoming_fixtures",
)
async def list_upcoming_fixtures(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[FixtureSummary]:
    items, total = await FixtureRepository(connection).list_upcoming(
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return Page[FixtureSummary](
        items=items,
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
    )


@router.get(
    "/live/analysis",
    response_model=Page[LiveFixtureAnalysis],
    operation_id="list_live_fixture_analysis",
)
async def list_live_fixture_analysis(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[LiveFixtureAnalysis]:
    items, total = await FixtureRepository(connection).list_live_analysis(
        limit=pagination.limit, offset=pagination.offset
    )
    return Page[LiveFixtureAnalysis](
        items=items,
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
    )


@router.get(
    "/upcoming/analysis",
    response_model=Page[PrematchFixtureAnalysis],
    operation_id="list_prematch_fixture_analysis",
)
async def list_prematch_fixture_analysis(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
    date_from: Annotated[datetime | None, Query()] = None,
    date_to: Annotated[datetime | None, Query()] = None,
    league_id: Annotated[UUID | None, Query()] = None,
    market: Annotated[str | None, Query(max_length=80, pattern=r"^[a-z0-9_]+$")] = None,
    minimum_smart_score: Annotated[int | None, Query(ge=0, le=100)] = None,
) -> Page[PrematchFixtureAnalysis]:
    now = datetime.now(UTC)
    start = date_from or now
    end = date_to or start + timedelta(days=14)
    items, total = await FixtureRepository(connection).list_upcoming_analysis(
        limit=pagination.limit,
        offset=pagination.offset,
        date_from=start,
        date_to=end,
        league_id=league_id,
        market=market,
        minimum_smart_score=minimum_smart_score,
    )
    return Page[PrematchFixtureAnalysis](
        items=items,
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
    )


@router.get("/{fixture_id}", response_model=FixtureDetail, operation_id="get_fixture")
async def get_fixture(
    fixture_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> FixtureDetail:
    fixture = await FixtureRepository(connection).get(fixture_id)
    if fixture is None:
        raise NotFoundError("Fixture")
    return FixtureDetail.model_validate(fixture)
