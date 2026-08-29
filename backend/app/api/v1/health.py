from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel

from app.core.constants import API_VERSION
from app.core.readiness import ComponentHealth, ReadinessService, get_readiness_service

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    environment: str
    version: str
    timestamp: datetime


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    service: str
    environment: str
    version: str
    timestamp: datetime
    checks: dict[str, ComponentHealth]


@router.get("/health", response_model=HealthResponse, operation_id="get_health")
async def health(request: Request) -> HealthResponse:
    """Return liveness without contacting external services."""
    settings = request.app.state.settings
    return HealthResponse(
        status="ok",
        service="smartbetbot-api",
        environment=settings.environment,
        version=API_VERSION,
        timestamp=datetime.now(UTC),
    )


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    operation_id="get_readiness",
    responses={503: {"model": ReadinessResponse, "description": "A dependency is not ready"}},
)
async def readiness(
    response: Response,
    service: Annotated[ReadinessService, Depends(get_readiness_service)],
) -> ReadinessResponse:
    """Check PostgreSQL and Upstash without calling the sports-data provider."""
    settings = service.settings
    result = await service.check()
    if not result.ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        status="ready" if result.ready else "not_ready",
        service="smartbetbot-api",
        environment=settings.environment,
        version=API_VERSION,
        timestamp=datetime.now(UTC),
        checks={"database": result.database, "redis": result.redis},
    )
