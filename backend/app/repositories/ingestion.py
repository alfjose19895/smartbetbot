from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.domain.ingestion import (
    NormalizedOddsSnapshot,
    PreviousOddsSnapshot,
    StoredFixture,
    WorkerName,
)
from app.domain.sports import (
    Country,
    Fixture,
    FixtureEvent,
    FixtureInjury,
    FixtureStatistics,
    League,
    ProviderPrediction,
    ProviderRef,
    Season,
    StandingsTable,
    Team,
    TeamLineup,
    TeamSeasonStatistics,
    TeamSummary,
)


class IngestionDependencyError(RuntimeError):
    pass


def stable_fingerprint(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


def bucket_timestamp(value: datetime, seconds: int) -> datetime:
    utc_value = value.astimezone(UTC)
    epoch = int(utc_value.timestamp())
    return datetime.fromtimestamp(epoch - (epoch % seconds), tz=UTC)


class SportsIngestionRepository:
    """Short-transaction writer shared by prematch, live, and odds ingestion."""

    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    @staticmethod
    async def _sport_id(connection: AsyncConnection) -> int:
        result = await connection.execute(
            text(
                """
                insert into public.sports (name, slug, is_active)
                values ('Football', 'football', true)
                on conflict (slug) do update set is_active = true, updated_at = now()
                returning id
                """
            )
        )
        return int(result.scalar_one())

    @staticmethod
    async def _upsert_country(connection: AsyncConnection, country: Country | None) -> int | None:
        if country is None:
            return None
        result = await connection.execute(
            text(
                """
                insert into public.countries (name, code, flag_url)
                values (:name, :code, :flag_url)
                on conflict (name) do update
                set code = coalesce(excluded.code, public.countries.code),
                    flag_url = coalesce(excluded.flag_url, public.countries.flag_url),
                    updated_at = now()
                returning id
                """
            ),
            {
                "name": country.name,
                "code": country.code,
                "flag_url": str(country.flag_url) if country.flag_url else None,
            },
        )
        return int(result.scalar_one())

    @staticmethod
    async def _upsert_season(
        connection: AsyncConnection,
        league_id: UUID,
        season: Season,
        *,
        preserve_existing: bool = False,
    ) -> UUID:
        if season.is_current:
            await connection.execute(
                text(
                    """
                    update public.seasons
                    set is_current = false, updated_at = now()
                    where league_id = :league_id
                      and season_year <> :season_year
                      and is_current
                    """
                ),
                {"league_id": league_id, "season_year": season.year},
            )
        result = await connection.execute(
            text(
                """
                insert into public.seasons (
                  league_id, season_year, starts_on, ends_on, is_current, coverage
                ) values (
                  :league_id, :season_year, :starts_on, :ends_on, :is_current,
                  cast(:coverage as jsonb)
                )
                on conflict (league_id, season_year) do update
                set starts_on = case when :preserve_existing
                      then public.seasons.starts_on
                      else coalesce(excluded.starts_on, public.seasons.starts_on)
                    end,
                    ends_on = case when :preserve_existing
                      then public.seasons.ends_on
                      else coalesce(excluded.ends_on, public.seasons.ends_on)
                    end,
                    is_current = case when :preserve_existing
                      then public.seasons.is_current
                      else excluded.is_current
                    end,
                    coverage = case when :preserve_existing
                      then public.seasons.coverage
                      else excluded.coverage
                    end,
                    updated_at = now()
                returning id
                """
            ),
            {
                "league_id": league_id,
                "season_year": season.year,
                "starts_on": season.starts_on,
                "ends_on": season.ends_on,
                "is_current": season.is_current,
                "coverage": json.dumps(season.coverage.model_dump(mode="json")),
                "preserve_existing": preserve_existing,
            },
        )
        return UUID(str(result.scalar_one()))

    async def persist_league(self, league: League) -> UUID:
        async with self.engine.begin() as connection:
            sport_id = await self._sport_id(connection)
            country_id = await self._upsert_country(connection, league.country)
            current_season = next(
                (season for season in league.seasons if season.is_current),
                league.seasons[-1] if league.seasons else None,
            )
            coverage = current_season.coverage.model_dump(mode="json") if current_season else {}
            result = await connection.execute(
                text(
                    """
                    insert into public.leagues (
                      sport_id, country_id, provider, provider_id, name, league_type,
                      logo_url, coverage, is_active
                    ) values (
                      :sport_id, :country_id, :provider, :provider_id, :name, :league_type,
                      :logo_url, cast(:coverage as jsonb), true
                    )
                    on conflict (provider, provider_id) do update
                    set country_id = excluded.country_id,
                        name = excluded.name,
                        league_type = excluded.league_type,
                        logo_url = excluded.logo_url,
                        coverage = excluded.coverage,
                        is_active = true,
                        updated_at = now()
                    returning id
                    """
                ),
                {
                    "sport_id": sport_id,
                    "country_id": country_id,
                    "provider": league.ref.provider,
                    "provider_id": league.ref.external_id,
                    "name": league.name,
                    "league_type": league.league_type.value,
                    "logo_url": str(league.logo_url) if league.logo_url else None,
                    "coverage": json.dumps(coverage),
                },
            )
            league_id = UUID(str(result.scalar_one()))
            for season in league.seasons:
                await self._upsert_season(connection, league_id, season)
            return league_id

    async def persist_team(self, team: Team) -> UUID:
        async with self.engine.begin() as connection:
            country_id = await self._upsert_country(connection, team.country)
            return await self._upsert_team(connection, team, country_id=country_id)

    async def upsert_league(self, league: League, current_season: Season) -> int:
        await self.persist_league(
            league.model_copy(
                update={
                    "seasons": tuple(
                        season for season in league.seasons if season.year != current_season.year
                    )
                    + (current_season,)
                }
            )
        )
        return 1

    async def upsert_teams(
        self,
        league: League,
        current_season: Season,
        teams: tuple[Team, ...],
    ) -> int:
        del league, current_season
        for team in teams:
            await self.persist_team(team)
        return len(teams)

    async def upsert_fixtures(self, fixtures: tuple[Fixture, ...]) -> int:
        for fixture in fixtures:
            await self.persist_fixture(
                fixture,
                observed_at=fixture.last_updated_at or datetime.now(UTC),
            )
        return len(fixtures)

    async def store_standings(self, tables: tuple[StandingsTable, ...]) -> int:
        return sum([await self.persist_standings(table) for table in tables])

    async def store_team_statistics(self, statistics: tuple[TeamSeasonStatistics, ...]) -> int:
        return sum([await self.persist_team_statistics(snapshot) for snapshot in statistics])

    async def store_head_to_head(
        self,
        target_fixture: Fixture,
        meetings: tuple[Fixture, ...],
    ) -> int:
        del target_fixture
        written = 0
        for meeting in meetings:
            try:
                await self.persist_fixture(
                    meeting,
                    observed_at=meeting.last_updated_at or datetime.now(UTC),
                )
                written += 1
            except IngestionDependencyError:
                continue
        return written

    async def store_lineups(self, lineups: tuple[TeamLineup, ...]) -> int:
        return sum([await self.persist_lineup(lineup) for lineup in lineups])

    async def store_injuries(self, injuries: tuple[FixtureInjury, ...]) -> int:
        return sum([await self.persist_injury(injury) for injury in injuries])

    async def store_supplementary_predictions(
        self, predictions: tuple[ProviderPrediction, ...]
    ) -> int:
        return sum(
            [await self.persist_provider_prediction(prediction) for prediction in predictions]
        )

    @staticmethod
    async def _upsert_team(
        connection: AsyncConnection,
        team: Team | TeamSummary,
        *,
        country_id: int | None = None,
    ) -> UUID:
        is_full = isinstance(team, Team)
        venue = team.venue.model_dump(mode="json") if is_full and team.venue else {}
        raw_payload = team.model_dump(mode="json") if is_full else {}
        result = await connection.execute(
            text(
                """
                insert into public.teams (
                  country_id, provider, provider_id, name, code, logo_url,
                  founded_year, venue, raw_payload
                ) values (
                  :country_id, :provider, :provider_id, :name, :code, :logo_url,
                  :founded_year, cast(:venue as jsonb), cast(:raw_payload as jsonb)
                )
                on conflict (provider, provider_id) do update
                set country_id = coalesce(excluded.country_id, public.teams.country_id),
                    name = excluded.name,
                    code = coalesce(excluded.code, public.teams.code),
                    logo_url = coalesce(excluded.logo_url, public.teams.logo_url),
                    founded_year = coalesce(excluded.founded_year, public.teams.founded_year),
                    venue = case
                      when excluded.venue = '{}'::jsonb then public.teams.venue
                      else excluded.venue
                    end,
                    raw_payload = case
                      when excluded.raw_payload = '{}'::jsonb then public.teams.raw_payload
                      else excluded.raw_payload
                    end,
                    updated_at = now()
                returning id
                """
            ),
            {
                "country_id": country_id,
                "provider": team.ref.provider,
                "provider_id": team.ref.external_id,
                "name": team.name,
                "code": team.code if is_full else None,
                "logo_url": str(team.logo_url) if team.logo_url else None,
                "founded_year": team.founded_year if is_full else None,
                "venue": json.dumps(venue),
                "raw_payload": json.dumps(raw_payload),
            },
        )
        return UUID(str(result.scalar_one()))

    @staticmethod
    async def _league_id(connection: AsyncConnection, league_ref: ProviderRef) -> UUID:
        result = await connection.execute(
            text(
                """
                select id from public.leagues
                where provider = :provider and provider_id = :provider_id
                """
            ),
            {"provider": league_ref.provider, "provider_id": league_ref.external_id},
        )
        value = result.scalar_one_or_none()
        if value is None:
            raise IngestionDependencyError(
                f"League reference {league_ref.provider}:{league_ref.external_id} is not stored."
            )
        return UUID(str(value))

    async def persist_fixture(self, fixture: Fixture, *, observed_at: datetime) -> UUID:
        async with self.engine.begin() as connection:
            league_id = await self._league_id(connection, fixture.league_ref)
            season_id = await self._upsert_season(
                connection,
                league_id,
                Season(year=fixture.season),
                preserve_existing=True,
            )
            home_team_id = await self._upsert_team(connection, fixture.home_team)
            away_team_id = await self._upsert_team(connection, fixture.away_team)
            venue = fixture.venue.model_dump(mode="json") if fixture.venue else {}
            result = await connection.execute(
                text(
                    """
                    insert into public.fixtures (
                      league_id, season_id, home_team_id, away_team_id, provider, provider_id,
                      kickoff_at, status, provider_status, match_minute, added_time,
                      home_score, away_score, halftime_home_score, halftime_away_score,
                      round, referee, venue, raw_payload, last_synced_at
                    ) values (
                      :league_id, :season_id, :home_team_id, :away_team_id, :provider,
                      :provider_id, :kickoff_at, :status, :provider_status, :match_minute,
                      :added_time, :home_score, :away_score, :halftime_home_score,
                      :halftime_away_score, :round, :referee, cast(:venue as jsonb),
                      cast(:raw_payload as jsonb), :last_synced_at
                    )
                    on conflict (provider, provider_id) do update
                    set league_id = excluded.league_id,
                        season_id = excluded.season_id,
                        home_team_id = excluded.home_team_id,
                        away_team_id = excluded.away_team_id,
                        kickoff_at = excluded.kickoff_at,
                        status = case
                          when excluded.status = 'unknown' then public.fixtures.status
                          when public.fixtures.status in (
                            'finished', 'cancelled', 'abandoned'
                          ) and excluded.status not in (
                            'finished', 'cancelled', 'abandoned'
                          ) then public.fixtures.status
                          else excluded.status
                        end,
                        provider_status = coalesce(
                          excluded.provider_status, public.fixtures.provider_status
                        ),
                        match_minute = excluded.match_minute,
                        added_time = excluded.added_time,
                        home_score = excluded.home_score,
                        away_score = excluded.away_score,
                        halftime_home_score = excluded.halftime_home_score,
                        halftime_away_score = excluded.halftime_away_score,
                        round = excluded.round,
                        referee = excluded.referee,
                        venue = excluded.venue,
                        raw_payload = excluded.raw_payload,
                        last_synced_at = excluded.last_synced_at,
                        updated_at = now()
                    where public.fixtures.last_synced_at is null
                       or excluded.last_synced_at >= public.fixtures.last_synced_at
                    returning id
                    """
                ),
                {
                    "league_id": league_id,
                    "season_id": season_id,
                    "home_team_id": home_team_id,
                    "away_team_id": away_team_id,
                    "provider": fixture.ref.provider,
                    "provider_id": fixture.ref.external_id,
                    "kickoff_at": fixture.kickoff_at,
                    "status": fixture.status.value,
                    "provider_status": fixture.provider_status,
                    "match_minute": fixture.match_minute,
                    "added_time": fixture.added_time,
                    "home_score": fixture.score.home,
                    "away_score": fixture.score.away,
                    "halftime_home_score": fixture.score.halftime_home,
                    "halftime_away_score": fixture.score.halftime_away,
                    "round": fixture.round,
                    "referee": fixture.referee,
                    "venue": json.dumps(venue),
                    "raw_payload": json.dumps(fixture.model_dump(mode="json")),
                    "last_synced_at": observed_at,
                },
            )
            fixture_id = result.scalar_one_or_none()
            if fixture_id is None:
                existing = await connection.execute(
                    text(
                        """
                        select id from public.fixtures
                        where provider = :provider and provider_id = :provider_id
                        """
                    ),
                    {
                        "provider": fixture.ref.provider,
                        "provider_id": fixture.ref.external_id,
                    },
                )
                fixture_id = existing.scalar_one()
            return UUID(str(fixture_id))

    async def fixture_id_for_ref(self, fixture_ref: ProviderRef) -> UUID | None:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select id from public.fixtures
                    where provider = :provider and provider_id = :provider_id
                    """
                ),
                {"provider": fixture_ref.provider, "provider_id": fixture_ref.external_id},
            )
            value = result.scalar_one_or_none()
            return UUID(str(value)) if value is not None else None

    async def list_poll_candidates(
        self,
        *,
        now: datetime,
        warmup_minutes: int,
        stale_hours: int,
    ) -> tuple[StoredFixture, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select
                      f.id, f.provider, f.provider_id,
                      l.provider_id as league_provider_id,
                      ht.provider_id as home_team_provider_id,
                      at.provider_id as away_team_provider_id,
                      s.season_year as season, f.kickoff_at, f.status, f.match_minute
                    from public.fixtures f
                    join public.leagues l on l.id = f.league_id
                    join public.teams ht on ht.id = f.home_team_id
                    join public.teams at on at.id = f.away_team_id
                    left join public.seasons s on s.id = f.season_id
                    where f.status in ('live', 'halftime')
                       or (
                         f.status = 'scheduled'
                         and f.kickoff_at between :oldest and :warmup_until
                       )
                       or (
                         f.provider_status in ('SUSP', 'INT')
                         and f.last_synced_at >= :oldest
                       )
                    order by f.kickoff_at, f.id
                    """
                ),
                {
                    "oldest": now - timedelta(hours=stale_hours),
                    "warmup_until": now + timedelta(minutes=warmup_minutes),
                },
            )
            return tuple(StoredFixture.model_validate(dict(row)) for row in result.mappings())

    async def list_live_candidates(
        self,
        *,
        provider: str,
        now: datetime,
        lookback_seconds: int,
        lookahead_seconds: int,
    ) -> tuple[StoredFixture, ...]:
        candidates = await self.list_poll_candidates(
            now=now,
            warmup_minutes=max(1, (lookahead_seconds + 59) // 60),
            stale_hours=max(1, (lookback_seconds + 3599) // 3600),
        )
        return tuple(item for item in candidates if item.provider == provider)

    async def persist_live_fixture(
        self, fixture: Fixture, *, observed_at: datetime
    ) -> StoredFixture:
        fixture_id = await self.persist_fixture(fixture, observed_at=observed_at)
        return StoredFixture(
            id=fixture_id,
            provider=fixture.ref.provider,
            provider_id=fixture.ref.external_id,
            league_provider_id=fixture.league_ref.external_id,
            home_team_provider_id=fixture.home_team.ref.external_id,
            away_team_provider_id=fixture.away_team.ref.external_id,
            season=fixture.season,
            kickoff_at=fixture.kickoff_at,
            status=fixture.status.value,
            match_minute=fixture.match_minute,
        )

    async def persist_fixture_events(
        self,
        fixture: StoredFixture,
        events: tuple[FixtureEvent, ...],
        *,
        observed_at: datetime,
    ) -> int:
        del observed_at
        return await self.persist_events(fixture.id, events)

    async def persist_fixture_statistics(
        self,
        fixture: StoredFixture,
        statistics: tuple[FixtureStatistics, ...],
        *,
        captured_at: datetime,
    ) -> int:
        del captured_at
        return await self.persist_statistics(
            fixture.id,
            statistics,
            match_minute=fixture.match_minute,
        )

    async def list_active_odds_targets(self, *, limit: int = 20) -> tuple[StoredFixture, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select
                      f.id, f.provider, f.provider_id,
                      l.provider_id as league_provider_id,
                      ht.provider_id as home_team_provider_id,
                      at.provider_id as away_team_provider_id,
                      s.season_year as season, f.kickoff_at, f.status, f.match_minute
                    from public.fixtures f
                    join public.leagues l on l.id = f.league_id
                    join public.teams ht on ht.id = f.home_team_id
                    join public.teams at on at.id = f.away_team_id
                    left join public.seasons s on s.id = f.season_id
                    where f.status in ('live', 'halftime')
                    order by f.kickoff_at, f.id
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
            return tuple(StoredFixture.model_validate(dict(row)) for row in result.mappings())

    async def list_prematch_odds_targets(
        self,
        *,
        provider: str,
        league_provider_ids: tuple[str, ...],
        now: datetime,
        horizon_hours: int,
        limit: int,
    ) -> tuple[StoredFixture, ...]:
        if not league_provider_ids or limit <= 0:
            return ()
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select
                      f.id, f.provider, f.provider_id,
                      l.provider_id as league_provider_id,
                      ht.provider_id as home_team_provider_id,
                      at.provider_id as away_team_provider_id,
                      s.season_year as season, f.kickoff_at, f.status, f.match_minute
                    from public.fixtures f
                    join public.leagues l on l.id = f.league_id
                    join public.teams ht on ht.id = f.home_team_id
                    join public.teams at on at.id = f.away_team_id
                    left join public.seasons s on s.id = f.season_id
                    where f.provider = :provider
                      and l.provider_id = any(:league_provider_ids)
                      and f.status = 'scheduled'
                      and f.kickoff_at between :now and :horizon
                    order by f.kickoff_at, f.id
                    limit :limit
                    """
                ),
                {
                    "provider": provider,
                    "league_provider_ids": list(league_provider_ids),
                    "now": now,
                    "horizon": now + timedelta(hours=horizon_hours),
                    "limit": limit,
                },
            )
            return tuple(StoredFixture.model_validate(dict(row)) for row in result.mappings())

    async def persist_events(self, fixture_id: UUID, events: tuple[FixtureEvent, ...]) -> int:
        written = 0
        async with self.engine.begin() as connection:
            for event in events:
                identity = {
                    "fixture_id": str(fixture_id),
                    "event_ref": event.event_ref.external_id if event.event_ref else None,
                    "type": event.event_type.value,
                    "detail": event.detail,
                    "team": event.team_ref.external_id if event.team_ref else None,
                    "player": (
                        event.player.ref.external_id if event.player and event.player.ref else None
                    ),
                    "assist": (
                        event.assist.ref.external_id if event.assist and event.assist.ref else None
                    ),
                    "minute": event.match_minute,
                    "extra": event.extra_minute,
                }
                result = await connection.execute(
                    text(
                        """
                        insert into public.fixture_events (
                          fixture_id, team_id, fingerprint, provider_event_id, event_type,
                          detail, match_minute, extra_minute, player_provider_id,
                          player_name, assist_provider_id, assist_name, comments, raw_payload
                        ) values (
                          :fixture_id,
                          (select id from public.teams where provider = :team_provider
                           and provider_id = :team_provider_id),
                          :fingerprint, :provider_event_id, :event_type, :detail,
                          :match_minute, :extra_minute, :player_provider_id, :player_name,
                          :assist_provider_id, :assist_name, :comments,
                          cast(:raw_payload as jsonb)
                        )
                        on conflict (fixture_id, fingerprint) do update
                        set comments = excluded.comments,
                            raw_payload = excluded.raw_payload
                        returning id
                        """
                    ),
                    {
                        "fixture_id": fixture_id,
                        "team_provider": event.team_ref.provider if event.team_ref else None,
                        "team_provider_id": (
                            event.team_ref.external_id if event.team_ref else None
                        ),
                        "fingerprint": stable_fingerprint(identity),
                        "provider_event_id": (
                            event.event_ref.external_id if event.event_ref else None
                        ),
                        "event_type": event.event_type.value,
                        "detail": event.detail,
                        "match_minute": event.match_minute,
                        "extra_minute": event.extra_minute,
                        "player_provider_id": (
                            event.player.ref.external_id
                            if event.player and event.player.ref
                            else None
                        ),
                        "player_name": event.player.name if event.player else None,
                        "assist_provider_id": (
                            event.assist.ref.external_id
                            if event.assist and event.assist.ref
                            else None
                        ),
                        "assist_name": event.assist.name if event.assist else None,
                        "comments": event.comments,
                        "raw_payload": json.dumps(event.model_dump(mode="json")),
                    },
                )
                if result.scalar_one_or_none() is not None:
                    written += 1
            if written:
                await connection.execute(
                    text("update public.fixtures set has_events = true where id = :fixture_id"),
                    {"fixture_id": fixture_id},
                )
        return written

    async def persist_statistics(
        self,
        fixture_id: UUID,
        statistics: tuple[FixtureStatistics, ...],
        *,
        match_minute: int | None = None,
    ) -> int:
        written = 0
        async with self.engine.begin() as connection:
            for snapshot in statistics:
                captured_at = bucket_timestamp(snapshot.captured_at, 60)
                fingerprint = stable_fingerprint(
                    {
                        "fixture_id": str(fixture_id),
                        "team": snapshot.team_ref.model_dump(mode="json"),
                        "captured_at": captured_at.isoformat(),
                    }
                )
                result = await connection.execute(
                    text(
                        """
                        insert into public.fixture_stats_snapshots (
                          fixture_id, team_id, captured_at, match_minute, shots,
                          shots_on_target, shots_off_target, blocked_shots, possession,
                          corners, fouls, yellow_cards, red_cards, goalkeeper_saves,
                          passes_total, passes_accurate, attacks, dangerous_attacks,
                          raw_payload, fingerprint
                        ) values (
                          :fixture_id,
                          (select id from public.teams where provider = :team_provider
                           and provider_id = :team_provider_id),
                          :captured_at, :match_minute, :shots, :shots_on_target,
                          :shots_off_target, :blocked_shots, :possession, :corners,
                          :fouls, :yellow_cards, :red_cards, :goalkeeper_saves,
                          :passes_total, :passes_accurate, :attacks, :dangerous_attacks,
                          cast(:raw_payload as jsonb), :fingerprint
                        )
                        on conflict (fingerprint) do update
                        set match_minute = excluded.match_minute,
                            shots = excluded.shots,
                            shots_on_target = excluded.shots_on_target,
                            shots_off_target = excluded.shots_off_target,
                            blocked_shots = excluded.blocked_shots,
                            possession = excluded.possession,
                            corners = excluded.corners,
                            fouls = excluded.fouls,
                            yellow_cards = excluded.yellow_cards,
                            red_cards = excluded.red_cards,
                            goalkeeper_saves = excluded.goalkeeper_saves,
                            passes_total = excluded.passes_total,
                            passes_accurate = excluded.passes_accurate,
                            attacks = excluded.attacks,
                            dangerous_attacks = excluded.dangerous_attacks,
                            raw_payload = excluded.raw_payload
                        returning id
                        """
                    ),
                    {
                        "fixture_id": fixture_id,
                        "team_provider": snapshot.team_ref.provider,
                        "team_provider_id": snapshot.team_ref.external_id,
                        "captured_at": captured_at,
                        "match_minute": match_minute or snapshot.match_minute,
                        "shots": snapshot.shots,
                        "shots_on_target": snapshot.shots_on_target,
                        "shots_off_target": snapshot.shots_off_target,
                        "blocked_shots": snapshot.blocked_shots,
                        "possession": snapshot.possession,
                        "corners": snapshot.corners,
                        "fouls": snapshot.fouls,
                        "yellow_cards": snapshot.yellow_cards,
                        "red_cards": snapshot.red_cards,
                        "goalkeeper_saves": snapshot.goalkeeper_saves,
                        "passes_total": snapshot.passes_total,
                        "passes_accurate": snapshot.passes_accurate,
                        "attacks": snapshot.attacks,
                        "dangerous_attacks": snapshot.dangerous_attacks,
                        "raw_payload": json.dumps(snapshot.model_dump(mode="json")),
                        "fingerprint": fingerprint,
                    },
                )
                if result.scalar_one_or_none() is not None:
                    written += 1
            if written:
                await connection.execute(
                    text("update public.fixtures set has_statistics = true where id = :fixture_id"),
                    {"fixture_id": fixture_id},
                )
        return written

    async def persist_lineup(self, lineup: TeamLineup) -> bool:
        fixture_id = await self.fixture_id_for_ref(lineup.fixture_ref)
        if fixture_id is None:
            raise IngestionDependencyError("Cannot persist a lineup before its fixture.")
        observed_at = lineup.confirmed_at or datetime.now(UTC)
        payload = lineup.model_dump(mode="json")
        fingerprint = stable_fingerprint(
            {
                "fixture_id": str(fixture_id),
                "team": lineup.team.ref.model_dump(mode="json"),
                "lineup": payload,
            }
        )
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    insert into public.fixture_lineup_snapshots (
                      fixture_id, team_id, captured_at, formation, coach, starting_xi,
                      substitutes, fingerprint
                    ) values (
                      :fixture_id,
                      (select id from public.teams where provider = :team_provider
                       and provider_id = :team_provider_id),
                      :captured_at, :formation, cast(:coach as jsonb),
                      cast(:starting_xi as jsonb), cast(:substitutes as jsonb), :fingerprint
                    )
                    on conflict (fingerprint) do nothing
                    returning id
                    """
                ),
                {
                    "fixture_id": fixture_id,
                    "team_provider": lineup.team.ref.provider,
                    "team_provider_id": lineup.team.ref.external_id,
                    "captured_at": observed_at,
                    "formation": lineup.formation,
                    "coach": json.dumps(
                        lineup.coach.model_dump(mode="json") if lineup.coach else None
                    ),
                    "starting_xi": json.dumps(
                        [player.model_dump(mode="json") for player in lineup.starting_xi]
                    ),
                    "substitutes": json.dumps(
                        [player.model_dump(mode="json") for player in lineup.substitutes]
                    ),
                    "fingerprint": fingerprint,
                },
            )
            return result.scalar_one_or_none() is not None

    async def persist_injury(self, injury: FixtureInjury) -> bool:
        fixture_id = await self.fixture_id_for_ref(injury.fixture_ref)
        if fixture_id is None:
            raise IngestionDependencyError("Cannot persist an injury before its fixture.")
        payload = injury.model_dump(mode="json")
        fingerprint = stable_fingerprint(
            {
                "fixture_id": str(fixture_id),
                "team": injury.team_ref.model_dump(mode="json"),
                "player": injury.player.model_dump(mode="json"),
                "injury_type": injury.injury_type,
                "reason": injury.reason,
            }
        )
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    insert into public.fixture_injury_snapshots (
                      fixture_id, team_id, provider, player_provider_id, player_name,
                      injury_type, reason, captured_at, raw_payload, fingerprint
                    ) values (
                      :fixture_id,
                      (select id from public.teams where provider = :team_provider
                       and provider_id = :team_provider_id),
                      :provider, :player_provider_id, :player_name, :injury_type,
                      :reason, :captured_at, cast(:raw_payload as jsonb), :fingerprint
                    )
                    on conflict (fingerprint) do nothing
                    returning id
                    """
                ),
                {
                    "fixture_id": fixture_id,
                    "team_provider": injury.team_ref.provider,
                    "team_provider_id": injury.team_ref.external_id,
                    "provider": injury.fixture_ref.provider,
                    "player_provider_id": (
                        injury.player.ref.external_id if injury.player.ref else None
                    ),
                    "player_name": injury.player.name,
                    "injury_type": injury.injury_type,
                    "reason": injury.reason,
                    "captured_at": injury.captured_at,
                    "raw_payload": json.dumps(payload),
                    "fingerprint": fingerprint,
                },
            )
            return result.scalar_one_or_none() is not None

    async def persist_standings(self, table: StandingsTable) -> bool:
        async with self.engine.begin() as connection:
            league_id = await self._league_id(connection, table.league_ref)
            season_id = await self._upsert_season(
                connection,
                league_id,
                Season(year=table.season),
                preserve_existing=True,
            )
            entries = [entry.model_dump(mode="json") for entry in table.entries]
            fingerprint = stable_fingerprint(
                {
                    "league_id": str(league_id),
                    "season": table.season,
                    "group": table.group,
                    "entries": entries,
                }
            )
            result = await connection.execute(
                text(
                    """
                    insert into public.league_standings_snapshots (
                      league_id, season_id, captured_at, group_name, entries, fingerprint
                    ) values (
                      :league_id, :season_id, :captured_at, :group_name,
                      cast(:entries as jsonb), :fingerprint
                    )
                    on conflict (fingerprint) do nothing
                    returning id
                    """
                ),
                {
                    "league_id": league_id,
                    "season_id": season_id,
                    "captured_at": table.captured_at,
                    "group_name": table.group,
                    "entries": json.dumps(entries),
                    "fingerprint": fingerprint,
                },
            )
            return result.scalar_one_or_none() is not None

    async def persist_team_statistics(self, snapshot: TeamSeasonStatistics) -> bool:
        async with self.engine.begin() as connection:
            league_id = await self._league_id(connection, snapshot.league_ref)
            season_id = await self._upsert_season(
                connection,
                league_id,
                Season(year=snapshot.season),
                preserve_existing=True,
            )
            team_result = await connection.execute(
                text(
                    """
                    select id from public.teams
                    where provider = :provider and provider_id = :provider_id
                    """
                ),
                {
                    "provider": snapshot.team_ref.provider,
                    "provider_id": snapshot.team_ref.external_id,
                },
            )
            team_id = team_result.scalar_one_or_none()
            if team_id is None:
                raise IngestionDependencyError("Cannot persist statistics before the team.")
            fingerprint = stable_fingerprint(
                {
                    "league_id": str(league_id),
                    "team_id": str(team_id),
                    "season": snapshot.season,
                    "metrics": snapshot.metrics,
                }
            )
            result = await connection.execute(
                text(
                    """
                    insert into public.team_season_stats_snapshots (
                      league_id, season_id, team_id, captured_at, metrics, fingerprint
                    ) values (
                      :league_id, :season_id, :team_id, :captured_at,
                      cast(:metrics as jsonb), :fingerprint
                    )
                    on conflict (fingerprint) do nothing
                    returning id
                    """
                ),
                {
                    "league_id": league_id,
                    "season_id": season_id,
                    "team_id": team_id,
                    "captured_at": snapshot.captured_at,
                    "metrics": json.dumps(snapshot.metrics),
                    "fingerprint": fingerprint,
                },
            )
            return result.scalar_one_or_none() is not None

    async def persist_provider_prediction(self, prediction: ProviderPrediction) -> bool:
        fixture_id = await self.fixture_id_for_ref(prediction.fixture_ref)
        if fixture_id is None:
            raise IngestionDependencyError("Cannot persist a prediction before its fixture.")
        captured_at = prediction.generated_at or datetime.now(UTC)
        raw_payload = prediction.model_dump(mode="json")
        fingerprint = stable_fingerprint(
            {
                "fixture_id": str(fixture_id),
                "prediction": raw_payload,
            }
        )
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    insert into public.provider_prediction_snapshots (
                      fixture_id, provider, captured_at, home_win_probability,
                      draw_probability, away_win_probability,
                      predicted_winner_provider_id, advice, supplementary_only,
                      raw_payload, fingerprint
                    ) values (
                      :fixture_id, :provider, :captured_at, :home_probability,
                      :draw_probability, :away_probability, :winner_provider_id,
                      :advice, true, cast(:raw_payload as jsonb), :fingerprint
                    )
                    on conflict (fingerprint) do nothing
                    returning id
                    """
                ),
                {
                    "fixture_id": fixture_id,
                    "provider": prediction.fixture_ref.provider,
                    "captured_at": captured_at,
                    "home_probability": prediction.home_win_probability,
                    "draw_probability": prediction.draw_probability,
                    "away_probability": prediction.away_win_probability,
                    "winner_provider_id": (
                        prediction.predicted_winner_ref.external_id
                        if prediction.predicted_winner_ref
                        else None
                    ),
                    "advice": prediction.advice,
                    "raw_payload": json.dumps(raw_payload),
                    "fingerprint": fingerprint,
                },
            )
            return result.scalar_one_or_none() is not None

    async def latest_odds(
        self, fixture_id: UUID, *, is_live: bool
    ) -> dict[tuple[str, str, str, Decimal | None], PreviousOddsSnapshot]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select distinct on (bookmaker, market, selection, line)
                      bookmaker, market, selection, line, decimal_odds,
                      raw_implied_probability, captured_at
                    from public.odds_snapshots
                    where fixture_id = :fixture_id and is_live = :is_live
                    order by bookmaker, market, selection, line, captured_at desc, id desc
                    """
                ),
                {"fixture_id": fixture_id, "is_live": is_live},
            )
            return {
                (row.bookmaker, row.market, row.selection, row.line): PreviousOddsSnapshot(
                    decimal_odds=row.decimal_odds,
                    raw_implied_probability=row.raw_implied_probability,
                    captured_at=row.captured_at,
                )
                for row in result
            }

    async def latest_model_probabilities(
        self, fixture_id: UUID
    ) -> dict[tuple[str, str, Decimal | None], Decimal]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select distinct on (market, selection, line)
                      market, selection, line,
                      coalesce(calibrated_probability, probability) as probability
                    from public.predictions
                    where fixture_id = :fixture_id
                      and feature_cutoff_at <= now()
                    order by market, selection, line, predicted_at desc, id desc
                    """
                ),
                {"fixture_id": fixture_id},
            )
            return {(row.market, row.selection, row.line): row.probability for row in result}

    async def persist_odds(self, snapshots: tuple[NormalizedOddsSnapshot, ...]) -> frozenset[str]:
        inserted: set[str] = set()
        fixture_ids: set[UUID] = set()
        async with self.engine.begin() as connection:
            for snapshot in snapshots:
                result = await connection.execute(
                    text(
                        """
                        insert into public.odds_snapshots (
                          fixture_id, provider, bookmaker, market, selection, line,
                          decimal_odds, raw_implied_probability, captured_at, match_minute,
                          is_live, stopped, raw_payload, fingerprint
                        ) values (
                          :fixture_id, :provider, :bookmaker, :market, :selection, :line,
                          :decimal_odds, :raw_implied_probability, :captured_at,
                          :match_minute, :is_live, :stopped, cast(:raw_payload as jsonb),
                          :fingerprint
                        )
                        on conflict (fingerprint) do nothing
                        returning fingerprint
                        """
                    ),
                    {
                        **snapshot.model_dump(mode="python"),
                        "raw_payload": json.dumps(snapshot.raw_payload),
                    },
                )
                value = result.scalar_one_or_none()
                if value is not None:
                    inserted.add(str(value))
                    fixture_ids.add(snapshot.fixture_id)
            if fixture_ids:
                await connection.execute(
                    text(
                        """
                        update public.fixtures
                        set has_odds = true, updated_at = now()
                        where id = any(:fixture_ids)
                        """
                    ),
                    {"fixture_ids": list(fixture_ids)},
                )
        return frozenset(inserted)


class WorkerRunRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def start(self, worker: WorkerName) -> UUID:
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    insert into public.worker_runs (worker, status)
                    values (:worker, 'running')
                    returning id
                    """
                ),
                {"worker": worker.value},
            )
            return UUID(str(result.scalar_one()))

    async def finish(
        self,
        run_id: UUID,
        *,
        status: str,
        fixtures_processed: int,
        errors: int,
        duration_ms: int,
        metadata: dict[str, Any],
        signals_generated: int = 0,
    ) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    update public.worker_runs
                    set finished_at = now(), status = :status,
                        fixtures_processed = :fixtures_processed,
                        signals_generated = :signals_generated,
                        errors = :errors, duration_ms = :duration_ms,
                        metadata = cast(:metadata as jsonb)
                    where id = :run_id
                    """
                ),
                {
                    "run_id": run_id,
                    "status": status,
                    "fixtures_processed": fixtures_processed,
                    "signals_generated": signals_generated,
                    "errors": errors,
                    "duration_ms": duration_ms,
                    "metadata": json.dumps(metadata),
                },
            )
