from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.providers.sports.api_football.client import ApiFootballClient
from app.providers.sports.api_football.provider import ApiFootballProvider
from app.providers.sports.base import SportsDataProvider
from app.providers.sports.cache import NoopSportsDataCache, UpstashSportsDataCache
from app.providers.sports.errors import ProviderConfigurationError
from app.providers.sports.football_data.client import FootballDataClient
from app.providers.sports.football_data.provider import FootballDataProvider
from app.providers.sports.mock import ControlledMockSportsDataProvider, MockSportsDataset
from app.providers.sports.registry import SportsDataProviderRegistry
from app.providers.sports.usage import NullApiUsageRecorder, SqlAlchemyApiUsageRecorder


def build_sports_data_provider(
    settings: Settings,
    *,
    registry: SportsDataProviderRegistry | None = None,
    mock_dataset: MockSportsDataset | None = None,
    database_engine: AsyncEngine | None = None,
    worker: str | None = None,
) -> SportsDataProvider:
    provider_name = settings.sports_data_provider.strip().lower()
    if provider_name == "mock":
        if settings.environment == "production" or not settings.demo_mode:
            raise ProviderConfigurationError(
                "The mock sports-data provider requires DEMO_MODE=true outside production.",
                provider="mock",
            )
        return ControlledMockSportsDataProvider(mock_dataset)

    if provider_name == "api_football":
        api_key = settings.api_football_key_value
        if not api_key:
            raise ProviderConfigurationError(
                "API_FOOTBALL_KEY is required for the API-Football adapter.",
                provider=provider_name,
            )
        has_upstash_url = bool(settings.upstash_redis_rest_url)
        has_upstash_token = bool(settings.upstash_token)
        if has_upstash_url != has_upstash_token:
            raise ProviderConfigurationError(
                "Both Upstash REST settings must be configured together.",
                provider=provider_name,
            )
        cache = (
            UpstashSportsDataCache(
                rest_url=settings.upstash_redis_rest_url or "",
                token=settings.upstash_token or "",
            )
            if has_upstash_url and has_upstash_token
            else NoopSportsDataCache()
        )
        usage_recorder = (
            SqlAlchemyApiUsageRecorder(database_engine, worker=worker)
            if database_engine is not None
            else NullApiUsageRecorder()
        )
        client = ApiFootballClient(
            api_key=api_key,
            base_url=settings.api_football_base_url,
            timeout_seconds=settings.api_football_timeout_seconds,
            max_retries=settings.api_football_max_retries,
            backoff_base_seconds=settings.api_football_backoff_base_seconds,
            backoff_max_seconds=settings.api_football_backoff_max_seconds,
            backoff_jitter_seconds=settings.api_football_backoff_jitter_seconds,
            max_pages=settings.api_football_max_pages,
            usage_write_timeout_seconds=settings.api_usage_write_timeout_seconds,
            cache=cache,
            usage_recorder=usage_recorder,
        )
        return ApiFootballProvider(client)

    if provider_name == "football_data":
        api_key = settings.football_data_key_value
        if not api_key:
            raise ProviderConfigurationError(
                "FOOTBALL_DATA_API_KEY is required for the football-data.org adapter.",
                provider=provider_name,
            )
        has_upstash_url = bool(settings.upstash_redis_rest_url)
        has_upstash_token = bool(settings.upstash_token)
        if has_upstash_url != has_upstash_token:
            raise ProviderConfigurationError(
                "Both Upstash REST settings must be configured together.",
                provider=provider_name,
            )
        cache = (
            UpstashSportsDataCache(
                rest_url=settings.upstash_redis_rest_url or "",
                token=settings.upstash_token or "",
            )
            if has_upstash_url and has_upstash_token
            else NoopSportsDataCache()
        )
        usage_recorder = (
            SqlAlchemyApiUsageRecorder(database_engine, worker=worker)
            if database_engine is not None
            else NullApiUsageRecorder()
        )
        client = FootballDataClient(
            api_key=api_key,
            base_url=settings.football_data_base_url,
            timeout_seconds=settings.football_data_timeout_seconds,
            max_retries=settings.football_data_max_retries,
            backoff_base_seconds=settings.football_data_backoff_base_seconds,
            backoff_max_seconds=settings.football_data_backoff_max_seconds,
            backoff_jitter_seconds=settings.football_data_backoff_jitter_seconds,
            usage_write_timeout_seconds=settings.api_usage_write_timeout_seconds,
            cache=cache,
            usage_recorder=usage_recorder,
        )
        return FootballDataProvider(client)

    if registry is None:
        raise ProviderConfigurationError(
            f"Provider '{provider_name}' has no installed adapter.",
            provider=provider_name,
        )
    return registry.create(provider_name)
