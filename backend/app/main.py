from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.health import router as health_router
from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.constants import API_VERSION, RESPONSIBLE_USE_NOTICE
from app.core.database import create_database_engine
from app.core.http import install_http_handlers
from app.core.logging import configure_logging
from app.core.rate_limit import NoopApiRateLimiter, UpstashApiRateLimiter


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create and release shared clients at the ASGI lifecycle boundary."""
    settings: Settings = app.state.settings
    app.state.database_engine = create_database_engine(settings)
    async with httpx.AsyncClient(timeout=settings.api_rate_limit_timeout_seconds) as http_client:
        app.state.http_client = http_client
        if settings.upstash_redis_rest_url and settings.upstash_token:
            app.state.rate_limiter = UpstashApiRateLimiter(
                rest_url=settings.upstash_redis_rest_url,
                token=settings.upstash_token,
                request_limit=settings.api_rate_limit_requests,
                window_seconds=settings.api_rate_limit_window_seconds,
                fail_closed=settings.environment in {"staging", "production"},
                http_client=http_client,
            )
        else:
            app.state.rate_limiter = NoopApiRateLimiter()
        yield
    if app.state.database_engine is not None:
        await app.state.database_engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)

    application = FastAPI(
        title="SmartBetBot API",
        summary="Football intelligence and explainable data signals API",
        description=RESPONSIBLE_USE_NOTICE,
        version=API_VERSION,
        docs_url="/docs" if resolved_settings.environment != "production" else None,
        redoc_url="/redoc" if resolved_settings.environment != "production" else None,
        openapi_url=("/openapi.json" if resolved_settings.environment != "production" else None),
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings

    application.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=resolved_settings.allowed_host_list,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    install_http_handlers(application)
    application.include_router(health_router)
    application.include_router(api_router)
    return application


app = create_app()
