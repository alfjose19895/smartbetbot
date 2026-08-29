from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domain.sports import (
    Bookmaker,
    Fixture,
    FixtureQuery,
    FixtureStatus,
    OddsMarket,
    OddsPhase,
    OddsQuery,
    OddsQuote,
    OddsSelection,
    ProviderPrediction,
    ProviderRef,
    TeamSummary,
    provider_payload_schema,
)


def ref(external_id: str) -> ProviderRef:
    return ProviderRef(provider="mock", external_id=external_id)


def team(external_id: str, name: str) -> TeamSummary:
    return TeamSummary(ref=ref(external_id), name=name)


def test_fixture_requires_timezone_and_distinct_teams() -> None:
    with pytest.raises(ValidationError, match="timezone"):
        Fixture(
            ref=ref("fixture-1"),
            league_ref=ref("league-1"),
            season=2026,
            kickoff_at=datetime(2026, 8, 24, 20, 0),
            status=FixtureStatus.SCHEDULED,
            home_team=team("team-1", "Home"),
            away_team=team("team-2", "Away"),
        )

    with pytest.raises(ValidationError, match="must differ"):
        Fixture(
            ref=ref("fixture-1"),
            league_ref=ref("league-1"),
            season=2026,
            kickoff_at=datetime(2026, 8, 24, 20, 0, tzinfo=UTC),
            status=FixtureStatus.SCHEDULED,
            home_team=team("team-1", "Home"),
            away_team=team("team-1", "Home"),
        )


def test_fixture_query_rejects_ambiguous_or_invalid_windows() -> None:
    with pytest.raises(ValidationError, match="date_from"):
        FixtureQuery(date_from=date(2026, 8, 25), date_to=date(2026, 8, 24))
    with pytest.raises(ValidationError, match="cannot be combined"):
        FixtureQuery(last=5, next=5)
    with pytest.raises(ValidationError, match="must be unique"):
        FixtureQuery(fixture_external_ids=("1", "1"))
    with pytest.raises(ValidationError, match="at most 20"):
        FixtureQuery(fixture_external_ids=tuple(str(index) for index in range(21)))


def test_odds_require_decimal_prices_above_one() -> None:
    payload = {
        "fixture_ref": ref("fixture-1"),
        "bookmaker": Bookmaker(ref=ref("bookmaker-1"), name="Bookmaker"),
        "market": OddsMarket(name="Match winner", canonical_name="match_winner"),
        "selection": OddsSelection(name="Home", canonical_name="home"),
        "phase": OddsPhase.PREMATCH,
        "captured_at": datetime.now(UTC),
    }
    quote = OddsQuote(decimal_odds=Decimal("1.6500"), **payload)
    assert quote.decimal_odds == Decimal("1.6500")

    with pytest.raises(ValidationError, match="greater than 1"):
        OddsQuote(decimal_odds=Decimal("1.0"), **payload)


def test_provider_predictions_are_always_supplementary() -> None:
    prediction = ProviderPrediction(
        fixture_ref=ref("fixture-1"),
        home_win_probability=0.5,
        draw_probability=0.3,
        away_win_probability=0.2,
    )
    assert prediction.supplementary_only is True

    with pytest.raises(ValidationError):
        ProviderPrediction(fixture_ref=ref("fixture-1"), supplementary_only=False)


def test_normalized_schema_contains_no_adapter_payload_type() -> None:
    schema = provider_payload_schema()
    serialized = str(schema).lower()
    assert "api_football" not in serialized
    assert "response" not in schema["properties"]["items"]


def test_odds_query_requires_unique_fixture_ids() -> None:
    with pytest.raises(ValidationError, match="must be unique"):
        OddsQuery(fixture_external_ids=("1", "1"), phase=OddsPhase.LIVE)
