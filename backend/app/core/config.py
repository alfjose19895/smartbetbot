from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: Literal["development", "staging", "production", "test"] = "development"
    cors_origins: str = "http://localhost:3000"
    allowed_hosts: str = "localhost,127.0.0.1,test,testserver"
    max_request_body_bytes: int = Field(default=1_048_576, ge=1024, le=10_485_760)
    api_rate_limit_requests: int = Field(default=120, ge=10, le=10_000)
    api_rate_limit_window_seconds: int = Field(default=60, ge=10, le=3600)
    api_rate_limit_timeout_seconds: float = Field(default=2, ge=0.1, le=10)
    log_level: str = "INFO"
    supabase_url: str | None = None
    supabase_secret_key: SecretStr | None = None
    supabase_jwt_audience: str = "authenticated"
    database_url: SecretStr | None = None
    database_pool_size: int = Field(default=5, ge=1, le=20)
    database_max_overflow: int = Field(default=5, ge=0, le=20)
    database_connect_timeout_seconds: float = Field(default=5, ge=1, le=30)
    readiness_timeout_seconds: float = Field(default=3, ge=0.5, le=10)
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: SecretStr | None = None
    sports_data_provider: str = Field(default="api_football", pattern=r"^[a-z0-9_]+$")
    api_football_key: SecretStr | None = None
    api_football_base_url: str = Field(
        default="https://v3.football.api-sports.io", pattern=r"^https://"
    )
    api_football_timeout_seconds: float = Field(default=10, ge=1, le=60)
    api_football_max_retries: int = Field(default=2, ge=0, le=5)
    api_football_backoff_base_seconds: float = Field(default=0.5, ge=0, le=10)
    api_football_backoff_max_seconds: float = Field(default=8, ge=0.1, le=60)
    api_football_backoff_jitter_seconds: float = Field(default=0.25, ge=0, le=5)
    api_football_max_pages: int = Field(default=20, ge=1, le=100)
    football_data_api_key: SecretStr | None = None
    football_data_base_url: str = Field(
        default="https://api.football-data.org/v4", pattern=r"^https://"
    )
    football_data_timeout_seconds: float = Field(default=10, ge=1, le=60)
    football_data_max_retries: int = Field(default=2, ge=0, le=5)
    football_data_backoff_base_seconds: float = Field(default=1, ge=0, le=10)
    football_data_backoff_max_seconds: float = Field(default=15, ge=0.1, le=60)
    football_data_backoff_jitter_seconds: float = Field(default=0.25, ge=0, le=5)
    api_usage_write_timeout_seconds: float = Field(default=2, ge=0.1, le=10)
    live_fixture_poll_seconds: int = Field(default=15, ge=5, le=300)
    live_event_poll_seconds: int = Field(default=15, ge=5, le=300)
    live_stats_poll_seconds: int = Field(default=60, ge=15, le=600)
    live_odds_poll_seconds: int = Field(default=15, ge=5, le=300)
    prematch_league_ids: str = ""
    prematch_season_override: int | None = Field(default=None, ge=1900, le=2200)
    prematch_sync_interval_seconds: int = Field(default=21600, ge=300, le=86400)
    prematch_lookahead_days: int = Field(default=14, ge=1, le=90)
    prematch_history_days: int = Field(default=365, ge=30, le=1825)
    prematch_enrichment_limit: int = Field(default=10, ge=0, le=50)
    prematch_h2h_last: int = Field(default=10, ge=1, le=50)
    prematch_quota_reserve: int = Field(default=10, ge=0, le=1000)
    prematch_lineup_window_minutes: int = Field(default=120, ge=30, le=360)
    prematch_prediction_horizon_hours: int = Field(default=48, ge=1, le=168)
    prematch_odds_horizon_hours: int = Field(default=72, ge=1, le=336)
    prematch_odds_limit: int = Field(default=20, ge=0, le=200)
    live_candidate_warmup_minutes: int = Field(default=30, ge=5, le=180)
    live_candidate_stale_hours: int = Field(default=4, ge=2, le=12)
    live_max_concurrency: int = Field(default=4, ge=1, le=20)
    prematch_worker_lock_seconds: int = Field(default=1800, ge=60, le=7200)
    live_worker_lock_seconds: int = Field(default=45, ge=20, le=300)
    odds_worker_lock_seconds: int = Field(default=45, ge=20, le=300)
    odds_target_limit: int = Field(default=100, ge=1, le=500)
    odds_movement_probability_delta: float = Field(default=0.02, ge=0, le=1)
    odds_movement_relative_price_change: float = Field(default=0.05, ge=0, le=1)
    intelligence_league_links: str = (
        "api_football:39,football_data:2021;api_football:140,football_data:2014"
    )
    probability_horizon_days: int = Field(default=14, ge=1, le=90)
    probability_target_limit: int = Field(default=200, ge=1, le=1000)
    probability_worker_interval_seconds: int = Field(default=21600, ge=300, le=86400)
    probability_worker_lock_seconds: int = Field(default=1800, ge=60, le=7200)
    signal_worker_interval_seconds: int = Field(default=15, ge=5, le=300)
    signal_worker_lock_seconds: int = Field(default=45, ge=20, le=300)
    signal_target_limit: int = Field(default=100, ge=1, le=500)
    signal_material_odds_change: float = Field(default=0.05, ge=0, le=1)
    signal_material_edge_change: float = Field(default=0.02, ge=0, le=1)
    signal_material_smart_score_change: float = Field(default=5, ge=0, le=100)
    settlement_worker_interval_seconds: int = Field(default=60, ge=15, le=3600)
    settlement_worker_lock_seconds: int = Field(default=120, ge=30, le=900)
    settlement_target_limit: int = Field(default=500, ge=1, le=2000)
    firebase_project_id: str | None = None
    firebase_client_email: str | None = None
    firebase_private_key: SecretStr | None = None
    notification_worker_interval_seconds: int = Field(default=10, ge=5, le=300)
    notification_worker_lock_seconds: int = Field(default=45, ge=20, le=300)
    notification_target_limit: int = Field(default=100, ge=1, le=500)
    worker_failure_backoff_seconds: int = Field(default=30, ge=5, le=600)
    worker_run_once: bool = False
    demo_mode: bool = False

    @field_validator("prematch_season_override", mode="before")
    @classmethod
    def empty_optional_integer_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def validate_security_boundaries(self) -> Settings:
        origins = self.cors_origin_list
        if not origins or "*" in origins:
            raise ValueError("CORS_ORIGINS must contain explicit origins")
        for origin in origins:
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("CORS_ORIGINS entries must be absolute HTTP(S) origins")
            if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise ValueError("CORS_ORIGINS entries cannot contain paths, queries, or fragments")

        has_upstash_url = bool(self.upstash_redis_rest_url)
        has_upstash_token = bool(self.upstash_redis_rest_token)
        if has_upstash_url != has_upstash_token:
            raise ValueError("Upstash URL and token must be configured together")

        hosts = self.allowed_host_list
        if not hosts or any("://" in host or "/" in host for host in hosts):
            raise ValueError("ALLOWED_HOSTS entries must be hostnames without paths or schemes")

        if self.environment in {"staging", "production"}:
            if self.demo_mode:
                raise ValueError("DEMO_MODE cannot be enabled outside development")
            if any(not origin.startswith("https://") for origin in origins):
                raise ValueError("Staging and production CORS origins must use HTTPS")
            if not self.supabase_url or not self.database_url:
                raise ValueError("Supabase URL and DATABASE_URL are required outside development")
            if not has_upstash_url:
                raise ValueError("Upstash credentials are required outside development")
            if not hosts or "*" in hosts:
                raise ValueError("ALLOWED_HOSTS must contain explicit hosts")
            if any(host in {"localhost", "127.0.0.1", "test", "testserver"} for host in hosts):
                raise ValueError("Non-local environments cannot trust local hosts")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field
    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @computed_field
    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip().lower() for host in self.allowed_hosts.split(",") if host.strip()]

    @property
    def database_dsn(self) -> str | None:
        return self.database_url.get_secret_value() if self.database_url else None

    @property
    def upstash_token(self) -> str | None:
        return (
            self.upstash_redis_rest_token.get_secret_value()
            if self.upstash_redis_rest_token
            else None
        )

    @property
    def api_football_key_value(self) -> str | None:
        return self.api_football_key.get_secret_value() if self.api_football_key else None

    @property
    def football_data_key_value(self) -> str | None:
        return self.football_data_api_key.get_secret_value() if self.football_data_api_key else None

    @property
    def firebase_private_key_value(self) -> str | None:
        if self.firebase_private_key is None:
            return None
        return self.firebase_private_key.get_secret_value().replace("\\n", "\n")

    @property
    def prematch_league_id_list(self) -> tuple[str, ...]:
        league_ids = (
            league_id.strip()
            for league_id in self.prematch_league_ids.split(",")
            if league_id.strip()
        )
        return tuple(dict.fromkeys(league_ids))

    @property
    def intelligence_league_link_groups(
        self,
    ) -> tuple[tuple[tuple[str, str], ...], ...]:
        groups: list[tuple[tuple[str, str], ...]] = []
        for raw_group in self.intelligence_league_links.split(";"):
            references: list[tuple[str, str]] = []
            for raw_reference in raw_group.split(","):
                provider, separator, external_id = raw_reference.strip().partition(":")
                if not separator or not provider or not external_id:
                    continue
                references.append((provider, external_id))
            if references:
                groups.append(tuple(dict.fromkeys(references)))
        return tuple(groups)


@lru_cache
def get_settings() -> Settings:
    return Settings()
