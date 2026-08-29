from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, date, datetime
from typing import Any

from app.domain.sports import (
    Country,
    Coverage,
    Fixture,
    FixtureScore,
    FixtureStatus,
    League,
    LeagueType,
    ProviderRef,
    Season,
    StandingEntry,
    StandingsTable,
    Team,
    TeamSummary,
    Venue,
)

PROVIDER = "football_data"


def ref(external_id: object) -> ProviderRef:
    return ProviderRef(provider=PROVIDER, external_id=str(external_id))


def _object(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _objects(value: object) -> tuple[Mapping[str, Any], ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, Mapping))


def _string(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _url(value: object) -> str | None:
    candidate = _string(value)
    return candidate if candidate and candidate.startswith(("https://", "http://")) else None


def _integer(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _non_negative(value: object) -> int | None:
    parsed = _integer(value)
    return parsed if parsed is not None and parsed >= 0 else None


def _bounded(value: object, maximum: int) -> int | None:
    parsed = _non_negative(value)
    return parsed if parsed is not None and parsed <= maximum else None


def _date(value: object) -> date | None:
    candidate = _string(value)
    if candidate is None:
        return None
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        return None


def _datetime(value: object) -> datetime | None:
    candidate = _string(value)
    if candidate is None:
        return None
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _season_year(payload: Mapping[str, Any]) -> int:
    start = _date(payload.get("startDate"))
    if start is not None:
        return start.year
    raw_year = _integer(payload.get("year"))
    if raw_year is not None:
        return raw_year
    raise ValueError("Season has no valid start year")


def map_country(payload: object) -> Country | None:
    area = _object(payload)
    name = _string(area.get("name"))
    code = _string(area.get("code"))
    if name is None or code is None:
        return None
    return Country(name=name, code=code, flag_url=_url(area.get("flag")))


def map_season(
    payload: Mapping[str, Any],
    *,
    current_id: int | None,
    current_year: int | None,
) -> Season:
    year = _season_year(payload)
    season_id = _integer(payload.get("id"))
    is_current = (current_id is not None and season_id == current_id) or (
        current_id is None and current_year == year
    )
    return Season(
        year=year,
        starts_on=_date(payload.get("startDate")),
        ends_on=_date(payload.get("endDate")),
        is_current=is_current,
        coverage=Coverage(standings=True),
    )


def map_league(payload: Mapping[str, Any]) -> League:
    current = _object(payload.get("currentSeason"))
    current_id = _integer(current.get("id"))
    current_year = _season_year(current) if current else None
    season_payloads = _objects(payload.get("seasons"))
    if not season_payloads and current:
        season_payloads = (current,)
    seasons = tuple(
        map_season(
            season,
            current_id=current_id,
            current_year=current_year,
        )
        for season in season_payloads
        if 1900 <= _season_year(season) <= 2200
    )
    raw_type = (_string(payload.get("type")) or "").upper()
    league_type = {
        "LEAGUE": LeagueType.LEAGUE,
        "CUP": LeagueType.CUP,
        "LEAGUE_CUP": LeagueType.CUP,
        "PLAYOFFS": LeagueType.CUP,
        "FRIENDLY": LeagueType.FRIENDLY,
    }.get(raw_type, LeagueType.UNKNOWN)
    return League(
        ref=ref(payload["id"]),
        name=str(payload["name"]),
        league_type=league_type,
        country=map_country(payload.get("area")),
        logo_url=_url(payload.get("emblem")),
        seasons=seasons,
    )


def map_team_summary(payload: object) -> TeamSummary:
    team = _object(payload)
    return TeamSummary(
        ref=ref(team["id"]),
        name=str(team["name"]),
        logo_url=_url(team.get("crest")),
    )


def map_team(payload: Mapping[str, Any]) -> Team:
    founded = _integer(payload.get("founded"))
    if founded is not None and not 1800 <= founded <= 2200:
        founded = None
    venue_name = _string(payload.get("venue"))
    return Team(
        ref=ref(payload["id"]),
        name=str(payload["name"]),
        code=_string(payload.get("tla")),
        country=map_country(payload.get("area")),
        logo_url=_url(payload.get("crest")),
        founded_year=founded,
        venue=Venue(name=venue_name) if venue_name else None,
    )


def _fixture_status(value: object) -> FixtureStatus:
    raw = (_string(value) or "").upper()
    return {
        "SCHEDULED": FixtureStatus.SCHEDULED,
        "TIMED": FixtureStatus.SCHEDULED,
        "IN_PLAY": FixtureStatus.LIVE,
        "PAUSED": FixtureStatus.HALFTIME,
        "FINISHED": FixtureStatus.FINISHED,
        "AWARDED": FixtureStatus.FINISHED,
        "SUSPENDED": FixtureStatus.POSTPONED,
        "POSTPONED": FixtureStatus.POSTPONED,
        "CANCELLED": FixtureStatus.CANCELLED,
    }.get(raw, FixtureStatus.UNKNOWN)


def _fixture_round(payload: Mapping[str, Any]) -> str | None:
    parts: list[str] = []
    stage = _string(payload.get("stage"))
    if stage:
        parts.append(stage.replace("_", " ").title())
    group = _string(payload.get("group"))
    if group:
        parts.append(group.replace("_", " ").title())
    matchday = _integer(payload.get("matchday"))
    if matchday is not None:
        parts.append(f"Matchday {matchday}")
    return " - ".join(parts) or None


def _main_referee(payload: Mapping[str, Any]) -> str | None:
    referees = _objects(payload.get("referees"))
    main = next(
        (
            referee
            for referee in referees
            if (_string(referee.get("type")) or "").upper() == "REFEREE"
        ),
        None,
    )
    return _string(main.get("name")) if main else None


def map_fixture(payload: Mapping[str, Any], observed_at: datetime) -> Fixture:
    score = _object(payload.get("score"))
    fulltime = _object(score.get("fullTime"))
    halftime = _object(score.get("halfTime"))
    extra = _object(score.get("extraTime"))
    penalties = _object(score.get("penalties"))
    status = _fixture_status(payload.get("status"))
    home_score = _non_negative(fulltime.get("home"))
    away_score = _non_negative(fulltime.get("away"))
    league = _object(payload.get("competition"))
    season = _object(payload.get("season"))
    kickoff_at = _datetime(payload.get("utcDate"))
    if kickoff_at is None:
        raise ValueError("Fixture has no valid utcDate")
    venue_name = _string(payload.get("venue"))
    return Fixture(
        ref=ref(payload["id"]),
        league_ref=ref(league["id"]),
        season=_season_year(season),
        kickoff_at=kickoff_at,
        status=status,
        provider_status=_string(payload.get("status")),
        home_team=map_team_summary(payload.get("homeTeam")),
        away_team=map_team_summary(payload.get("awayTeam")),
        score=FixtureScore(
            home=home_score,
            away=away_score,
            halftime_home=_non_negative(halftime.get("home")),
            halftime_away=_non_negative(halftime.get("away")),
            fulltime_home=home_score if status == FixtureStatus.FINISHED else None,
            fulltime_away=away_score if status == FixtureStatus.FINISHED else None,
            extra_time_home=_non_negative(extra.get("home")),
            extra_time_away=_non_negative(extra.get("away")),
            penalty_home=_non_negative(penalties.get("home")),
            penalty_away=_non_negative(penalties.get("away")),
        ),
        match_minute=_bounded(payload.get("minute"), 150),
        added_time=_bounded(payload.get("injuryTime"), 30),
        round=_fixture_round(payload),
        referee=_main_referee(payload),
        venue=Venue(name=venue_name) if venue_name else None,
        last_updated_at=_datetime(payload.get("lastUpdated")) or observed_at,
    )


def map_standings(
    payload: Mapping[str, Any],
    observed_at: datetime,
) -> tuple[StandingsTable, ...]:
    competition = _object(payload.get("competition"))
    season = _object(payload.get("season"))
    tables: list[StandingsTable] = []
    for standing in _objects(payload.get("standings")):
        if (_string(standing.get("type")) or "").upper() != "TOTAL":
            continue
        entries = tuple(
            StandingEntry(
                rank=int(entry["position"]),
                team=map_team_summary(entry.get("team")),
                points=int(entry.get("points") or 0),
                played=int(entry.get("playedGames") or 0),
                wins=int(entry.get("won") or 0),
                draws=int(entry.get("draw") or 0),
                losses=int(entry.get("lost") or 0),
                goals_for=int(entry.get("goalsFor") or 0),
                goals_against=int(entry.get("goalsAgainst") or 0),
                goal_difference=int(entry.get("goalDifference") or 0),
                form=_string(entry.get("form")),
            )
            for entry in _objects(standing.get("table"))
        )
        tables.append(
            StandingsTable(
                league_ref=ref(competition["id"]),
                season=_season_year(season),
                group=_string(standing.get("group")),
                entries=entries,
                captured_at=observed_at,
            )
        )
    return tuple(tables)
