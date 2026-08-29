from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.v1.pagination import PaginationParams, get_pagination
from app.api.v1.schemas.admin import (
    AdminOverview,
    ApiUsageRecord,
    ModelVersion,
    Strategy,
    WorkerRun,
)
from app.api.v1.schemas.common import ERROR_RESPONSES, Page, Pagination
from app.core.database import get_connection
from app.core.errors import ForbiddenError
from app.core.readiness import ReadinessService, get_readiness_service
from app.core.security import CurrentUser, get_current_user
from app.repositories.accounts import AccountRepository
from app.repositories.admin import AdminRepository

router = APIRouter(prefix="/admin", tags=["admin"], responses=ERROR_RESPONSES)


async def require_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> CurrentUser:
    role = await AccountRepository(connection).get_role(user.id)
    if role != "admin":
        raise ForbiddenError("An administrator role is required.")
    return user


@router.get(
    "/overview",
    response_model=AdminOverview,
    dependencies=[Depends(require_admin)],
    operation_id="get_admin_overview",
)
async def get_admin_overview(
    connection: Annotated[AsyncConnection, Depends(get_connection)],
    readiness: Annotated[ReadinessService, Depends(get_readiness_service)],
) -> AdminOverview:
    values = await AdminRepository(connection).overview()
    health = await readiness.check()
    return AdminOverview(
        **values,
        database_status=health.database.status,
        database_latency_ms=health.database.latency_ms,
        redis_status=health.redis.status,
        redis_latency_ms=health.redis.latency_ms,
    )


async def _page[AdminModel: BaseModel](
    *,
    resource: Literal["workers", "api_usage", "models", "strategies"],
    model: type[AdminModel],
    pagination: PaginationParams,
    connection: AsyncConnection,
) -> Page[AdminModel]:
    items, total = await AdminRepository(connection).list_resource(
        resource,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return Page[AdminModel](
        items=[model.model_validate(item) for item in items],
        pagination=Pagination(limit=pagination.limit, offset=pagination.offset, total=total),
    )


@router.get(
    "/workers",
    response_model=Page[WorkerRun],
    dependencies=[Depends(require_admin)],
    operation_id="list_worker_runs",
)
async def list_worker_runs(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[WorkerRun]:
    return await _page(
        resource="workers", model=WorkerRun, pagination=pagination, connection=connection
    )


@router.get(
    "/api-usage",
    response_model=Page[ApiUsageRecord],
    dependencies=[Depends(require_admin)],
    operation_id="list_api_usage",
)
async def list_api_usage(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[ApiUsageRecord]:
    return await _page(
        resource="api_usage", model=ApiUsageRecord, pagination=pagination, connection=connection
    )


@router.get(
    "/models",
    response_model=Page[ModelVersion],
    dependencies=[Depends(require_admin)],
    operation_id="list_model_versions",
)
async def list_model_versions(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[ModelVersion]:
    return await _page(
        resource="models", model=ModelVersion, pagination=pagination, connection=connection
    )


@router.get(
    "/strategies",
    response_model=Page[Strategy],
    dependencies=[Depends(require_admin)],
    operation_id="list_strategies",
)
async def list_strategies(
    pagination: Annotated[PaginationParams, Depends(get_pagination)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Page[Strategy]:
    return await _page(
        resource="strategies", model=Strategy, pagination=pagination, connection=connection
    )
