from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.domain.sports import (
    LiveFixtureQuery,
    OddsPhase,
    OddsQuery,
    ProviderRef,
    ProviderRequestMetadata,
    TeamQuery,
)
from app.providers.sports.api_football.client import ApiFootballResult
from app.providers.sports.api_football.provider import ApiFootballProvider
from app.providers.sports.errors import ProviderConfigurationError


def metadata(operation: str) -> ProviderRequestMetadata:
    return ProviderRequestMetadata(
        provider="api_football",
        operation=operation,
        requested_at=datetime(2026, 8, 25, tzinfo=UTC),
        duration_ms=5,
        external_requests=1,
        quota_limit=100,
        quota_remaining=99,
        page=1,
        total_pages=1,
    )


class StubClient:
    def __init__(self, responses: dict[str, list[dict[str, Any]]]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.closed = False

    async def get(self, endpoint: str, **kwargs: Any) -> ApiFootballResult:
        self.calls.append((endpoint, kwargs))
        return ApiFootballResult(
            items=tuple(self.responses.get(endpoint, [])),
            metadata=metadata(kwargs["operation"]),
            observed_at=datetime(2026, 8, 25, tzinfo=UTC),
        )

    async def close(self) -> None:
        self.closed = True


def live_fixture_payload() -> dict[str, Any]:
    return {
        "fixture": {
            "id": 123,
            "date": "2026-08-25T10:00:00+00:00",
            "status": {"short": "1H", "elapsed": 22},
        },
        "league": {"id": 39, "name": "League", "season": 2026},
        "teams": {
            "home": {"id": 1, "name": "Home"},
            "away": {"id": 2, "name": "Away"},
        },
        "goals": {"home": 1, "away": 0},
        "score": {},
    }


@pytest.mark.anyio
async def test_live_provider_routing_and_lifecycle() -> None:
    client = StubClient({"/fixtures": [live_fixture_payload()]})
    provider = ApiFootballProvider(client)  # type: ignore[arg-type]

    response = await provider.list_live_fixtures(
        LiveFixtureQuery(league_external_ids=("39", "140"))
    )
    await provider.close()

    endpoint, options = client.calls[0]
    assert endpoint == "/fixtures"
    assert options["params"] == {"live": "39-140", "timezone": "UTC"}
    assert options["ttl_seconds"] == 15
    assert response.items[0].match_minute == 22
    assert client.closed is True


@pytest.mark.anyio
async def test_odds_requests_are_per_fixture_and_metadata_is_combined() -> None:
    odds_payload = {
        "fixture": {"id": 123},
        "bookmakers": [
            {
                "id": 6,
                "name": "Bookmaker",
                "bets": [
                    {
                        "id": 1,
                        "name": "Match Winner",
                        "values": [{"value": "Home", "odd": "1.80"}],
                    }
                ],
            }
        ],
    }
    second_payload = {**odds_payload, "fixture": {"id": 456}}
    client = StubClient({"/odds": [odds_payload]})

    async def fixture_aware_get(endpoint: str, **kwargs: Any) -> ApiFootballResult:
        client.calls.append((endpoint, kwargs))
        payload = odds_payload if kwargs["params"]["fixture"] == "123" else second_payload
        return ApiFootballResult(
            items=(payload,),
            metadata=metadata(kwargs["operation"]),
            observed_at=datetime(2026, 8, 25, tzinfo=UTC),
        )

    client.get = fixture_aware_get  # type: ignore[method-assign]
    provider = ApiFootballProvider(client)  # type: ignore[arg-type]

    response = await provider.get_odds(
        OddsQuery(fixture_external_ids=("123", "456"), phase=OddsPhase.PREMATCH)
    )

    assert [call[1]["params"]["fixture"] for call in client.calls] == ["123", "456"]
    assert all(call[1]["all_pages"] is True for call in client.calls)
    assert len(response.items) == 2
    assert response.metadata.external_requests == 2


@pytest.mark.anyio
async def test_injuries_use_fixture_scope_and_normalized_output() -> None:
    client = StubClient(
        {
            "/injuries": [
                {
                    "player": {
                        "id": 9,
                        "name": "Forward",
                        "type": "Missing Fixture",
                        "reason": "Hamstring",
                    },
                    "team": {"id": 1, "name": "Home"},
                    "fixture": {"id": 123},
                }
            ]
        }
    )
    provider = ApiFootballProvider(client)  # type: ignore[arg-type]

    response = await provider.get_fixture_injuries(
        ProviderRef(provider="api_football", external_id="123")
    )

    endpoint, options = client.calls[0]
    assert endpoint == "/injuries"
    assert options["params"] == {"fixture": "123"}
    assert options["ttl_seconds"] == 1800
    assert response.items[0].player.name == "Forward"


@pytest.mark.anyio
async def test_foreign_provider_reference_is_rejected_before_request() -> None:
    client = StubClient({})
    provider = ApiFootballProvider(client)  # type: ignore[arg-type]

    with pytest.raises(ProviderConfigurationError, match="API-Football reference"):
        await provider.get_fixture_events(
            ProviderRef(provider="different_provider", external_id="123")
        )

    assert client.calls == []


@pytest.mark.anyio
async def test_team_country_code_is_resolved_to_provider_country_name() -> None:
    client = StubClient(
        {
            "/teams/countries": [{"name": "England", "code": "GB-ENG"}],
            "/teams": [
                {
                    "team": {"id": 33, "name": "United", "country": "England"},
                    "venue": None,
                }
            ],
        }
    )
    provider = ApiFootballProvider(client)  # type: ignore[arg-type]

    response = await provider.list_teams(TeamQuery(country_code="GB-ENG"))

    assert [call[0] for call in client.calls] == ["/teams/countries", "/teams"]
    assert client.calls[1][1]["params"]["country"] == "England"
    assert response.items[0].country and response.items[0].country.code == "GB-ENG"
    assert response.metadata.external_requests == 2
