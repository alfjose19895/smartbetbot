from __future__ import annotations

import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.domain.sports import (
    Bookmaker,
    Country,
    Coverage,
    Fixture,
    FixtureEvent,
    FixtureEventType,
    FixtureInjury,
    FixtureScore,
    FixtureStatistics,
    FixtureStatus,
    League,
    LeagueType,
    LineupPlayer,
    OddsMarket,
    OddsPhase,
    OddsQuote,
    OddsSelection,
    Person,
    ProviderPrediction,
    ProviderRef,
    Season,
    StandingEntry,
    StandingsTable,
    Team,
    TeamLineup,
    TeamSeasonStatistics,
    TeamSummary,
    Venue,
)
from app.providers.sports.api_football.schemas import (
    ApiFixtureEventPayload,
    ApiFixtureLineupPayload,
    ApiFixturePayload,
    ApiFixtureStatisticsPayload,
    ApiIdentity,
    ApiInjuryPayload,
    ApiLeaguePayload,
    ApiLineupPlayer,
    ApiOddsPayload,
    ApiPerson,
    ApiPredictionPayload,
    ApiStandingsPayload,
    ApiTeamPayload,
    ApiTeamStatisticsPayload,
    ApiVenue,
)

PROVIDER = "api_football"

_STATUS_MAP = {
    "TBD": FixtureStatus.SCHEDULED,
    "NS": FixtureStatus.SCHEDULED,
    "1H": FixtureStatus.LIVE,
    "2H": FixtureStatus.LIVE,
    "ET": FixtureStatus.LIVE,
    "BT": FixtureStatus.LIVE,
    "P": FixtureStatus.LIVE,
    "LIVE": FixtureStatus.LIVE,
    "HT": FixtureStatus.HALFTIME,
    "FT": FixtureStatus.FINISHED,
    "AET": FixtureStatus.FINISHED,
    "PEN": FixtureStatus.FINISHED,
    "AWD": FixtureStatus.FINISHED,
    "WO": FixtureStatus.FINISHED,
    "PST": FixtureStatus.POSTPONED,
    "SUSP": FixtureStatus.POSTPONED,
    "INT": FixtureStatus.POSTPONED,
    "CANC": FixtureStatus.CANCELLED,
    "ABD": FixtureStatus.ABANDONED,
}

_MARKET_NAMES = {
    "match winner": "match_winner",
    "1x2": "match_winner",
    "home/away": "moneyline_12",
    "goals over/under": "total_goals",
    "over/under": "total_goals",
    "asian handicap": "asian_handicap",
    "both teams score": "both_teams_to_score",
    "both teams to score": "both_teams_to_score",
    "double chance": "double_chance",
    "next goal": "next_goal",
}

_SELECTION_NAMES = {
    "home": "home",
    "draw": "draw",
    "away": "away",
    "yes": "yes",
    "no": "no",
    "over": "over",
    "under": "under",
    "1x": "1x",
    "x2": "x2",
    "no goal": "no_goal",
}


def ref(external_id: int | str) -> ProviderRef:
    return ProviderRef(provider=PROVIDER, external_id=str(external_id))


def _url(value: str | None) -> str | None:
    return value if value and value.startswith(("http://", "https://")) else None


def _country(name: str | None, code: str | None, flag: str | None = None) -> Country | None:
    if not name or not code:
        return None
    return Country(name=name, code=code, flag_url=_url(flag))


def _venue(value: ApiVenue | None) -> Venue | None:
    if value is None or not any((value.id, value.name, value.city, value.address)):
        return None
    return Venue(
        ref=ref(value.id) if value.id is not None else None,
        name=value.name,
        city=value.city,
        address=value.address,
        capacity=value.capacity if value.capacity is None or value.capacity >= 0 else None,
        surface=value.surface,
    )


def _coverage(value: dict[str, Any]) -> Coverage:
    fixtures = value.get("fixtures") if isinstance(value.get("fixtures"), dict) else {}
    return Coverage(
        events=bool(fixtures.get("events")),
        lineups=bool(fixtures.get("lineups")),
        fixture_statistics=bool(fixtures.get("statistics_fixtures")),
        player_statistics=bool(fixtures.get("statistics_players")),
        standings=bool(value.get("standings")),
        predictions=bool(value.get("predictions")),
        odds=bool(value.get("odds")),
        injuries=bool(value.get("injuries")),
    )


def map_league(payload: dict[str, Any]) -> League:
    value = ApiLeaguePayload.model_validate(payload)
    type_name = (value.league.type or "").lower()
    league_type = {
        "league": LeagueType.LEAGUE,
        "cup": LeagueType.CUP,
        "friendly": LeagueType.FRIENDLY,
    }.get(type_name, LeagueType.UNKNOWN)
    country = value.country
    return League(
        ref=ref(value.league.id),
        name=value.league.name,
        league_type=league_type,
        country=(
            _country(country.name, country.code, country.flag) if country is not None else None
        ),
        logo_url=_url(value.league.logo),
        seasons=tuple(
            Season(
                year=season.year,
                starts_on=season.start,
                ends_on=season.end,
                is_current=season.current,
                coverage=_coverage(season.coverage),
            )
            for season in value.seasons
        ),
    )


def map_team(payload: dict[str, Any], country_code: str | None = None) -> Team:
    value = ApiTeamPayload.model_validate(payload)
    return Team(
        ref=ref(value.team.id),
        name=value.team.name,
        code=value.team.code,
        country=_country(value.team.country, country_code),
        logo_url=_url(value.team.logo),
        founded_year=value.team.founded,
        venue=_venue(value.venue),
    )


def _team_summary(value: ApiIdentity) -> TeamSummary:
    return TeamSummary(ref=ref(value.id), name=value.name, logo_url=_url(value.logo))


def _score_pair(pair: Any, side: str) -> int | None:
    return getattr(pair, side, None) if pair is not None else None


def map_fixture(payload: dict[str, Any], captured_at: datetime) -> Fixture:
    value = ApiFixturePayload.model_validate(payload)
    score = value.score
    return Fixture(
        ref=ref(value.fixture.id),
        league_ref=ref(value.league.id),
        season=value.league.season,
        kickoff_at=value.fixture.date,
        status=_STATUS_MAP.get(value.fixture.status.short.upper(), FixtureStatus.UNKNOWN),
        provider_status=value.fixture.status.short,
        home_team=_team_summary(value.teams.home),
        away_team=_team_summary(value.teams.away),
        score=FixtureScore(
            home=value.goals.home,
            away=value.goals.away,
            halftime_home=_score_pair(score.halftime, "home"),
            halftime_away=_score_pair(score.halftime, "away"),
            fulltime_home=_score_pair(score.fulltime, "home"),
            fulltime_away=_score_pair(score.fulltime, "away"),
            extra_time_home=_score_pair(score.extratime, "home"),
            extra_time_away=_score_pair(score.extratime, "away"),
            penalty_home=_score_pair(score.penalty, "home"),
            penalty_away=_score_pair(score.penalty, "away"),
        ),
        match_minute=value.fixture.status.elapsed,
        added_time=value.fixture.status.extra,
        round=value.league.round,
        referee=value.fixture.referee,
        venue=_venue(value.fixture.venue),
        last_updated_at=captured_at,
    )


def _person(value: ApiPerson | None) -> Person | None:
    if value is None or not value.name:
        return None
    return Person(ref=ref(value.id) if value.id is not None else None, name=value.name)


def map_fixture_event(payload: dict[str, Any], fixture_ref: ProviderRef) -> FixtureEvent:
    value = ApiFixtureEventPayload.model_validate(payload)
    event_type_name = (value.type or "").lower()
    detail = (value.detail or "").lower()
    if "penalty" in detail:
        event_type = FixtureEventType.PENALTY
    else:
        event_type = {
            "goal": FixtureEventType.GOAL,
            "card": FixtureEventType.CARD,
            "subst": FixtureEventType.SUBSTITUTION,
            "substitution": FixtureEventType.SUBSTITUTION,
            "var": FixtureEventType.VAR,
        }.get(event_type_name, FixtureEventType.OTHER)
    return FixtureEvent(
        fixture_ref=fixture_ref,
        event_type=event_type,
        detail=value.detail,
        team_ref=ref(value.team.id) if value.team else None,
        player=_person(value.player),
        assist=_person(value.assist),
        match_minute=value.time.elapsed,
        extra_minute=value.time.extra,
        comments=value.comments,
    )


def _number(value: Any, *, percentage: bool = False) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        candidate = value.strip().removesuffix("%") if percentage else value.strip()
        try:
            parsed = float(candidate)
        except ValueError:
            return None
        return int(parsed) if parsed.is_integer() else parsed
    return None


def map_fixture_statistics(
    payload: dict[str, Any], fixture_ref: ProviderRef, captured_at: datetime
) -> FixtureStatistics:
    value = ApiFixtureStatisticsPayload.model_validate(payload)
    statistics = {entry.type: entry.value for entry in value.statistics}
    known = {
        "shots": "Total Shots",
        "shots_on_target": "Shots on Goal",
        "shots_off_target": "Shots off Goal",
        "blocked_shots": "Blocked Shots",
        "possession": "Ball Possession",
        "corners": "Corner Kicks",
        "fouls": "Fouls",
        "yellow_cards": "Yellow Cards",
        "red_cards": "Red Cards",
        "goalkeeper_saves": "Goalkeeper Saves",
        "passes_total": "Total passes",
        "passes_accurate": "Passes accurate",
        "attacks": "Attacks",
        "dangerous_attacks": "Dangerous Attacks",
    }
    converted = {
        field: _number(statistics.get(label), percentage=field == "possession")
        for field, label in known.items()
    }
    extras: dict[str, int | float | str | None] = {}
    for key, raw_value in statistics.items():
        if key in known.values():
            continue
        normalized = re.sub(r"[^a-z0-9]+", "_", key.lower()).strip("_")
        extras[normalized] = raw_value if isinstance(raw_value, (int, float, str)) else None
    return FixtureStatistics(
        fixture_ref=fixture_ref,
        team_ref=ref(value.team.id),
        captured_at=captured_at,
        extras=extras,
        **converted,
    )


def _lineup_player(value: ApiLineupPlayer) -> LineupPlayer | None:
    person = _person(value.player)
    if person is None:
        return None
    return LineupPlayer(
        player=person,
        number=value.player.number,
        position=value.player.pos,
        grid=value.player.grid,
    )


def map_fixture_lineup(
    payload: dict[str, Any], fixture_ref: ProviderRef, captured_at: datetime
) -> TeamLineup:
    value = ApiFixtureLineupPayload.model_validate(payload)
    starting = tuple(
        player for entry in value.startXI if (player := _lineup_player(entry)) is not None
    )
    substitutes = tuple(
        player for entry in value.substitutes if (player := _lineup_player(entry)) is not None
    )
    return TeamLineup(
        fixture_ref=fixture_ref,
        team=_team_summary(value.team),
        formation=value.formation,
        coach=_person(value.coach),
        starting_xi=starting,
        substitutes=substitutes,
        confirmed_at=captured_at,
    )


def map_fixture_injury(payload: dict[str, Any], captured_at: datetime) -> FixtureInjury:
    value = ApiInjuryPayload.model_validate(payload)
    return FixtureInjury(
        fixture_ref=ref(value.fixture.id),
        team_ref=ref(value.team.id),
        player=Person(
            ref=ref(value.player.id) if value.player.id is not None else None,
            name=value.player.name,
        ),
        injury_type=value.player.type,
        reason=value.player.reason,
        captured_at=captured_at,
    )


def map_standings(payload: dict[str, Any], captured_at: datetime) -> tuple[StandingsTable, ...]:
    value = ApiStandingsPayload.model_validate(payload)
    tables: list[StandingsTable] = []
    for table in value.league.standings:
        if not table:
            continue
        entries = tuple(
            StandingEntry(
                rank=entry.rank,
                team=_team_summary(entry.team),
                points=entry.points,
                played=entry.all.played,
                wins=entry.all.win,
                draws=entry.all.draw,
                losses=entry.all.lose,
                goals_for=entry.all.goals.for_,
                goals_against=entry.all.goals.against,
                goal_difference=entry.goalsDiff,
                form=entry.form,
                description=entry.description,
            )
            for entry in table
        )
        tables.append(
            StandingsTable(
                league_ref=ref(value.league.id),
                season=value.league.season,
                group=table[0].group,
                entries=entries,
                captured_at=captured_at,
            )
        )
    return tuple(tables)


def _decimal(value: Any) -> Decimal | None:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed if parsed > 1 else None


def _captured_at(value: Any, fallback: datetime) -> datetime:
    if not isinstance(value, str):
        return fallback
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return fallback
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _line_from_selection(name: str, explicit: Any = None) -> Decimal | None:
    candidates = [explicit] if explicit is not None else re.findall(r"[-+]?\d+(?:\.\d+)?", name)
    if not candidates:
        return None
    try:
        return Decimal(str(candidates[-1]))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _canonical_selection(name: str) -> str | None:
    lowered = name.lower().strip()
    for prefix, canonical in _SELECTION_NAMES.items():
        if lowered == prefix or lowered.startswith(prefix + " "):
            return canonical
    return None


def map_odds(
    payload: dict[str, Any], phase: OddsPhase, captured_at: datetime
) -> tuple[OddsQuote, ...]:
    payload = ApiOddsPayload.model_validate(payload).model_dump(mode="python")
    fixture = payload.get("fixture")
    if not isinstance(fixture, dict) or fixture.get("id") is None:
        raise ValueError("Odds payload has no fixture identifier")
    fixture_ref = ref(fixture["id"])
    observed_at = _captured_at(payload.get("update"), captured_at)
    quotes: list[OddsQuote] = []

    bookmaker_payloads = payload.get("bookmakers")
    if not isinstance(bookmaker_payloads, list) or not bookmaker_payloads:
        bookmaker_value = payload.get("bookmaker")
        if isinstance(bookmaker_value, dict):
            bookmaker_payloads = [{**bookmaker_value, "bets": payload.get("odds", [])}]
        else:
            bookmaker_payloads = [
                {
                    "id": "live_feed",
                    "name": "API-Football Live feed",
                    "bets": payload.get("odds", []),
                }
            ]

    for bookmaker_payload in bookmaker_payloads:
        if not isinstance(bookmaker_payload, dict):
            continue
        bookmaker_id = bookmaker_payload.get("id", "live_feed")
        bookmaker_name = bookmaker_payload.get("name") or "API-Football Live feed"
        bookmaker = Bookmaker(ref=ref(bookmaker_id), name=str(bookmaker_name))
        bets = bookmaker_payload.get("bets", bookmaker_payload.get("odds", []))
        if not isinstance(bets, list):
            continue
        for bet in bets:
            if not isinstance(bet, dict) or not bet.get("name"):
                continue
            market_name = str(bet["name"])
            market_id = bet.get("id")
            market = OddsMarket(
                ref=ref(market_id) if market_id is not None else None,
                name=market_name,
                canonical_name=_MARKET_NAMES.get(market_name.lower()),
            )
            values = bet.get("values", [])
            if not isinstance(values, list):
                continue
            for selection_payload in values:
                if not isinstance(selection_payload, dict) or not selection_payload.get("value"):
                    continue
                odds_value = _decimal(selection_payload.get("odd"))
                if odds_value is None:
                    continue
                selection_name = str(selection_payload["value"])
                selection_id = selection_payload.get("id")
                live_status = payload.get("status")
                live_betting_stopped = bool(
                    isinstance(live_status, dict)
                    and any(live_status.get(flag) for flag in ("stopped", "blocked", "finished"))
                )
                quotes.append(
                    OddsQuote(
                        fixture_ref=fixture_ref,
                        bookmaker=bookmaker,
                        market=market,
                        selection=OddsSelection(
                            ref=ref(selection_id) if selection_id is not None else None,
                            name=selection_name,
                            canonical_name=_canonical_selection(selection_name),
                        ),
                        phase=phase,
                        decimal_odds=odds_value,
                        captured_at=observed_at,
                        line=_line_from_selection(
                            selection_name, selection_payload.get("handicap")
                        ),
                        match_minute=(
                            fixture.get("status", {}).get("elapsed")
                            if isinstance(fixture.get("status"), dict)
                            else None
                        ),
                        stopped=bool(selection_payload.get("suspended") or live_betting_stopped),
                    )
                )
    return tuple(quotes)


def _probability(value: Any) -> float | None:
    parsed = _number(value, percentage=True)
    if parsed is None:
        return None
    return min(1.0, max(0.0, float(parsed) / 100))


def map_prediction(
    payload: dict[str, Any], fixture_ref: ProviderRef, captured_at: datetime
) -> ProviderPrediction:
    value = ApiPredictionPayload.model_validate(payload)
    probabilities = value.predictions.percent
    winner = value.predictions.winner
    return ProviderPrediction(
        fixture_ref=fixture_ref,
        home_win_probability=_probability(probabilities.get("home")),
        draw_probability=_probability(probabilities.get("draw")),
        away_win_probability=_probability(probabilities.get("away")),
        predicted_winner_ref=ref(winner.id) if winner and winner.id is not None else None,
        advice=value.predictions.advice,
        generated_at=captured_at,
        supplementary_only=True,
    )


def _flatten_scalars(value: Any, *, prefix: str = "") -> dict[str, int | float | str | None]:
    flattened: dict[str, int | float | str | None] = {}
    if isinstance(value, dict):
        for key, nested in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            flattened.update(_flatten_scalars(nested, prefix=path))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            path = f"{prefix}.{index}" if prefix else str(index)
            flattened.update(_flatten_scalars(nested, prefix=path))
    elif value is None or isinstance(value, (int, float, str)):
        flattened[prefix] = value
    return flattened


def map_team_statistics(
    payload: dict[str, Any], *, season: int, captured_at: datetime
) -> TeamSeasonStatistics:
    value = ApiTeamStatisticsPayload.model_validate(payload)
    normalized_payload = value.model_dump(mode="json", by_alias=True)
    normalized_payload.pop("league", None)
    normalized_payload.pop("team", None)
    return TeamSeasonStatistics(
        league_ref=ref(value.league.id),
        team_ref=ref(value.team.id),
        season=season,
        captured_at=captured_at,
        metrics=_flatten_scalars(normalized_payload),
    )
