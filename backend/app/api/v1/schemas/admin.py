from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

WorkerType = Literal[
    "live",
    "odds",
    "prematch",
    "probability",
    "signal",
    "settlement",
    "notification",
]


class WorkerRun(BaseModel):
    id: UUID
    worker: WorkerType
    started_at: datetime
    finished_at: datetime | None = None
    status: Literal["running", "succeeded", "partial", "failed"]
    fixtures_processed: int
    signals_generated: int
    errors: int
    duration_ms: int | None = None
    metadata: dict[str, object]


class ApiUsageRecord(BaseModel):
    id: int
    provider: str
    endpoint: str
    http_method: str
    response_status: int | None = None
    requests_used: int
    rate_limit_remaining: int | None = None
    duration_ms: int | None = None
    request_id: str | None = None
    worker: str | None = None
    fixture_id: UUID | None = None
    requested_at: datetime


class ModelVersion(BaseModel):
    id: UUID
    name: str
    version: str
    model_type: str
    status: Literal["draft", "validation", "active", "retired", "failed"]
    training_started_at: datetime | None = None
    training_finished_at: datetime | None = None
    training_data_cutoff: datetime | None = None
    evaluation_metrics: dict[str, object]
    calibration_metrics: dict[str, object]
    artifact_uri: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class Strategy(BaseModel):
    id: UUID
    name: str
    slug: str
    market: str
    is_live: bool
    enabled: bool
    min_probability: float
    min_edge: float
    min_smart_score: int
    min_data_quality: float
    min_odds: float | None = None
    max_odds: float | None = None
    cooldown_seconds: int
    config_json: dict[str, object]
    created_at: datetime
    updated_at: datetime


class AdminOverview(BaseModel):
    database_status: str
    database_latency_ms: float | None = None
    redis_status: str
    redis_latency_ms: float | None = None
    api_requests_24h: int
    provider_average_latency_ms_24h: float | None = None
    provider_errors_24h: int
    signals_24h: int
    active_strategies: int
    current_model: str | None = None
    workers: list[WorkerRun]
