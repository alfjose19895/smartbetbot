from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.domain.sports import FixtureEventType, FixtureStatus, LeagueType, OddsPhase
from app.providers.sports.api_football.mappers import (
    map_fixture,
    map_fixture_event,
    map_fixture_injury,
    map_fixture_lineup,
    map_fixture_statistics,
    map_league,
    map_odds,
    map_prediction,
    map_standings,
    map_team,
    map_team_statistics,
    ref,
)

CAPTURED_AT = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


def fixture_payload(*, status: str = "2H") -> dict[str, object]:
    return {
        "fixture": {
            "id": 123,
            "referee": "A. Referee",
            "date": "2026-08-25T10:00:00+00:00",
            "venue": {"id": 8, "name": "Main Stadium", "city": "Quito"},
            "status": {"long": "Second Half", "short": status, "elapsed": 67, "extra": 2},
        },
        "league": {
            "id": 39,
            "name": "Premier League",
            "type": "League",
            "season": 2026,
            "round": "Regular Season - 2",
        },
        "teams": {
            "home": {"id": 1, "name": "Home", "logo": "https://img.test/home.png"},
            "away": {"id": 2, "name": "Away", "logo": "https://img.test/away.png"},
        },
        "goals": {"home": 2, "away": 1},
        "score": {
            "halftime": {"home": 1, "away": 0},
            "fulltime": {"home": None, "away": None},
            "extratime": {"home": None, "away": None},
            "penalty": {"home": None, "away": None},
        },
    }


def test_maps_league_seasons_coverage_and_team_venue() -> None:
    league = map_league(
        {
            "league": {
                "id": 39,
                "name": "Premier League",
                "type": "League",
                "logo": "https://img.test/league.png",
            },
            "country": {"name": "England", "code": "GB-ENG", "flag": None},
            "seasons": [
                {
                    "year": 2026,
                    "start": "2026-08-01",
                    "end": "2027-05-30",
                    "current": True,
                    "coverage": {
                        "fixtures": {
                            "events": True,
                            "lineups": True,
                            "statistics_fixtures": True,
                            "statistics_players": False,
                        },
                        "standings": True,
                        "predictions": True,
                        "odds": True,
                        "injuries": True,
                    },
                }
            ],
        }
    )
    team = map_team(
        {
            "team": {
                "id": 33,
                "name": "Manchester United",
                "code": "MUN",
                "country": "England",
                "founded": 1878,
                "logo": None,
            },
            "venue": {"id": 556, "name": "Old Trafford", "capacity": 76212},
        },
        "GB-ENG",
    )

    assert league.league_type == LeagueType.LEAGUE
    assert league.country and league.country.code == "GB-ENG"
    assert league.seasons[0].coverage.fixture_statistics is True
    assert league.seasons[0].coverage.player_statistics is False
    assert league.seasons[0].coverage.injuries is True
    assert team.ref.external_id == "33"
    assert team.country and team.country.code == "GB-ENG"
    assert team.venue and team.venue.capacity == 76212


def test_maps_live_fixture_without_losing_partial_scores() -> None:
    fixture = map_fixture(fixture_payload(), CAPTURED_AT)

    assert fixture.status == FixtureStatus.LIVE
    assert fixture.match_minute == 67
    assert fixture.score.home == 2
    assert fixture.score.halftime_away == 0
    assert fixture.score.fulltime_home is None
    assert fixture.last_updated_at == CAPTURED_AT


def test_maps_event_types_and_nullable_statistics() -> None:
    event = map_fixture_event(
        {
            "time": {"elapsed": 45, "extra": 3},
            "team": {"id": 1, "name": "Home"},
            "player": {"id": 9, "name": "Forward"},
            "assist": {"id": 10, "name": "Winger"},
            "type": "Goal",
            "detail": "Penalty",
        },
        ref(123),
    )
    statistics = map_fixture_statistics(
        {
            "team": {"id": 1, "name": "Home"},
            "statistics": [
                {"type": "Shots on Goal", "value": 5},
                {"type": "Ball Possession", "value": "61%"},
                {"type": "Red Cards", "value": None},
                {"type": "expected_goals", "value": "1.72"},
            ],
        },
        ref(123),
        CAPTURED_AT,
    )

    assert event.event_type == FixtureEventType.PENALTY
    assert event.extra_minute == 3
    assert statistics.shots_on_target == 5
    assert statistics.possession == 61
    assert statistics.red_cards is None
    assert statistics.extras["expected_goals"] == "1.72"


def test_maps_lineups_and_grouped_standings() -> None:
    lineup = map_fixture_lineup(
        {
            "team": {"id": 1, "name": "Home"},
            "formation": "4-3-3",
            "coach": {"id": 90, "name": "Coach"},
            "startXI": [{"player": {"id": 11, "name": "Goalkeeper", "number": 1, "pos": "G"}}],
            "substitutes": [{"player": {"id": 12, "name": "Substitute", "number": 20, "pos": "M"}}],
        },
        ref(123),
        CAPTURED_AT,
    )
    tables = map_standings(
        {
            "league": {
                "id": 39,
                "name": "Premier League",
                "season": 2026,
                "standings": [
                    [
                        {
                            "rank": 1,
                            "team": {"id": 1, "name": "Home"},
                            "points": 6,
                            "goalsDiff": 4,
                            "group": "Premier League",
                            "form": "WW",
                            "all": {
                                "played": 2,
                                "win": 2,
                                "draw": 0,
                                "lose": 0,
                                "goals": {"for": 5, "against": 1},
                            },
                        }
                    ]
                ],
            }
        },
        CAPTURED_AT,
    )

    assert lineup.formation == "4-3-3"
    assert lineup.starting_xi[0].player.name == "Goalkeeper"
    assert tables[0].entries[0].goal_difference == 4
    assert tables[0].entries[0].goals_for == 5


def test_maps_fixture_injury_without_provider_payload_leakage() -> None:
    injury = map_fixture_injury(
        {
            "player": {
                "id": 9,
                "name": "Forward",
                "type": "Missing Fixture",
                "reason": "Hamstring",
                "photo": "https://ignored.test/player.png",
            },
            "team": {"id": 1, "name": "Home"},
            "fixture": {"id": 123, "date": "2026-08-25T10:00:00+00:00"},
        },
        CAPTURED_AT,
    )

    assert injury.fixture_ref.external_id == "123"
    assert injury.team_ref.external_id == "1"
    assert injury.player.ref and injury.player.ref.external_id == "9"
    assert injury.reason == "Hamstring"
    assert injury.captured_at == CAPTURED_AT


def test_maps_prematch_and_live_odds_shapes() -> None:
    prematch = map_odds(
        {
            "fixture": {"id": 123},
            "update": "2026-08-25T11:55:00+00:00",
            "bookmakers": [
                {
                    "id": 6,
                    "name": "Bookmaker",
                    "bets": [
                        {
                            "id": 999,
                            "name": "Exact Goals Number",
                            "values": [{"value": 0, "odd": "6.00"}],
                        },
                        {
                            "id": 5,
                            "name": "Goals Over/Under",
                            "values": [{"value": "Over 2.5", "odd": "1.90"}],
                        },
                    ],
                }
            ],
        },
        OddsPhase.PREMATCH,
        CAPTURED_AT,
    )
    live = map_odds(
        {
            "fixture": {"id": 123, "status": {"elapsed": 70}},
            "status": {"stopped": True},
            "odds": [
                {
                    "id": 1,
                    "name": "Match Winner",
                    "values": [{"value": "Home", "odd": "1.65", "suspended": False}],
                }
            ],
        },
        OddsPhase.LIVE,
        CAPTURED_AT,
    )

    assert len(prematch) == 1
    assert prematch[0].decimal_odds == Decimal("1.90")
    assert prematch[0].line == Decimal("2.5")
    assert prematch[0].market.canonical_name == "total_goals"
    assert live[0].bookmaker.ref.external_id == "live_feed"
    assert live[0].match_minute == 70
    assert live[0].stopped is True


def test_provider_prediction_is_explicitly_supplementary() -> None:
    prediction = map_prediction(
        {
            "predictions": {
                "winner": {"id": 1, "name": "Home"},
                "advice": "Double chance",
                "percent": {"home": "55%", "draw": "25%", "away": "20%"},
            },
            "teams": {
                "home": {"id": 1, "name": "Home"},
                "away": {"id": 2, "name": "Away"},
            },
        },
        ref(123),
        CAPTURED_AT,
    )

    assert prediction.home_win_probability == 0.55
    assert prediction.draw_probability == 0.25
    assert prediction.supplementary_only is True


def test_team_statistics_are_flattened_for_feature_storage() -> None:
    statistics = map_team_statistics(
        {
            "league": {"id": 39, "name": "Premier League"},
            "team": {"id": 1, "name": "Home"},
            "form": "WWD",
            "fixtures": {"played": {"home": 3, "away": 2, "total": 5}},
            "goals": {"for": {"total": {"home": 7, "away": 3, "total": 10}}},
        },
        season=2026,
        captured_at=CAPTURED_AT,
    )

    assert statistics.metrics["fixtures.played.total"] == 5
    assert statistics.metrics["goals.for.total.total"] == 10
    assert statistics.metrics["form"] == "WWD"
