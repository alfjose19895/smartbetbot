from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError


def _async_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+psycopg://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    raise ValueError("DATABASE_URL must use a PostgreSQL URI")


def create_database_engine(settings: Settings) -> AsyncEngine | None:
    if not settings.database_dsn:
        return None

    return create_async_engine(
        _async_database_url(settings.database_dsn),
        pool_pre_ping=True,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        connect_args={"connect_timeout": settings.database_connect_timeout_seconds},
        hide_parameters=True,
    )


async def get_connection(request: Request) -> AsyncIterator[AsyncConnection]:
    engine: AsyncEngine | None = getattr(request.app.state, "database_engine", None)
    if engine is None:
        raise ServiceUnavailableError(
            code="database_not_configured",
            message="Database access is not configured for this service.",
        )

    async with engine.connect() as connection:
        yield connection
