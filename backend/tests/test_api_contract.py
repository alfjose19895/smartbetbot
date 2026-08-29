from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from app.api.v1.schemas.common import Pagination
from app.core.config import Settings
from app.core.constants import RESPONSIBLE_USE_NOTICE
from app.core.readiness import ComponentHealth, ReadinessResult, get_readiness_service
from app.main import app
from app.repositories.accounts import AccountRepository
from app.repositories.fixtures import FixtureRepository
from app.repositories.signals import SignalRepository
from tests.conftest import TEST_USER


class FakeReadinessService:
    def __init__(self, *, ready: bool) -> None:
        self.ready = ready
        self.settings = Settings(environment="test")

    async def check(self) -> ReadinessResult:
        return ReadinessResult(
            ready=self.ready,
            database=ComponentHealth(status="ok"),
            redis=ComponentHealth(status="ok" if self.ready else "not_configured"),
        )


@pytest.mark.anyio
async def test_ready_returns_503_when_dependency_is_missing(client: AsyncClient) -> None:
    async def fake_service() -> FakeReadinessService:
        return FakeReadinessService(ready=False)

    app.dependency_overrides[get_readiness_service] = fake_service

    response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["checks"]["redis"]["status"] == "not_configured"


@pytest.mark.anyio
async def test_ready_returns_200_when_all_dependencies_are_healthy(client: AsyncClient) -> None:
    async def fake_service() -> FakeReadinessService:
        return FakeReadinessService(ready=True)

    app.dependency_overrides[get_readiness_service] = fake_service

    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


@pytest.mark.anyio
async def test_protected_endpoint_requires_bearer_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/fixtures/live")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    payload = response.json()["error"]
    assert payload["code"] == "authentication_required"
    assert payload["request_id"] == response.headers["X-Request-ID"]


@pytest.mark.anyio
async def test_live_fixtures_are_paginated(
    client: AsyncClient,
    authenticated_api: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(UTC)
    fixture_id = UUID("22222222-2222-4222-8222-222222222222")

    async def fake_list_live(
        _repository: FixtureRepository,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, object]], int]:
        assert (limit, offset) == (10, 2)
        return (
            [
                {
                    "id": fixture_id,
                    "league": {
                        "id": UUID("33333333-3333-4333-8333-333333333333"),
                        "name": "Test League",
                        "country": "EC",
                        "logo_url": None,
                    },
                    "home_team": {
                        "id": UUID("44444444-4444-4444-8444-444444444444"),
                        "name": "Home",
                        "logo_url": None,
                    },
                    "away_team": {
                        "id": UUID("55555555-5555-4555-8555-555555555555"),
                        "name": "Away",
                        "logo_url": None,
                    },
                    "kickoff_at": now,
                    "status": "live",
                    "provider_status": "2H",
                    "match_minute": 67,
                    "added_time": None,
                    "home_score": 1,
                    "away_score": 0,
                    "round": "Round 1",
                    "has_events": True,
                    "has_statistics": True,
                    "has_odds": False,
                    "last_synced_at": now,
                }
            ],
            3,
        )

    monkeypatch.setattr(FixtureRepository, "list_live", fake_list_live)

    response = await client.get("/api/v1/fixtures/live?limit=10&offset=2")

    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == str(fixture_id)
    assert response.json()["pagination"] == {"limit": 10, "offset": 2, "total": 3}


@pytest.mark.anyio
async def test_performance_never_invents_results(
    client: AsyncClient,
    authenticated_api: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def empty_performance(
        _repository: SignalRepository,
        *,
        since: datetime | None = None,
        signal_type: str | None = None,
        league_id: UUID | None = None,
        market: str | None = None,
        strategy_id: UUID | None = None,
    ) -> dict[str, object]:
        assert since is None
        assert signal_type is league_id is market is strategy_id is None
        return {
            "settled_signals": 0,
            "resolved_signals": 0,
            "wins": 0,
            "losses": 0,
            "pushes": 0,
            "voids": 0,
            "win_rate": None,
            "average_odds": None,
            "stake_units": 0,
            "profit_loss_units": 0,
            "roi": None,
            "yield_rate": None,
        }

    monkeypatch.setattr(SignalRepository, "performance", empty_performance)

    response = await client.get("/api/v1/performance")

    assert response.status_code == 200
    assert response.json()["metrics"]["settled_signals"] == 0
    assert response.json()["metrics"]["win_rate"] is None
    assert response.json()["responsible_use_notice"] == RESPONSIBLE_USE_NOTICE


@pytest.mark.anyio
async def test_performance_applies_track_record_filters(
    client: AsyncClient,
    authenticated_api: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    league_id = uuid4()
    strategy_id = uuid4()

    async def filtered_performance(
        _repository: SignalRepository,
        *,
        since: datetime | None,
        signal_type: str | None,
        league_id: UUID | None,
        market: str | None,
        strategy_id: UUID | None,
    ) -> dict[str, object]:
        assert since is not None
        assert signal_type == "prematch"
        assert league_id == league_id_value
        assert market == "total_goals"
        assert strategy_id == strategy_id_value
        return {
            "settled_signals": 0,
            "resolved_signals": 0,
            "wins": 0,
            "losses": 0,
            "pushes": 0,
            "voids": 0,
            "win_rate": None,
            "average_odds": None,
            "stake_units": 0,
            "profit_loss_units": 0,
            "roi": None,
            "yield_rate": None,
        }

    league_id_value = league_id
    strategy_id_value = strategy_id
    monkeypatch.setattr(SignalRepository, "performance", filtered_performance)

    response = await client.get(
        "/api/v1/performance",
        params={
            "period": "7d",
            "signal_type": "prematch",
            "league_id": str(league_id),
            "market": "total_goals",
            "strategy_id": str(strategy_id),
        },
    )

    assert response.status_code == 200


@pytest.mark.anyio
async def test_me_returns_authenticated_users_profile(
    client: AsyncClient,
    authenticated_api: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(UTC)

    async def fake_get_me(
        _repository: AccountRepository,
        *,
        user_id: UUID,
        email: str | None,
    ) -> dict[str, object]:
        assert user_id == TEST_USER.id
        return {
            "id": user_id,
            "email": email,
            "display_name": "Test User",
            "avatar_url": None,
            "role": "user",
            "timezone": "UTC",
            "created_at": now,
            "updated_at": now,
            "preferences": {
                "minimum_smart_score": 75,
                "minimum_probability": 0.75,
                "minimum_edge": 0.05,
                "live_enabled": True,
                "prematch_enabled": True,
                "markets": [],
                "league_ids": [],
                "quiet_hours_enabled": False,
                "quiet_hours_start": None,
                "quiet_hours_end": None,
                "timezone": "UTC",
                "updated_at": now,
            },
        }

    monkeypatch.setattr(AccountRepository, "get_me", fake_get_me)

    response = await client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json()["id"] == str(TEST_USER.id)
    assert response.json()["role"] == "user"


@pytest.mark.anyio
async def test_validation_error_does_not_echo_sensitive_input(
    client: AsyncClient,
    authenticated_api: object,
) -> None:
    response = await client.post("/api/v1/push/register", json={"fcm_token": "secret"})

    assert response.status_code == 422
    assert "secret" not in response.text


@pytest.mark.anyio
async def test_unknown_route_uses_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_pagination_contract() -> None:
    pagination = Pagination(limit=20, offset=0, total=0)
    assert pagination.model_dump() == {"limit": 20, "offset": 0, "total": 0}


def test_openapi_contains_phase_4_contract() -> None:
    schema = app.openapi()
    expected_paths = {
        "/health",
        "/health/ready",
        "/api/v1/fixtures/live",
        "/api/v1/fixtures/upcoming",
        "/api/v1/fixtures/live/analysis",
        "/api/v1/fixtures/upcoming/analysis",
        "/api/v1/fixtures/{fixture_id}",
        "/api/v1/signals",
        "/api/v1/signals/live",
        "/api/v1/signals/prematch",
        "/api/v1/signals/{signal_id}",
        "/api/v1/performance",
        "/api/v1/performance/markets",
        "/api/v1/performance/leagues",
        "/api/v1/track-record",
        "/api/v1/me",
        "/api/v1/me/preferences",
        "/api/v1/push/register",
        "/api/v1/admin/workers",
        "/api/v1/admin/api-usage",
        "/api/v1/admin/models",
        "/api/v1/admin/strategies",
        "/api/v1/admin/overview",
        "/api/v1/backtests/run",
    }
    assert expected_paths == set(schema["paths"])
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
