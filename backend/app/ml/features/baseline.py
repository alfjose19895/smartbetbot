from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from statistics import fmean
from uuid import UUID

from app.domain.intelligence import FeatureVector, HistoricalFixture, PredictionTarget


def _safe_mean(values: list[float], fallback: float) -> float:
    return fmean(values) if values else fallback


def _team_matches(history: tuple[HistoricalFixture, ...], team_id: UUID) -> list[HistoricalFixture]:
    return [
        match
        for match in history
        if team_id in {match.canonical_home_team_id, match.canonical_away_team_id}
    ]


def _goals_for(match: HistoricalFixture, team_id: UUID) -> int:
    return match.home_score if match.canonical_home_team_id == team_id else match.away_score


def _goals_against(match: HistoricalFixture, team_id: UUID) -> int:
    return match.away_score if match.canonical_home_team_id == team_id else match.home_score


def _points(match: HistoricalFixture, team_id: UUID) -> int:
    scored = _goals_for(match, team_id)
    conceded = _goals_against(match, team_id)
    return 3 if scored > conceded else 1 if scored == conceded else 0


def _elo_ratings(history: tuple[HistoricalFixture, ...]) -> dict[UUID, float]:
    ratings: dict[UUID, float] = defaultdict(lambda: 1500.0)
    for match in sorted(history, key=lambda item: (item.kickoff_at, str(item.fixture_id))):
        home = match.canonical_home_team_id
        away = match.canonical_away_team_id
        home_rating = ratings[home]
        away_rating = ratings[away]
        expected_home = 1 / (1 + 10 ** ((away_rating - home_rating - 60.0) / 400))
        actual_home = (
            1.0
            if match.home_score > match.away_score
            else (0.5 if match.home_score == match.away_score else 0.0)
        )
        delta = 20.0 * (actual_home - expected_home)
        ratings[home] = home_rating + delta
        ratings[away] = away_rating - delta
    return dict(ratings)


class BaselineFeatureBuilder:
    """Leakage-safe football features using only matches before the target kickoff."""

    def build(
        self,
        target: PredictionTarget,
        history: tuple[HistoricalFixture, ...],
        *,
        home_standing_rank: int | None = None,
        away_standing_rank: int | None = None,
    ) -> FeatureVector:
        eligible = tuple(
            match
            for match in history
            if match.canonical_league_id == target.canonical_league_id
            and match.kickoff_at < target.kickoff_at
        )
        league_home = [float(match.home_score) for match in eligible]
        league_away = [float(match.away_score) for match in eligible]
        league_home_avg = _safe_mean(league_home, 1.35)
        league_away_avg = _safe_mean(league_away, 1.10)

        home_all = _team_matches(eligible, target.canonical_home_team_id)
        away_all = _team_matches(eligible, target.canonical_away_team_id)
        home_venue = [
            match
            for match in home_all
            if match.canonical_home_team_id == target.canonical_home_team_id
        ]
        away_venue = [
            match
            for match in away_all
            if match.canonical_away_team_id == target.canonical_away_team_id
        ]
        home_recent = sorted(home_all, key=lambda item: item.kickoff_at)[-5:]
        away_recent = sorted(away_all, key=lambda item: item.kickoff_at)[-5:]
        h2h = [
            match
            for match in eligible
            if {
                match.canonical_home_team_id,
                match.canonical_away_team_id,
            }
            == {
                target.canonical_home_team_id,
                target.canonical_away_team_id,
            }
        ][-5:]
        ratings = _elo_ratings(eligible)

        def average_for(matches: list[HistoricalFixture], team_id: UUID) -> float:
            return _safe_mean([float(_goals_for(match, team_id)) for match in matches], 0.0)

        def average_against(matches: list[HistoricalFixture], team_id: UUID) -> float:
            return _safe_mean([float(_goals_against(match, team_id)) for match in matches], 0.0)

        def rate(matches: list[HistoricalFixture], predicate: object) -> float:
            if not matches:
                return 0.0
            function = predicate
            return sum(bool(function(match)) for match in matches) / len(matches)  # type: ignore[operator]

        def rest_days(matches: list[HistoricalFixture]) -> float | None:
            if not matches:
                return None
            delta = target.kickoff_at - max(match.kickoff_at for match in matches)
            return max(0.0, min(30.0, delta.total_seconds() / 86400))

        cutoff = max(
            (match.kickoff_at for match in eligible),
            default=datetime(1970, 1, 1, tzinfo=UTC),
        )
        values: dict[str, float | int | None] = {
            "league_home_goals_avg": round(league_home_avg, 6),
            "league_away_goals_avg": round(league_away_avg, 6),
            "home_goals_for_home": round(
                _safe_mean([float(match.home_score) for match in home_venue], league_home_avg),
                6,
            ),
            "home_goals_against_home": round(
                _safe_mean([float(match.away_score) for match in home_venue], league_away_avg),
                6,
            ),
            "away_goals_for_away": round(
                _safe_mean([float(match.away_score) for match in away_venue], league_away_avg),
                6,
            ),
            "away_goals_against_away": round(
                _safe_mean([float(match.home_score) for match in away_venue], league_home_avg),
                6,
            ),
            "home_recent_goals_for": round(
                average_for(home_recent, target.canonical_home_team_id), 6
            ),
            "home_recent_goals_against": round(
                average_against(home_recent, target.canonical_home_team_id), 6
            ),
            "away_recent_goals_for": round(
                average_for(away_recent, target.canonical_away_team_id), 6
            ),
            "away_recent_goals_against": round(
                average_against(away_recent, target.canonical_away_team_id), 6
            ),
            "home_recent_points_per_match": round(
                _safe_mean(
                    [float(_points(match, target.canonical_home_team_id)) for match in home_recent],
                    1.0,
                ),
                6,
            ),
            "away_recent_points_per_match": round(
                _safe_mean(
                    [float(_points(match, target.canonical_away_team_id)) for match in away_recent],
                    1.0,
                ),
                6,
            ),
            "home_btts_rate": round(
                rate(home_all, lambda match: match.home_score > 0 and match.away_score > 0), 6
            ),
            "away_btts_rate": round(
                rate(away_all, lambda match: match.home_score > 0 and match.away_score > 0), 6
            ),
            "home_over_15_rate": round(
                rate(home_all, lambda match: match.home_score + match.away_score > 1), 6
            ),
            "away_over_15_rate": round(
                rate(away_all, lambda match: match.home_score + match.away_score > 1), 6
            ),
            "home_clean_sheet_rate": round(
                rate(
                    home_all,
                    lambda match: _goals_against(match, target.canonical_home_team_id) == 0,
                ),
                6,
            ),
            "away_clean_sheet_rate": round(
                rate(
                    away_all,
                    lambda match: _goals_against(match, target.canonical_away_team_id) == 0,
                ),
                6,
            ),
            "home_elo": round(ratings.get(target.canonical_home_team_id, 1500.0), 3),
            "away_elo": round(ratings.get(target.canonical_away_team_id, 1500.0), 3),
            "home_rest_days": rest_days(home_all),
            "away_rest_days": rest_days(away_all),
            "h2h_home_points_per_match": round(
                _safe_mean(
                    [float(_points(match, target.canonical_home_team_id)) for match in h2h],
                    1.0,
                ),
                6,
            ),
            "h2h_matches": len(h2h),
            "home_standing_rank": home_standing_rank,
            "away_standing_rank": away_standing_rank,
        }
        return FeatureVector(
            fixture_id=target.fixture_id,
            feature_cutoff_at=cutoff,
            history_matches=len(eligible),
            home_history_matches=len(home_all),
            away_history_matches=len(away_all),
            values=values,
        )
