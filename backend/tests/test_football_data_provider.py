from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.config import Settings
from app.domain.sports import (
    FixtureQuery,
    FixtureStatus,
    LeagueQuery,
    LiveFixtureQuery,
    ProviderCapability,
    ProviderRef,
    ProviderRequestMetadata,
    TeamQuery,
)
from app.providers.sports.errors import ProviderConfigurationError, UnsupportedCapabilityError
from app.providers.sports.factory import build_sports_data_provider
from app.providers.sports.football_data.client import FootballDataResult
from app.providers.sports.football_data.provider import FootballDataProvider

OBSERVED_AT = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


def metadata(operation: str) -> ProviderRequestMetadata:
    return ProviderRequestMetadata(
        provider="football_data",
        operation=operation,
        requested_at=OBSERVED_AT,
        duration_ms=5,
        external_requests=1,
        quota_remaining=8,
    )


def league_payload() -> dict[str, Any]:
    return {
        "area": {
            "id": 2072,
            "name": "England",
            "code": "ENG",
            "flag": "https://crests.football-data.org/770.svg",
        },
        "id": 2021,
        "name": "Premier League",
        "code": "PL",
        "type": "LEAGUE",
        "emblem": "https://crests.football-data.org/PL.png",
        "currentSeason": {
            "id": 3000,
            "startDate": "2026-08-21",
            "endDate": "2027-05-24",
        },
        "seasons": [
            {
                "id": 3000,
                "startDate": "2026-08-21",
                "endDate": "2027-05-24",
            },
            {
                "id": 1,
                "startDate": "2025-08-01",
                "endDate": "2026-05-01",
            },
            {
                "id": 2,
                "startDate": "1888-09-01",
                "endDate": "1889-04-01",
            },
        ],
    }


def team_payload(team_id: int, name: str) -> dict[str, Any]:
    return {
        "area": {"id": 2072, "name": "England", "code": "ENG"},
        "id": team_id,
        "name": name,
        "shortName": name,
        "tla": name[:3].upper(),
        "crest": f"https://crests.football-data.org/{team_id}.png",
        "founded": 1900,
        "venue": f"{name} Stadium",
    }


def match_payload(*, match_id: int = 100, status: str = "TIMED") -> dict[str, Any]:
    return {
        "area": {"id": 2072, "name": "England", "code": "ENG"},
        "competition": {
            "id": 2021,
            "name": "Premier League",
            "code": "PL",
            "type": "LEAGUE",
        },
        "season": {
            "id": 3000,
            "startDate": "2026-08-21",
            "endDate": "2027-05-24",
        },
        "id": match_id,
        "utcDate": "2026-08-25T19:00:00Z",
        "status": status,
        "minute": 67 if status == "IN_PLAY" else None,
        "injuryTime": 2 if status == "IN_PLAY" else None,
        "venue": "Main Stadium",
        "matchday": 2,
        "stage": "REGULAR_SEASON",
        "lastUpdated": "2026-08-25T19:30:00Z",
        "homeTeam": team_payload(1, "Home"),
        "awayTeam": team_payload(2, "Away"),
        "score": {
            "fullTime": {
                "home": 2 if status in {"IN_PLAY", "FINISHED"} else None,
                "away": 1 if status in {"IN_PLAY", "FINISHED"} else None,
            },
            "halfTime": {"home": 1, "away": 0},
        },
        "referees": [{"name": "Main Referee", "type": "REFEREE"}],
    }


def standings_payload() -> dict[str, Any]:
    entry = {
        "position": 1,
        "team": team_payload(1, "Home"),
        "playedGames": 2,
        "form": "W,W",
        "won": 2,
        "draw": 0,
        "lost": 0,
        "points": 6,
        "goalsFor": 5,
        "goalsAgainst": 1,
        "goalDifference": 4,
    }
    return {
        "competition": {"id": 2021, "name": "Premier League"},
        "season": {"id": 3000, "startDate": "2026-08-21"},
        "standings": [
            {"stage": "REGULAR_SEASON", "type": "TOTAL", "group": None, "table": [entry]},
            {"stage": "REGULAR_SEASON", "type": "HOME", "group": None, "table": [entry]},
        ],
    }


class StubClient:
    def __init__(self, responses: dict[str, list[dict[str, Any]]]) -> None:
        self.responses = {key: list(value) for key, value in responses.items()}
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.closed = False

    async def get(self, endpoint: str, **kwargs: Any) -> FootballDataResult:
        self.calls.append((endpoint, kwargs))
        payloads = self.responses.get(endpoint, [])
        payload = payloads.pop(0) if payloads else {}
        return FootballDataResult(
            payload=payload,
            metadata=metadata(kwargs["operation"]),
            observed_at=OBSERVED_AT,
        )

    async def close(self) -> None:
        self.closed = True


@pytest.mark.anyio
async def test_maps_current_competition_teams_matches_and_total_standings() -> None:
    client = StubClient(
        {
            "/competitions/2021": [league_payload()],
            "/competitions/2021/teams": [{"teams": [team_payload(1, "Home")]}],
            "/competitions/2021/matches": [{"matches": [match_payload(status="FINISHED")]}],
            "/competitions/2021/standings": [standings_payload()],
        }
    )
    provider = FootballDataProvider(client)  # type: ignore[arg-type]

    league = await provider.list_leagues(LeagueQuery(external_id="2021", current_only=True))
    teams = await provider.list_teams(TeamQuery(league_external_id="2021", season=2026))
    fixtures = await provider.list_fixtures(FixtureQuery(league_external_id="2021", season=2026))
    standings = await provider.get_standings(
        ProviderRef(provider="football_data", external_id="2021"),
        2026,
    )

    assert league.items[0].seasons[0].year == 2026
    assert league.items[0].seasons[0].is_current is True
    assert len(league.items[0].seasons) == 1
    assert league.items[0].seasons[0].coverage.standings is True
    assert teams.items[0].country and teams.items[0].country.code == "ENG"
    assert fixtures.items[0].status == FixtureStatus.FINISHED
    assert fixtures.items[0].score.fulltime_home == 2
    assert fixtures.items[0].referee == "Main Referee"
    assert len(standings.items) == 1
    assert standings.items[0].entries[0].goal_difference == 4


@pytest.mark.anyio
async def test_live_discovery_aggregates_competitions_and_metadata() -> None:
    client = StubClient(
        {
            "/competitions/2021/matches": [{"matches": [match_payload(status="IN_PLAY")]}],
            "/competitions/2014/matches": [
                {
                    "matches": [
                        {
                            **match_payload(match_id=200, status="IN_PLAY"),
                            "competition": {"id": 2014},
                        }
                    ]
                }
            ],
        }
    )
    provider = FootballDataProvider(client)  # type: ignore[arg-type]

    response = await provider.list_live_fixtures(
        LiveFixtureQuery(league_external_ids=("2021", "2014"))
    )

    assert len(response.items) == 2
    assert all(item.status == FixtureStatus.LIVE for item in response.items)
    assert response.metadata.external_requests == 2
    assert [call[1]["params"] for call in client.calls] == [
        {"status": "LIVE"},
        {"status": "LIVE"},
    ]


@pytest.mark.anyio
async def test_free_adapter_rejects_unavailable_deep_data_without_http() -> None:
    client = StubClient({})
    provider = FootballDataProvider(client)  # type: ignore[arg-type]

    with pytest.raises(UnsupportedCapabilityError):
        await provider.get_fixture_events(ProviderRef(provider="football_data", external_id="100"))

    assert client.calls == []
    assert ProviderCapability.EVENTS not in provider.capabilities
    assert ProviderCapability.PREMATCH_ODDS not in provider.capabilities


@pytest.mark.anyio
async def test_factory_installs_football_data_adapter_and_requires_key() -> None:
    with pytest.raises(ProviderConfigurationError, match="FOOTBALL_DATA_API_KEY"):
        build_sports_data_provider(
            Settings(sports_data_provider="football_data", football_data_api_key=None)
        )

    provider = build_sports_data_provider(
        Settings(
            environment="test",
            sports_data_provider="football_data",
            football_data_api_key="server-key",
            upstash_redis_rest_url=None,
            upstash_redis_rest_token=None,
        )
    )
    try:
        assert isinstance(provider, FootballDataProvider)
    finally:
        await provider.close()
