from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.intelligence import (
    DataQualityInput,
    EvaluationMetrics,
    HistoricalFixture,
    LiveEvent,
    LiveMetricSnapshot,
    MarketPrice,
    ModelVersionRecord,
    PersistedSignal,
    PredictionTarget,
    PreviousSignal,
    ProbabilityEstimate,
    SignalDecision,
    SignalOpportunity,
    StrategyRule,
)


def _normalized_name(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    tokens = re.findall(r"[a-z0-9]+", ascii_value.lower())
    ignored = {"fc", "cf", "afc", "club", "de", "football", "futbol"}
    return "-".join(token for token in tokens if token not in ignored)


def _identity(prefix: str, values: list[str]) -> str:
    payload = "|".join(sorted(values))
    return f"{prefix}:{hashlib.sha256(payload.encode()).hexdigest()}"


class IntelligenceRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def sync_canonical_catalog(self, groups: tuple[tuple[tuple[str, str], ...], ...]) -> int:
        linked = 0
        for references in groups:
            linked += await self._sync_league_group(references)
        return linked

    async def _sync_league_group(self, references: tuple[tuple[str, str], ...]) -> int:
        if not references:
            return 0
        linked = 0
        clauses = [
            f"(provider = :provider_{index} and provider_id = :provider_id_{index})"
            for index in range(len(references))
        ]
        parameters = {
            key: value
            for index, (provider, provider_id) in enumerate(references)
            for key, value in (
                (f"provider_{index}", provider),
                (f"provider_id_{index}", provider_id),
            )
        }
        async with self.engine.begin() as connection:
            league_result = await connection.execute(
                text(
                    f"""
                    select id, sport_id, country_id, provider, provider_id, name
                    from public.leagues
                    where {" or ".join(clauses)}
                    order by case when provider = 'football_data' then 0 else 1 end, provider
                    """
                ),
                parameters,
            )
            leagues = [dict(row) for row in league_result.mappings()]
            if not leagues:
                return 0
            league_identity = _identity(
                "league", [f"{provider}:{provider_id}" for provider, provider_id in references]
            )
            canonical_result = await connection.execute(
                text(
                    """
                    insert into public.canonical_leagues (
                      sport_id, country_id, identity_key, name
                    ) values (
                      :sport_id, :country_id, :identity_key, :name
                    )
                    on conflict (identity_key) do update
                    set country_id = coalesce(
                          excluded.country_id, public.canonical_leagues.country_id
                        ),
                        name = excluded.name,
                        updated_at = now()
                    returning id
                    """
                ),
                {
                    "sport_id": leagues[0]["sport_id"],
                    "country_id": leagues[0]["country_id"],
                    "identity_key": league_identity,
                    "name": leagues[0]["name"],
                },
            )
            canonical_league_id = UUID(str(canonical_result.scalar_one()))
            for league in leagues:
                await connection.execute(
                    text(
                        """
                        insert into public.league_provider_links (
                          canonical_league_id, league_id, confidence, match_method, approved
                        ) values (
                          :canonical_league_id, :league_id, 1, 'explicit', true
                        )
                        on conflict (league_id) do update
                        set canonical_league_id = excluded.canonical_league_id,
                            confidence = 1, match_method = 'explicit', approved = true
                        """
                    ),
                    {"canonical_league_id": canonical_league_id, "league_id": league["id"]},
                )

            team_result = await connection.execute(
                text(
                    """
                    select distinct t.id, t.provider, t.provider_id, t.name, t.code, t.country_id
                    from public.teams t
                    join (
                      select league_id, home_team_id as team_id from public.fixtures
                      union
                      select league_id, away_team_id as team_id from public.fixtures
                    ) fixture_teams on fixture_teams.team_id = t.id
                    where fixture_teams.league_id = any(:league_ids)
                    order by t.provider, t.name, t.id
                    """
                ),
                {"league_ids": [league["id"] for league in leagues]},
            )
            teams = [dict(row) for row in team_result.mappings()]
            team_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
            code_counts: dict[tuple[str, str], int] = defaultdict(int)
            code_providers: dict[str, set[str]] = defaultdict(set)
            for team in teams:
                if team["code"]:
                    provider = str(team["provider"])
                    code = str(team["code"]).upper()
                    code_counts[(provider, code)] += 1
                    code_providers[code].add(provider)
            for team in teams:
                code = str(team["code"]).upper() if team["code"] else ""
                if (
                    code
                    and code_counts[(str(team["provider"]), code)] == 1
                    and len(code_providers[code]) > 1
                ):
                    key = f"code:{code}"
                else:
                    key = f"name:{_normalized_name(str(team['name']))}"
                # A same-provider collision is not safe to merge automatically.
                if any(item["provider"] == team["provider"] for item in team_groups[key]):
                    key = f"{key}:provider:{team['provider']}:{team['provider_id']}"
                team_groups[key].append(team)

            for match_key, matches in team_groups.items():
                preferred = next(
                    (team for team in matches if team["provider"] == "football_data"),
                    matches[0],
                )
                canonical_team_identity = _identity(
                    "team",
                    [league_identity, match_key]
                    + [f"{team['provider']}:{team['provider_id']}" for team in matches],
                )
                canonical_team_result = await connection.execute(
                    text(
                        """
                        insert into public.canonical_teams (
                          country_id, identity_key, name, code
                        ) values (
                          :country_id, :identity_key, :name, :code
                        )
                        on conflict (identity_key) do update
                        set country_id = coalesce(
                              excluded.country_id, public.canonical_teams.country_id
                            ),
                            name = excluded.name,
                            code = coalesce(excluded.code, public.canonical_teams.code),
                            updated_at = now()
                        returning id
                        """
                    ),
                    {
                        "country_id": preferred["country_id"],
                        "identity_key": canonical_team_identity,
                        "name": preferred["name"],
                        "code": preferred["code"],
                    },
                )
                canonical_team_id = UUID(str(canonical_team_result.scalar_one()))
                providers = {str(team["provider"]) for team in matches}
                confidence = Decimal("1") if len(providers) > 1 else Decimal("0.75")
                method = "exact_code" if match_key.startswith("code:") else "normalized_name"
                for team in matches:
                    await connection.execute(
                        text(
                            """
                            insert into public.team_provider_links (
                              canonical_team_id, team_id, confidence, match_method, approved
                            ) values (
                              :canonical_team_id, :team_id, :confidence, :match_method, :approved
                            )
                            on conflict (team_id) do update
                            set canonical_team_id = excluded.canonical_team_id,
                                confidence = excluded.confidence,
                                match_method = excluded.match_method,
                                approved = excluded.approved
                            """
                        ),
                        {
                            "canonical_team_id": canonical_team_id,
                            "team_id": team["id"],
                            "confidence": confidence,
                            "match_method": method,
                            "approved": len(providers) > 1,
                        },
                    )
                    linked += 1
            return len(leagues) + linked

    async def load_history(self) -> tuple[HistoricalFixture, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select distinct on (
                      ll.canonical_league_id, th.canonical_team_id,
                      ta.canonical_team_id, f.kickoff_at
                    )
                      f.id as fixture_id,
                      ll.canonical_league_id,
                      th.canonical_team_id as canonical_home_team_id,
                      ta.canonical_team_id as canonical_away_team_id,
                      f.kickoff_at, f.home_score, f.away_score
                    from public.fixtures f
                    join public.league_provider_links ll on ll.league_id = f.league_id
                    join public.team_provider_links th on th.team_id = f.home_team_id
                    join public.team_provider_links ta on ta.team_id = f.away_team_id
                    where f.status = 'finished'
                      and f.home_score is not null and f.away_score is not null
                    order by ll.canonical_league_id, th.canonical_team_id,
                      ta.canonical_team_id, f.kickoff_at,
                      case when f.provider = 'api_football' then 0 else 1 end, f.id
                    """
                )
            )
            return tuple(HistoricalFixture.model_validate(dict(row)) for row in result.mappings())

    async def list_prediction_targets(
        self,
        *,
        provider: str,
        now: datetime,
        horizon_days: int,
        limit: int,
    ) -> tuple[PredictionTarget, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select f.id as fixture_id, ll.canonical_league_id,
                      th.canonical_team_id as canonical_home_team_id,
                      ta.canonical_team_id as canonical_away_team_id,
                      f.kickoff_at, f.status
                    from public.fixtures f
                    join public.league_provider_links ll on ll.league_id = f.league_id
                    join public.team_provider_links th on th.team_id = f.home_team_id
                    join public.team_provider_links ta on ta.team_id = f.away_team_id
                    where f.provider = :provider
                      and f.status = 'scheduled'
                      and f.kickoff_at between :now and :horizon
                    order by f.kickoff_at, f.id
                    limit :limit
                    """
                ),
                {
                    "provider": provider,
                    "now": now,
                    "horizon": now + timedelta(days=horizon_days),
                    "limit": limit,
                },
            )
            return tuple(PredictionTarget.model_validate(dict(row)) for row in result.mappings())

    async def load_standing_ranks(self) -> dict[tuple[UUID, UUID], int]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    with latest as (
                      select distinct on (league_id) league_id, entries
                      from public.league_standings_snapshots
                      order by league_id, captured_at desc, id desc
                    )
                    select ll.canonical_league_id, tl.canonical_team_id,
                      nullif(entry ->> 'rank', '')::integer as rank
                    from latest snapshot
                    join public.league_provider_links ll on ll.league_id = snapshot.league_id
                    cross join lateral jsonb_array_elements(snapshot.entries) entry
                    join public.teams t
                      on t.provider = entry -> 'team' -> 'ref' ->> 'provider'
                     and t.provider_id = entry -> 'team' -> 'ref' ->> 'external_id'
                    join public.team_provider_links tl on tl.team_id = t.id
                    where entry ? 'rank'
                    """
                )
            )
            return {
                (UUID(str(row.canonical_league_id)), UUID(str(row.canonical_team_id))): int(
                    row.rank
                )
                for row in result
                if row.rank is not None
            }

    async def activate_model_version(
        self,
        *,
        name: str,
        version: str,
        model_type: str,
        training_cutoff: datetime,
        feature_schema: dict[str, object],
        hyperparameters: dict[str, object],
        metrics: EvaluationMetrics,
    ) -> ModelVersionRecord:
        evaluation = metrics.model_dump(mode="json")
        calibration = {
            "method": "identity_logistic",
            "expected_calibration_error": metrics.calibration_error,
        }
        async with self.engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    update public.model_versions
                    set is_active = false,
                        status = case when status = 'active' then 'retired' else status end,
                        updated_at = now()
                    where name = :name and version <> :version and is_active
                    """
                ),
                {"name": name, "version": version},
            )
            result = await connection.execute(
                text(
                    """
                    insert into public.model_versions (
                      name, version, model_type, status, training_started_at,
                      training_finished_at, training_data_cutoff, feature_schema,
                      hyperparameters, evaluation_metrics, calibration_metrics, is_active
                    ) values (
                      :name, :version, :model_type, 'active', now(), now(), :training_cutoff,
                      cast(:feature_schema as jsonb), cast(:hyperparameters as jsonb),
                      cast(:evaluation as jsonb), cast(:calibration as jsonb), true
                    )
                    on conflict (name, version) do update
                    set model_type = excluded.model_type, status = 'active',
                        training_finished_at = now(),
                        training_data_cutoff = excluded.training_data_cutoff,
                        feature_schema = excluded.feature_schema,
                        hyperparameters = excluded.hyperparameters,
                        evaluation_metrics = excluded.evaluation_metrics,
                        calibration_metrics = excluded.calibration_metrics,
                        is_active = true, updated_at = now()
                    returning id, name, version,
                      nullif(
                        calibration_metrics ->> 'expected_calibration_error', ''
                      )::double precision
                        as calibration_error
                    """
                ),
                {
                    "name": name,
                    "version": version,
                    "model_type": model_type,
                    "training_cutoff": training_cutoff,
                    "feature_schema": json.dumps(feature_schema),
                    "hyperparameters": json.dumps(hyperparameters),
                    "evaluation": json.dumps(evaluation),
                    "calibration": json.dumps(calibration),
                },
            )
            return ModelVersionRecord.model_validate(dict(result.mappings().one()))

    async def persist_predictions(
        self, model_version_id: UUID, estimates: tuple[ProbabilityEstimate, ...]
    ) -> int:
        if not estimates:
            return 0
        rows = [
            {
                **estimate.model_dump(mode="json"),
                "line": str(estimate.line) if estimate.line is not None else None,
            }
            for estimate in estimates
        ]
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    with inserted as (
                      insert into public.predictions (
                        fixture_id, model_version_id, market, selection, line,
                        probability, calibrated_probability, feature_cutoff_at,
                        features, fingerprint
                      )
                      select candidate.fixture_id::uuid, :model_version_id,
                        candidate.market, candidate.selection, candidate.line::numeric,
                        candidate.probability::numeric,
                        candidate.calibrated_probability::numeric,
                        candidate.feature_cutoff_at::timestamptz,
                        candidate.features, candidate.fingerprint
                      from jsonb_to_recordset(cast(:rows as jsonb)) as candidate (
                        fixture_id text, market text, selection text, line text,
                        probability text, calibrated_probability text,
                        feature_cutoff_at text, features jsonb, fingerprint text
                      )
                      on conflict (fingerprint) do nothing
                      returning 1
                    )
                    select count(*)::integer from inserted
                    """
                ),
                {"model_version_id": model_version_id, "rows": json.dumps(rows)},
            )
            return int(result.scalar_one())

    async def list_signal_opportunities(self, *, limit: int) -> tuple[SignalOpportunity, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select p.id as prediction_id, p.fixture_id, p.model_version_id,
                      p.market, p.selection, p.line,
                      coalesce(p.calibrated_probability, p.probability) as model_probability,
                      p.features,
                      s.id as strategy_id, s.slug, s.is_live, s.min_probability,
                      s.min_edge, s.min_smart_score, s.min_data_quality,
                      s.min_odds, s.max_odds, s.cooldown_seconds,
                      f.status, f.match_minute, f.home_score, f.away_score,
                      f.has_events, f.has_statistics, f.has_odds,
                      o.bookmaker, o.decimal_odds, o.raw_implied_probability,
                      o.captured_at, o.stopped,
                      nullif(mv.calibration_metrics ->> 'expected_calibration_error', '')::numeric
                        as calibration_error,
                      exists (
                        select 1 from public.fixture_lineup_snapshots fl where fl.fixture_id = f.id
                      ) as has_lineups,
                      exists (
                        select 1 from public.league_standings_snapshots ls
                        where ls.league_id = f.league_id
                      ) as has_standings
                    from public.strategies s
                    join lateral (
                      select distinct on (fixture_id, market, selection, line) *
                      from public.predictions candidate
                      where candidate.market = s.market
                        and (
                          not (s.config_json ? 'selection')
                          or candidate.selection = s.config_json ->> 'selection'
                        )
                        and (
                          not (s.config_json ? 'selections')
                          or candidate.selection in (
                            select jsonb_array_elements_text(s.config_json -> 'selections')
                          )
                        )
                        and (
                          not (s.config_json ? 'line')
                          or candidate.line = (s.config_json ->> 'line')::numeric
                        )
                      order by fixture_id, market, selection, line,
                        feature_cutoff_at desc, predicted_at desc, id desc
                    ) p on true
                    join public.fixtures f on f.id = p.fixture_id
                    join public.model_versions mv on mv.id = p.model_version_id and mv.is_active
                    join lateral (
                      select * from public.odds_snapshots quote
                      where quote.fixture_id = p.fixture_id
                        and quote.market = p.market and quote.selection = p.selection
                        and quote.line is not distinct from p.line
                        and quote.is_live = s.is_live
                      order by quote.captured_at desc, quote.id desc
                      limit 1
                    ) o on true
                    where s.enabled
                      and ((s.is_live and f.status in ('live', 'halftime'))
                        or (not s.is_live and f.status = 'scheduled'))
                    order by o.captured_at desc, p.fixture_id, s.id
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
            rows = [dict(row) for row in result.mappings()]
            opportunities: list[SignalOpportunity] = []
            for row in rows:
                fixture_id = UUID(str(row["fixture_id"]))
                prices = await self._market_prices(
                    connection,
                    fixture_id=fixture_id,
                    bookmaker=str(row["bookmaker"]),
                    market=str(row["market"]),
                    line=row["line"],
                    is_live=bool(row["is_live"]),
                )
                snapshots, events = await self._live_context(connection, fixture_id, row)
                previous_odds = await self._previous_odds(connection, fixture_id, row)
                critical_event = await self._critical_event(
                    connection,
                    fixture_id,
                    status=str(row["status"]),
                    match_minute=row["match_minute"],
                )
                quality = DataQualityInput(
                    phase="live" if row["is_live"] else "prematch",
                    minute=row["match_minute"] is not None,
                    score=row["home_score"] is not None and row["away_score"] is not None,
                    events=bool(row["has_events"]),
                    statistics=bool(row["has_statistics"]),
                    shots=any(item.shots is not None for item in snapshots),
                    shots_on_target=any(item.shots_on_target is not None for item in snapshots),
                    possession=any(item.possession is not None for item in snapshots),
                    corners=any(item.corners is not None for item in snapshots),
                    cards=(
                        any(
                            item.yellow_cards is not None or item.red_cards is not None
                            for item in snapshots
                        )
                        or any(item.event_type == "card" for item in events)
                    ),
                    odds=bool(row["has_odds"]),
                    historical_features=(
                        int(row["features"].get("home_history_matches", 0)) >= 3
                        and int(row["features"].get("away_history_matches", 0)) >= 3
                    ),
                    lineups=bool(row["has_lineups"]),
                    standings=bool(row["has_standings"]),
                )
                quote = next(
                    price
                    for price in prices
                    if price.selection == row["selection"]
                    and price.captured_at == row["captured_at"]
                )
                opportunities.append(
                    SignalOpportunity(
                        fixture_id=fixture_id,
                        prediction_id=row["prediction_id"],
                        model_version_id=row["model_version_id"],
                        strategy=StrategyRule(
                            id=row["strategy_id"],
                            slug=row["slug"],
                            market=row["market"],
                            is_live=row["is_live"],
                            min_probability=row["min_probability"],
                            min_edge=row["min_edge"],
                            min_smart_score=row["min_smart_score"],
                            min_data_quality=row["min_data_quality"],
                            min_odds=row["min_odds"],
                            max_odds=row["max_odds"],
                            cooldown_seconds=row["cooldown_seconds"],
                        ),
                        market=row["market"],
                        selection=row["selection"],
                        line=row["line"],
                        model_probability=row["model_probability"],
                        quote=quote,
                        market_prices=prices,
                        match_minute=row["match_minute"],
                        home_score=row["home_score"],
                        away_score=row["away_score"],
                        expected_home_goals=row["features"].get("expected_home_goals"),
                        expected_away_goals=row["features"].get("expected_away_goals"),
                        critical_event=critical_event,
                        quality=quality,
                        pressure_snapshots=snapshots,
                        pressure_events=events,
                        calibration_error=row["calibration_error"],
                        previous_odds=previous_odds,
                    )
                )
            return tuple(opportunities)

    async def _market_prices(
        self,
        connection: Any,
        *,
        fixture_id: UUID,
        bookmaker: str,
        market: str,
        line: Decimal | None,
        is_live: bool,
    ) -> tuple[MarketPrice, ...]:
        result = await connection.execute(
            text(
                """
                select distinct on (selection) bookmaker, market, selection, line,
                  decimal_odds, raw_implied_probability, captured_at, stopped
                from public.odds_snapshots
                where fixture_id = :fixture_id and bookmaker = :bookmaker
                  and market = :market and line is not distinct from :line
                  and is_live = :is_live
                order by selection, captured_at desc, id desc
                """
            ),
            {
                "fixture_id": fixture_id,
                "bookmaker": bookmaker,
                "market": market,
                "line": line,
                "is_live": is_live,
            },
        )
        return tuple(MarketPrice.model_validate(dict(row)) for row in result.mappings())

    async def _live_context(
        self, connection: Any, fixture_id: UUID, row: dict[str, Any]
    ) -> tuple[tuple[LiveMetricSnapshot, ...], tuple[LiveEvent, ...]]:
        if not row["is_live"]:
            return (), ()
        stats_result = await connection.execute(
            text(
                """
                select stats.captured_at, stats.match_minute,
                  case when stats.team_id = f.home_team_id then 'home' else 'away' end as side,
                  stats.shots, stats.shots_on_target, stats.possession, stats.corners,
                  stats.attacks, stats.dangerous_attacks, stats.yellow_cards, stats.red_cards
                from public.fixture_stats_snapshots stats
                join public.fixtures f on f.id = stats.fixture_id
                where stats.fixture_id = :fixture_id
                order by stats.captured_at, stats.id
                """
            ),
            {"fixture_id": fixture_id},
        )
        event_result = await connection.execute(
            text(
                """
                select case when event.team_id = f.home_team_id then 'home'
                    when event.team_id = f.away_team_id then 'away' end as side,
                  event.event_type, event.match_minute
                from public.fixture_events event
                join public.fixtures f on f.id = event.fixture_id
                where event.fixture_id = :fixture_id
                order by event.match_minute, event.id
                """
            ),
            {"fixture_id": fixture_id},
        )
        return (
            tuple(
                LiveMetricSnapshot.model_validate(dict(item)) for item in stats_result.mappings()
            ),
            tuple(LiveEvent.model_validate(dict(item)) for item in event_result.mappings()),
        )

    async def _previous_odds(
        self, connection: Any, fixture_id: UUID, row: dict[str, Any]
    ) -> Decimal | None:
        result = await connection.execute(
            text(
                """
                select decimal_odds from public.odds_snapshots
                where fixture_id = :fixture_id and bookmaker = :bookmaker
                  and market = :market and selection = :selection
                  and line is not distinct from :line and is_live = :is_live
                  and captured_at < :captured_at
                order by captured_at desc, id desc limit 1
                """
            ),
            {
                "fixture_id": fixture_id,
                "bookmaker": row["bookmaker"],
                "market": row["market"],
                "selection": row["selection"],
                "line": row["line"],
                "is_live": row["is_live"],
                "captured_at": row["captured_at"],
            },
        )
        return result.scalar_one_or_none()

    async def _critical_event(
        self,
        connection: Any,
        fixture_id: UUID,
        *,
        status: str,
        match_minute: int | None,
    ) -> str | None:
        if status == "halftime":
            return "halftime"
        if match_minute is not None and 46 <= match_minute <= 48:
            return "second_half"
        result = await connection.execute(
            text(
                """
                select case
                    when event_type = 'card' then 'red_card:' || id::text
                    else event_type || ':' || id::text
                  end as critical_event
                from public.fixture_events
                where fixture_id = :fixture_id
                  and (
                    event_type in ('goal', 'penalty')
                    or (event_type = 'card' and lower(coalesce(detail, '')) like '%red%')
                  )
                order by match_minute desc nulls last, id desc limit 1
                """
            ),
            {"fixture_id": fixture_id},
        )
        return result.scalar_one_or_none()

    async def latest_signal(self, fingerprint: str) -> PreviousSignal | None:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select triggered_at, decimal_odds, edge, smart_score, line, critical_event
                    from public.signals where fingerprint = :fingerprint
                    order by triggered_at desc, id desc limit 1
                    """
                ),
                {"fingerprint": fingerprint},
            )
            row = result.mappings().one_or_none()
            return PreviousSignal.model_validate(dict(row)) if row else None

    async def persist_signal(
        self,
        opportunity: SignalOpportunity,
        decision: SignalDecision,
        *,
        triggered_at: datetime,
    ) -> PersistedSignal | None:
        if not decision.qualified or decision.smart_score is None or decision.edge is None:
            return None
        deduplication_key = hashlib.sha256(
            "|".join(
                (
                    decision.fingerprint or "",
                    triggered_at.astimezone(UTC).isoformat(),
                    str(opportunity.quote.decimal_odds),
                    str(decision.smart_score.score),
                    str(decision.edge),
                    opportunity.critical_event or "",
                )
            ).encode()
        ).hexdigest()
        pressure_score = None
        if decision.live_pressure:
            pressure_score = max(
                value
                for value in (
                    decision.live_pressure.home_score,
                    decision.live_pressure.away_score,
                )
                if value is not None
            )
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    insert into public.signals (
                      fixture_id, strategy_id, prediction_id, model_version_id,
                      signal_type, market, selection, line, decimal_odds,
                      model_probability, raw_implied_probability,
                      fair_market_probability, edge, expected_value,
                      data_quality_score, live_pressure_score, smart_score,
                      category, fingerprint, deduplication_key, triggered_at,
                      match_minute, critical_event
                    ) values (
                      :fixture_id, :strategy_id, :prediction_id, :model_version_id,
                      :signal_type, :market, :selection, :line, :decimal_odds,
                      :model_probability, :raw_implied_probability,
                      :fair_market_probability, :edge, :expected_value,
                      :data_quality_score, :live_pressure_score, :smart_score,
                      :category, :fingerprint, :deduplication_key, :triggered_at,
                      :match_minute, :critical_event
                    )
                    on conflict (deduplication_key) do nothing
                    returning id, triggered_at
                    """
                ),
                {
                    "fixture_id": opportunity.fixture_id,
                    "strategy_id": opportunity.strategy.id,
                    "prediction_id": opportunity.prediction_id,
                    "model_version_id": opportunity.model_version_id,
                    "signal_type": "live" if opportunity.strategy.is_live else "prematch",
                    "market": opportunity.market,
                    "selection": opportunity.selection,
                    "line": opportunity.line,
                    "decimal_odds": opportunity.quote.decimal_odds,
                    "model_probability": decision.evaluated_probability,
                    "raw_implied_probability": opportunity.quote.raw_implied_probability,
                    "fair_market_probability": decision.fair_market_probability,
                    "edge": decision.edge,
                    "expected_value": decision.expected_value,
                    "data_quality_score": decision.data_quality.score,
                    "live_pressure_score": pressure_score,
                    "smart_score": decision.smart_score.score,
                    "category": decision.smart_score.category.value,
                    "fingerprint": decision.fingerprint,
                    "deduplication_key": deduplication_key,
                    "triggered_at": triggered_at,
                    "match_minute": opportunity.match_minute,
                    "critical_event": opportunity.critical_event,
                },
            )
            signal_row = result.mappings().one_or_none()
            if signal_row is None:
                return None
            signal_id = signal_row["id"]
            for reason in decision.reasons:
                await connection.execute(
                    text(
                        """
                        insert into public.signal_reasons (
                          signal_id, code, label, numeric_value, text_value,
                          unit, sort_order, metadata
                        ) values (
                          :signal_id, :code, :label, :numeric_value, :text_value,
                          :unit, :sort_order, cast(:metadata as jsonb)
                        )
                        on conflict (signal_id, code) do nothing
                        """
                    ),
                    {
                        "signal_id": signal_id,
                        **reason.model_dump(mode="python", exclude={"metadata"}),
                        "metadata": json.dumps(reason.metadata),
                    },
                )
            await connection.execute(
                text(
                    """
                    insert into public.notifications (
                      user_id, signal_id, title, body, channel, status, metadata
                    )
                    select preferences.user_id, :signal_id,
                      'SmartBetBot Signal',
                      home.name || ' vs ' || away.name || ' · ' ||
                        upper(:selection) || ' · Score ' || cast(:smart_score as text),
                      'push', 'queued',
                      jsonb_build_object(
                        'fixture_id', fixture.id,
                        'market', cast(:market as text),
                        'selection', cast(:selection as text),
                        'signal_type', cast(:signal_type as text),
                        'url', '/signals/' || cast(:signal_id as text)
                      )
                    from public.user_preferences preferences
                    join public.fixtures fixture on fixture.id = :fixture_id
                    join public.teams home on home.id = fixture.home_team_id
                    join public.teams away on away.id = fixture.away_team_id
                    where preferences.minimum_smart_score <= :smart_score
                      and preferences.minimum_probability <= :model_probability
                      and preferences.minimum_edge <= :edge
                      and (
                        (:signal_type = 'live' and preferences.live_enabled)
                        or (:signal_type = 'prematch' and preferences.prematch_enabled)
                      )
                      and (
                        cardinality(preferences.markets) = 0
                        or :market = any(preferences.markets)
                      )
                      and (
                        cardinality(preferences.league_ids) = 0
                        or fixture.league_id = any(preferences.league_ids)
                      )
                      and exists (
                        select 1 from public.push_subscriptions subscription
                        where subscription.user_id = preferences.user_id
                          and subscription.is_enabled
                      )
                    on conflict (user_id, signal_id, channel)
                    where signal_id is not null
                    do nothing
                    """
                ),
                {
                    "signal_id": signal_id,
                    "fixture_id": opportunity.fixture_id,
                    "market": opportunity.market,
                    "selection": opportunity.selection,
                    "signal_type": "live" if opportunity.strategy.is_live else "prematch",
                    "smart_score": decision.smart_score.score,
                    "model_probability": decision.evaluated_probability,
                    "edge": decision.edge,
                },
            )
            return PersistedSignal.model_validate(dict(signal_row))
