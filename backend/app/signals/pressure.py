from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.domain.intelligence import LiveEvent, LiveMetricSnapshot, LivePressureResult

WINDOW_WEIGHTS = {5: Decimal("0.50"), 10: Decimal("0.30"), 15: Decimal("0.20")}


def _delta(current: int | None, previous: int | None) -> int | None:
    if current is None or previous is None:
        return None
    return max(0, current - previous)


def _window_score(
    current: LiveMetricSnapshot,
    previous: LiveMetricSnapshot,
    events: tuple[LiveEvent, ...],
    window_start: int,
) -> tuple[Decimal, set[str]]:
    available: set[str] = set()
    score = Decimal("0")
    metrics = (
        ("shots", 6),
        ("shots_on_target", 14),
        ("corners", 7),
        ("attacks", 0.35),
        ("dangerous_attacks", 1.2),
    )
    for name, weight in metrics:
        value = _delta(getattr(current, name), getattr(previous, name))
        if value is not None:
            available.add(name)
            score += Decimal(str(value * weight))
    if current.possession is not None:
        available.add("possession")
        score += max(Decimal("0"), current.possession - Decimal("45")) * Decimal("0.35")
    for event in events:
        if (
            event.side != current.side
            or event.match_minute is None
            or event.match_minute < window_start
        ):
            continue
        normalized = event.event_type.lower()
        if normalized == "goal":
            score += Decimal("14")
            available.add("goals")
        elif normalized in {"substitution", "subst"}:
            score += Decimal("1")
            available.add("substitutions")
        elif normalized in {"penalty", "penalty_awarded"}:
            score += Decimal("8")
            available.add("attacking_events")
    own_reds = _delta(current.red_cards, previous.red_cards)
    own_yellows = _delta(current.yellow_cards, previous.yellow_cards)
    if own_reds is not None:
        score -= Decimal(own_reds * 10)
        available.add("cards")
    if own_yellows is not None:
        score -= Decimal(own_yellows * 2)
        available.add("cards")
    return max(Decimal("0"), min(Decimal("100"), score)), available


def calculate_live_pressure(
    snapshots: tuple[LiveMetricSnapshot, ...], events: tuple[LiveEvent, ...] = ()
) -> LivePressureResult:
    by_side = {
        side: sorted(
            (snapshot for snapshot in snapshots if snapshot.side == side),
            key=lambda item: item.captured_at,
        )
        for side in ("home", "away")
    }
    if not all(by_side.values()):
        return LivePressureResult(missing=("home_or_away_statistics",))
    current_minute = max(
        snapshot.match_minute or 0 for side in by_side.values() for snapshot in side
    )
    if current_minute <= 0:
        return LivePressureResult(missing=("match_minute",))

    side_scores: dict[str, Decimal] = {}
    common_windows: set[int] | None = None
    missing: set[str] = set()
    for side, side_snapshots in by_side.items():
        current = side_snapshots[-1]
        weighted = Decimal("0")
        weight_used = Decimal("0")
        available_windows: set[int] = set()
        available_metrics: set[str] = set()
        for window, weight in WINDOW_WEIGHTS.items():
            cutoff = current_minute - window
            previous_candidates = [
                item
                for item in side_snapshots[:-1]
                if item.match_minute is not None and item.match_minute <= cutoff
            ]
            if not previous_candidates:
                continue
            previous = max(previous_candidates, key=lambda item: item.match_minute or 0)
            window_score, metrics = _window_score(current, previous, events, cutoff)
            if not metrics:
                continue
            weighted += window_score * weight
            weight_used += weight
            available_windows.add(window)
            available_metrics.update(metrics)
        if not available_windows:
            missing.add(f"{side}_window_history")
            continue
        side_scores[side] = (weighted / weight_used).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        common_windows = (
            available_windows
            if common_windows is None
            else common_windows.intersection(available_windows)
        )
        for expected in ("shots", "shots_on_target", "corners", "possession"):
            if expected not in available_metrics:
                missing.add(expected)
    home_score = side_scores.get("home")
    away_score = side_scores.get("away")
    dominant = None
    if home_score is not None and away_score is not None:
        difference = home_score - away_score
        dominant = "balanced" if abs(difference) < 5 else "home" if difference > 0 else "away"
    return LivePressureResult(
        home_score=home_score,
        away_score=away_score,
        dominant_side=dominant,
        windows_available=tuple(sorted(common_windows or set())),
        missing=tuple(sorted(missing)),
    )
