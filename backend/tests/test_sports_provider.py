from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import Settings
from app.domain.sports import (
    Fixture,
    FixtureQuery,
    FixtureStatus,
    LeagueQuery,
    LiveFixtureQuery,
    OddsPhase,
    OddsQuery,
    ProviderCapability,
    ProviderRef,
    TeamQuery,
    TeamSummary,
)
from app.providers.sports.api_football.provider import ApiFootballProvider
from app.providers.sports.base import SportsDataProvider
from app.providers.sports.errors import (
    ProviderConfigurationError,
    UnsupportedCapabilityError,
)
from app.providers.sports.factory import build_sports_data_provider
from app.providers.sports.mock import ControlledMockSportsDataProvider, MockSportsDataset
from app.providers.sports.registry import SportsDataProviderRegistry


def ref(external_id: str) -> ProviderRef:
    return ProviderRef(provider="mock", external_id=external_id)


def fixture(
    external_id: str,
    *,
    kickoff_at: datetime,
    status: FixtureStatus,
) -> Fixture:
    return Fixture(
        ref=ref(external_id),
        league_ref=ref("league-1"),
        season=2026,
        kickoff_at=kickoff_at,
        status=status,
        home_team=TeamSummary(ref=ref("team-1"), name="Home"),
        away_team=TeamSummary(ref=ref("team-2"), name="Away"),
    )


def test_abstract_provider_cannot_be_instantiated() -> None:
    with pytest.raises(TypeError):
        SportsDataProvider()  # type: ignore[abstract]


@pytest.mark.anyio
async def test_empty_mock_implements_every_contract_operation() -> None:
    provider = ControlledMockSportsDataProvider()
    fixture_ref = ref("fixture-1")
    league_ref = ref("league-1")
    team_ref = ref("team-1")

    responses = [
        await provider.list_leagues(LeagueQuery()),
        await provider.list_teams(TeamQuery()),
        await provider.list_fixtures(FixtureQuery()),
        await provider.list_live_fixtures(LiveFixtureQuery()),
        await provider.get_fixture_events(fixture_ref),
        await provider.get_fixture_statistics(fixture_ref),
        await provider.get_fixture_lineups(fixture_ref),
        await provider.get_standings(league_ref, 2026),
        await provider.get_odds(
            OddsQuery(fixture_external_ids=("fixture-1",), phase=OddsPhase.PREMATCH)
        ),
        await provider.get_prediction(fixture_ref),
        await provider.get_head_to_head(team_ref, ref("team-2")),
        await provider.get_team_season_statistics(league_ref, team_ref, 2026),
    ]

    assert provider.capabilities == frozenset(ProviderCapability)
    assert all(not response.items for response in responses)
    assert all(response.metadata.provider == "mock" for response in responses)
    assert all(response.metadata.external_requests == 0 for response in responses)


@pytest.mark.anyio
async def test_mock_filters_live_and_historical_fixtures_deterministically() -> None:
    now = datetime.now(UTC)
    dataset = MockSportsDataset(
        fixtures=(
            fixture(
                "finished-old", kickoff_at=now - timedelta(days=5), status=FixtureStatus.FINISHED
            ),
            fixture("live", kickoff_at=now - timedelta(minutes=30), status=FixtureStatus.LIVE),
            fixture(
                "scheduled", kickoff_at=now + timedelta(days=1), status=FixtureStatus.SCHEDULED
            ),
        )
    )
    provider = ControlledMockSportsDataProvider(dataset)

    live = await provider.list_live_fixtures(LiveFixtureQuery())
    historical = await provider.list_fixtures(
        FixtureQuery(statuses=(FixtureStatus.FINISHED,), last=1)
    )

    assert [item.ref.external_id for item in live.items] == ["live"]
    assert [item.ref.external_id for item in historical.items] == ["finished-old"]


def test_mock_provider_is_strictly_gated() -> None:
    with pytest.raises(ProviderConfigurationError, match="DEMO_MODE"):
        build_sports_data_provider(
            Settings(environment="development", sports_data_provider="mock", demo_mode=False)
        )
    with pytest.raises(ProviderConfigurationError, match="DEMO_MODE"):
        build_sports_data_provider(
            Settings.model_construct(
                environment="production",
                sports_data_provider="mock",
                demo_mode=True,
            )
        )

    provider = build_sports_data_provider(
        Settings(environment="test", sports_data_provider="mock", demo_mode=True)
    )
    assert provider.name == "mock"


def test_real_provider_requires_its_server_key() -> None:
    with pytest.raises(ProviderConfigurationError, match="API_FOOTBALL_KEY"):
        build_sports_data_provider(
            Settings(sports_data_provider="api_football", api_football_key=None)
        )


@pytest.mark.anyio
async def test_real_provider_factory_installs_api_football_adapter() -> None:
    provider = build_sports_data_provider(
        Settings(
            environment="test",
            sports_data_provider="api_football",
            api_football_key="server-key",
            upstash_redis_rest_url=None,
            upstash_redis_rest_token=None,
        )
    )
    try:
        assert isinstance(provider, ApiFootballProvider)
        assert provider.capabilities == frozenset(ProviderCapability)
    finally:
        await provider.close()


def test_registry_prevents_silent_adapter_replacement_or_name_mismatch() -> None:
    registry = SportsDataProviderRegistry()
    registry.register("mock", ControlledMockSportsDataProvider)
    assert registry.names == ("mock",)
    assert registry.create("MOCK").name == "mock"

    with pytest.raises(ProviderConfigurationError, match="already registered"):
        registry.register("mock", ControlledMockSportsDataProvider)

    registry.register("wrong", ControlledMockSportsDataProvider)
    with pytest.raises(ProviderConfigurationError, match="does not match"):
        registry.create("wrong")


def test_capability_guard_fails_before_an_external_call() -> None:
    provider = ControlledMockSportsDataProvider()
    provider._capabilities = frozenset({ProviderCapability.FIXTURES})

    with pytest.raises(UnsupportedCapabilityError) as captured:
        provider.require_capability(ProviderCapability.LIVE_ODDS)

    assert captured.value.retryable is False
    assert captured.value.operation == "live_odds"
