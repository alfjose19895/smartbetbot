from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from time import monotonic
from typing import Protocol
from uuid import UUID

from app.domain.ingestion import (
    IngestionReport,
    NormalizedOddsSnapshot,
    OddsEvaluation,
    OddsMovement,
    PreviousOddsSnapshot,
    StoredFixture,
    WorkerName,
)
from app.domain.sports import OddsPhase, OddsQuery, OddsQuote, ProviderCapability
from app.providers.sports.base import SportsDataProvider

logger = logging.getLogger("smartbetbot.worker.odds")

_ODDS_QUANTUM = Decimal("0.0001")
_LINE_QUANTUM = Decimal("0.001")
_PROBABILITY_QUANTUM = Decimal("0.000001")
_MOVEMENT_QUANTUM = Decimal("0.000001")
_PREMATCH_OVER_LINES = frozenset({Decimal("0.500"), Decimal("1.500"), Decimal("2.500")})
_PREMATCH_UNDER_LINES = frozenset({Decimal("2.500")})
_LIVE_OVER_LINES = _PREMATCH_OVER_LINES


class OddsIngestionRepository(Protocol):
    async def list_active_odds_targets(self, *, limit: int) -> tuple[StoredFixture, ...]: ...

    async def latest_odds(
        self, fixture_id: UUID, *, is_live: bool
    ) -> dict[tuple[str, str, str, Decimal | None], PreviousOddsSnapshot]: ...

    async def persist_odds(self, snapshots: tuple[NormalizedOddsSnapshot, ...]) -> frozenset[str]:
        """Return the fingerprints inserted by this call."""
        ...


class OddsDistributedLock(Protocol):
    def hold(self, key: str, ttl_seconds: int) -> AbstractAsyncContextManager[bool]: ...


class ModelProbabilitySource(Protocol):
    async def latest_model_probabilities(
        self, fixture_id: UUID
    ) -> dict[tuple[str, str, Decimal | None], Decimal]: ...


class OddsIngestionHook(Protocol):
    async def on_odds_persisted(
        self,
        fixture: StoredFixture,
        *,
        evaluations: tuple[OddsEvaluation, ...],
        movements: tuple[OddsMovement, ...],
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class OddsFixtureResult:
    fixture_id: UUID
    provider_requests: int = 0
    accepted: int = 0
    inserted: int = 0
    movements: tuple[OddsMovement, ...] = ()
    evaluations: tuple[OddsEvaluation, ...] = ()
    lock_contended: bool = False
    error_code: str | None = None


def _normalized_text(value: str | None) -> str:
    if not value:
        return ""
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).strip()


def _canonical_market(quote: OddsQuote) -> str | None:
    raw_name = _normalized_text(quote.market.name)
    canonical = _normalized_text(quote.market.canonical_name)
    combined = {raw_name, canonical}
    period_markers = ("first half", "1st half", "second half", "2nd half", "half time")
    if any(marker in raw_name for marker in period_markers):
        return None

    aliases = {
        "total_goals": {
            "goals over under",
            "over under",
            "total goals",
            "total_goals",
        },
        "both_teams_to_score": {
            "both teams score",
            "both teams to score",
            "btts",
            "both_teams_to_score",
        },
        "match_winner": {
            "match winner",
            "match winner 1x2",
            "1x2",
            "match_winner",
            "match_winner_1x2",
        },
        "double_chance": {"double chance", "double_chance"},
        "next_goal": {"next goal", "next_goal"},
    }
    normalized_combined = {value.replace("_", " ") for value in combined}
    for market, names in aliases.items():
        normalized_names = {value.replace("_", " ") for value in names}
        if normalized_combined & normalized_names:
            return market
    return None


def _line(quote: OddsQuote) -> Decimal | None:
    value = quote.line
    if value is None:
        matches = re.findall(r"[-+]?\d+(?:\.\d+)?", quote.selection.name)
        if not matches:
            return None
        value = Decimal(matches[-1])
    return Decimal(value).quantize(_LINE_QUANTUM, rounding=ROUND_HALF_UP)


def _canonical_selection(market: str, quote: OddsQuote) -> tuple[str, Decimal | None] | None:
    name = _normalized_text(quote.selection.name)
    canonical = _normalized_text(quote.selection.canonical_name)
    candidates = {name, canonical}

    if market == "total_goals":
        selection = next(
            (
                side
                for side in ("over", "under")
                if any(value == side or value.startswith(f"{side} ") for value in candidates)
            ),
            None,
        )
        line = _line(quote)
        return (selection, line) if selection and line is not None and line >= 0 else None

    aliases: dict[str, dict[str, set[str]]] = {
        "both_teams_to_score": {
            "yes": {"yes", "y"},
            "no": {"no", "n"},
        },
        "match_winner": {
            "home": {"home", "1"},
            "draw": {"draw", "x"},
            "away": {"away", "2"},
        },
        "double_chance": {
            "1x": {"1x", "home draw", "home or draw"},
            "x2": {"x2", "draw away", "draw or away"},
        },
        "next_goal": {
            "home": {"home", "1"},
            "away": {"away", "2"},
            "no_goal": {"no goal", "draw", "x"},
        },
    }
    for selection, names in aliases.get(market, {}).items():
        if candidates & names:
            return selection, None
    return None


def raw_implied_probability(decimal_odds: Decimal) -> Decimal:
    odds = Decimal(decimal_odds)
    if odds <= 1:
        raise ValueError("decimal_odds must be greater than one")
    return (Decimal(1) / odds).quantize(_PROBABILITY_QUANTUM, rounding=ROUND_HALF_UP)


def _mvp_supported(
    *, market: str, selection: str, line: Decimal | None, phase: OddsPhase, match_minute: int | None
) -> bool:
    if market == "total_goals":
        if line is None:
            return False
        if selection == "over":
            allowed = _LIVE_OVER_LINES if phase == OddsPhase.LIVE else _PREMATCH_OVER_LINES
            return line in allowed
        if selection == "under":
            return phase == OddsPhase.LIVE or line in _PREMATCH_UNDER_LINES
        return False
    if market == "both_teams_to_score":
        return selection in {"yes", "no"}
    if market == "match_winner":
        return selection in {"home", "draw", "away"}
    if market == "double_chance":
        return selection in {"1x", "x2"}
    if market == "next_goal":
        return phase == OddsPhase.LIVE and match_minute is not None
    return False


def _observation_bucket(captured_at_timestamp: float, bucket_seconds: int) -> int:
    if bucket_seconds <= 0:
        raise ValueError("bucket_seconds must be positive")
    return int(captured_at_timestamp) // bucket_seconds


def _fingerprint(
    *,
    fixture: StoredFixture,
    quote: OddsQuote,
    market: str,
    selection: str,
    line: Decimal | None,
    decimal_odds: Decimal,
    bucket_seconds: int,
) -> tuple[str, int]:
    bucket = _observation_bucket(quote.captured_at.timestamp(), bucket_seconds)
    identity = {
        "version": "odds:v1",
        "fixture_provider": fixture.provider,
        "fixture_external_id": fixture.provider_id,
        "bookmaker": (
            quote.bookmaker.ref.external_id
            if quote.bookmaker.ref is not None
            else _normalized_text(quote.bookmaker.name)
        ),
        "market": market,
        "selection": selection,
        "line": format(line, "f") if line is not None else None,
        "phase": quote.phase.value,
        "observed_bucket": bucket,
        "decimal_odds": format(decimal_odds, "f"),
        "stopped": quote.stopped,
    }
    canonical = json.dumps(identity, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest(), bucket


def normalize_odds_quote(
    quote: OddsQuote,
    fixture: StoredFixture,
    *,
    bucket_seconds: int,
) -> NormalizedOddsSnapshot | None:
    if (
        quote.fixture_ref.provider != fixture.provider
        or quote.fixture_ref.external_id != fixture.provider_id
    ):
        return None
    market = _canonical_market(quote)
    if market is None:
        return None
    selection_value = _canonical_selection(market, quote)
    if selection_value is None:
        return None
    selection, line = selection_value
    if not _mvp_supported(
        market=market,
        selection=selection,
        line=line,
        phase=quote.phase,
        match_minute=quote.match_minute,
    ):
        return None

    decimal_odds = Decimal(quote.decimal_odds).quantize(_ODDS_QUANTUM, rounding=ROUND_HALF_UP)
    fingerprint, bucket = _fingerprint(
        fixture=fixture,
        quote=quote,
        market=market,
        selection=selection,
        line=line,
        decimal_odds=decimal_odds,
        bucket_seconds=bucket_seconds,
    )
    return NormalizedOddsSnapshot(
        fixture_id=fixture.id,
        provider=fixture.provider,
        bookmaker=quote.bookmaker.name.strip(),
        market=market,
        selection=selection,
        line=line,
        decimal_odds=decimal_odds,
        raw_implied_probability=raw_implied_probability(decimal_odds),
        captured_at=quote.captured_at,
        match_minute=quote.match_minute,
        is_live=quote.phase == OddsPhase.LIVE,
        stopped=quote.stopped,
        fingerprint=fingerprint,
        raw_payload={
            "fixture_external_id": quote.fixture_ref.external_id,
            "bookmaker": {
                "external_id": (
                    quote.bookmaker.ref.external_id if quote.bookmaker.ref is not None else None
                ),
                "name": quote.bookmaker.name,
            },
            "market": {
                "external_id": quote.market.ref.external_id
                if quote.market.ref is not None
                else None,
                "name": quote.market.name,
            },
            "selection": {
                "external_id": (
                    quote.selection.ref.external_id if quote.selection.ref is not None else None
                ),
                "name": quote.selection.name,
            },
            "observation_bucket": bucket,
            "normalization_version": "odds:v1",
        },
    )


def calculate_movement(
    snapshot: NormalizedOddsSnapshot,
    previous: PreviousOddsSnapshot | None,
    *,
    significant_threshold: Decimal,
    significant_probability_delta: Decimal | None = None,
) -> OddsMovement | None:
    if previous is None or previous.captured_at > snapshot.captured_at:
        return None
    threshold = Decimal(significant_threshold)
    if threshold < 0:
        raise ValueError("significant_threshold cannot be negative")
    probability_threshold = (
        Decimal(significant_probability_delta)
        if significant_probability_delta is not None
        else None
    )
    if probability_threshold is not None and probability_threshold < 0:
        raise ValueError("significant_probability_delta cannot be negative")
    odds_change = (
        (snapshot.decimal_odds - previous.decimal_odds) / previous.decimal_odds
    ).quantize(_MOVEMENT_QUANTUM, rounding=ROUND_HALF_UP)
    implied_change = (snapshot.raw_implied_probability - previous.raw_implied_probability).quantize(
        _MOVEMENT_QUANTUM, rounding=ROUND_HALF_UP
    )
    direction = (
        "shortening"
        if snapshot.decimal_odds < previous.decimal_odds
        else "drifting"
        if snapshot.decimal_odds > previous.decimal_odds
        else "unchanged"
    )
    return OddsMovement(
        fixture_id=snapshot.fixture_id,
        bookmaker=snapshot.bookmaker,
        market=snapshot.market,
        selection=snapshot.selection,
        line=snapshot.line,
        is_live=snapshot.is_live,
        previous_odds=previous.decimal_odds,
        current_odds=snapshot.decimal_odds,
        previous_implied_probability=previous.raw_implied_probability,
        current_implied_probability=snapshot.raw_implied_probability,
        odds_change=odds_change,
        implied_probability_change=implied_change,
        direction=direction,
        significant=(
            abs(odds_change) >= threshold
            or (probability_threshold is not None and abs(implied_change) >= probability_threshold)
        ),
        previous_captured_at=previous.captured_at,
        current_captured_at=snapshot.captured_at,
    )


def devig_probabilities(
    snapshots: Sequence[NormalizedOddsSnapshot],
) -> dict[str, Decimal]:
    if not snapshots:
        return {}
    first = snapshots[0]
    group_identity = (
        first.fixture_id,
        first.provider,
        first.bookmaker,
        first.market,
        first.line,
        first.is_live,
        first.captured_at,
    )
    if any(
        (
            item.fixture_id,
            item.provider,
            item.bookmaker,
            item.market,
            item.line,
            item.is_live,
            item.captured_at,
        )
        != group_identity
        for item in snapshots
    ):
        return {}
    expected_sides = {
        "match_winner": {"home", "draw", "away"},
        "both_teams_to_score": {"yes", "no"},
        "total_goals": {"over", "under"},
        "next_goal": {"home", "away", "no_goal"},
    }.get(first.market)
    by_selection = {item.selection: item for item in snapshots}
    if expected_sides is None or set(by_selection) != expected_sides:
        return {}
    total = sum((item.raw_implied_probability for item in by_selection.values()), Decimal(0))
    if total <= 0:
        return {}
    return {
        item.fingerprint: (item.raw_implied_probability / total).quantize(
            _PROBABILITY_QUANTUM, rounding=ROUND_HALF_UP
        )
        for item in by_selection.values()
    }


def evaluate_odds(
    snapshot: NormalizedOddsSnapshot,
    *,
    fair_market_probability: Decimal | None = None,
    model_probability: Decimal | None = None,
) -> OddsEvaluation:
    fair = (
        Decimal(fair_market_probability).quantize(_PROBABILITY_QUANTUM, rounding=ROUND_HALF_UP)
        if fair_market_probability is not None
        else None
    )
    model = (
        Decimal(model_probability).quantize(_PROBABILITY_QUANTUM, rounding=ROUND_HALF_UP)
        if model_probability is not None
        else None
    )
    market_probability = fair if fair is not None else snapshot.raw_implied_probability
    edge = (
        (model - market_probability).quantize(_PROBABILITY_QUANTUM, rounding=ROUND_HALF_UP)
        if model is not None
        else None
    )
    return OddsEvaluation(
        snapshot=snapshot,
        fair_market_probability=fair,
        model_probability=model,
        edge=edge,
    )


class OddsIngestionService:
    def __init__(
        self,
        *,
        provider: SportsDataProvider,
        repository: OddsIngestionRepository,
        distributed_lock: OddsDistributedLock,
        model_probabilities: ModelProbabilitySource | None = None,
        hook: OddsIngestionHook | None = None,
        significant_movement_threshold: Decimal = Decimal("0.05"),
        significant_probability_delta: Decimal | None = None,
        live_bucket_seconds: int = 15,
        prematch_bucket_seconds: int = 10800,
        lock_ttl_seconds: int = 60,
        max_concurrency: int = 4,
        target_limit: int = 100,
    ) -> None:
        if significant_movement_threshold < 0:
            raise ValueError("significant_movement_threshold cannot be negative")
        if significant_probability_delta is not None and significant_probability_delta < 0:
            raise ValueError("significant_probability_delta cannot be negative")
        if live_bucket_seconds <= 0 or prematch_bucket_seconds <= 0:
            raise ValueError("bucket seconds must be positive")
        if lock_ttl_seconds <= 0 or max_concurrency <= 0 or target_limit <= 0:
            raise ValueError("worker limits must be positive")
        self._provider = provider
        self._repository = repository
        self._locks = distributed_lock
        self._model_probabilities = model_probabilities
        self._hook = hook
        self._movement_threshold = Decimal(significant_movement_threshold)
        self._probability_threshold = (
            Decimal(significant_probability_delta)
            if significant_probability_delta is not None
            else None
        )
        self._live_bucket_seconds = live_bucket_seconds
        self._prematch_bucket_seconds = prematch_bucket_seconds
        self._lock_ttl_seconds = lock_ttl_seconds
        self._max_concurrency = max_concurrency
        self._target_limit = target_limit

    async def run_live_cycle(
        self, targets: Sequence[StoredFixture] | None = None
    ) -> IngestionReport:
        if not self._supports(ProviderCapability.LIVE_ODDS):
            return IngestionReport(
                worker=WorkerName.ODDS,
                skipped_reason="provider_missing_live_odds_capability",
            )
        selected = (
            tuple(targets)
            if targets is not None
            else await self._repository.list_active_odds_targets(limit=self._target_limit)
        )
        return await self._run(selected, OddsPhase.LIVE, empty_reason="no_active_fixtures")

    async def ingest_prematch(self, fixtures: Sequence[StoredFixture]) -> IngestionReport:
        if not self._supports(ProviderCapability.PREMATCH_ODDS):
            return IngestionReport(
                worker=WorkerName.ODDS,
                skipped_reason="provider_missing_prematch_odds_capability",
            )
        return await self._run(tuple(fixtures), OddsPhase.PREMATCH, empty_reason="no_fixtures")

    def _supports(self, capability: ProviderCapability) -> bool:
        capabilities = getattr(self._provider, "capabilities", frozenset(ProviderCapability))
        return capability in capabilities

    async def ingest_fixture(self, fixture: StoredFixture, phase: OddsPhase) -> OddsFixtureResult:
        key = f"worker:lock:odds:{fixture.provider}:{fixture.provider_id}:{phase.value}"
        async with self._locks.hold(key, self._lock_ttl_seconds) as acquired:
            if not acquired:
                return OddsFixtureResult(fixture_id=fixture.id, lock_contended=True)
            response = await self._provider.get_odds(
                OddsQuery(fixture_external_ids=(fixture.provider_id,), phase=phase)
            )
            bucket_seconds = (
                self._live_bucket_seconds
                if phase == OddsPhase.LIVE
                else self._prematch_bucket_seconds
            )
            normalized_by_fingerprint: dict[str, NormalizedOddsSnapshot] = {}
            for quote in response.items:
                snapshot = normalize_odds_quote(
                    quote,
                    fixture,
                    bucket_seconds=bucket_seconds,
                )
                if snapshot is not None:
                    normalized_by_fingerprint[snapshot.fingerprint] = snapshot
            snapshots = tuple(normalized_by_fingerprint.values())
            if not snapshots:
                return OddsFixtureResult(
                    fixture_id=fixture.id,
                    provider_requests=response.metadata.external_requests,
                )

            previous_by_identity = await self._repository.latest_odds(
                fixture.id,
                is_live=phase == OddsPhase.LIVE,
            )
            previous = {
                snapshot.fingerprint: previous_by_identity.get(
                    (snapshot.bookmaker, snapshot.market, snapshot.selection, snapshot.line)
                )
                for snapshot in snapshots
            }
            inserted_fingerprints = await self._repository.persist_odds(snapshots)
            inserted = tuple(
                item for item in snapshots if item.fingerprint in inserted_fingerprints
            )
            movements = tuple(
                movement
                for item in inserted
                if (
                    movement := calculate_movement(
                        item,
                        previous[item.fingerprint],
                        significant_threshold=self._movement_threshold,
                        significant_probability_delta=self._probability_threshold,
                    )
                )
                is not None
            )
            # De-vig needs the complete current market, including sides that an
            # idempotent insert may already have stored during this bucket.
            fair_by_fingerprint = self._fair_probabilities(snapshots)
            model_probabilities = (
                await self._model_probabilities.latest_model_probabilities(fixture.id)
                if self._model_probabilities is not None
                else {}
            )
            evaluations: list[OddsEvaluation] = []
            for item in inserted:
                model_probability = model_probabilities.get(
                    (item.market, item.selection, item.line)
                )
                evaluations.append(
                    evaluate_odds(
                        item,
                        fair_market_probability=fair_by_fingerprint.get(item.fingerprint),
                        model_probability=model_probability,
                    )
                )
            hook_error: str | None = None
            if inserted and self._hook is not None:
                try:
                    await self._hook.on_odds_persisted(
                        fixture,
                        evaluations=tuple(evaluations),
                        movements=movements,
                    )
                except Exception as error:
                    hook_error = f"hook:{type(error).__name__}"
            return OddsFixtureResult(
                fixture_id=fixture.id,
                provider_requests=response.metadata.external_requests,
                accepted=len(snapshots),
                inserted=len(inserted),
                movements=movements,
                evaluations=tuple(evaluations),
                error_code=hook_error,
            )

    def _fair_probabilities(
        self, snapshots: Sequence[NormalizedOddsSnapshot]
    ) -> dict[str, Decimal]:
        groups: dict[tuple[object, ...], list[NormalizedOddsSnapshot]] = defaultdict(list)
        for item in snapshots:
            groups[
                (
                    item.fixture_id,
                    item.provider,
                    item.bookmaker,
                    item.market,
                    item.line,
                    item.is_live,
                    item.captured_at,
                )
            ].append(item)
        fair: dict[str, Decimal] = {}
        for group in groups.values():
            fair.update(devig_probabilities(group))
        return fair

    async def _run(
        self,
        fixtures: Sequence[StoredFixture],
        phase: OddsPhase,
        *,
        empty_reason: str,
    ) -> IngestionReport:
        unique = tuple({(item.provider, item.provider_id): item for item in fixtures}.values())
        if not unique:
            return IngestionReport(worker=WorkerName.ODDS, skipped_reason=empty_reason)

        semaphore = asyncio.Semaphore(self._max_concurrency)

        async def guarded(item: StoredFixture) -> OddsFixtureResult:
            async with semaphore:
                started = monotonic()
                try:
                    result = await self.ingest_fixture(item, phase)
                except Exception as error:
                    result = OddsFixtureResult(
                        fixture_id=item.id,
                        error_code=type(error).__name__,
                    )
                logger.info(
                    "odds_fixture_synced",
                    extra={
                        "worker": WorkerName.ODDS.value,
                        "provider": item.provider,
                        "fixture": item.provider_id,
                        "phase": phase.value,
                        "duration_ms": round((monotonic() - started) * 1000),
                        "accepted": result.accepted,
                        "inserted": result.inserted,
                        "errors": int(result.error_code is not None),
                    },
                )
                return result

        results = await asyncio.gather(*(guarded(item) for item in unique))
        errors = tuple(
            f"fixture={result.fixture_id}:{result.error_code}"
            for result in results
            if result.error_code is not None
        )
        return IngestionReport(
            worker=WorkerName.ODDS,
            fixtures_seen=len(unique),
            fixtures_written=sum(result.inserted > 0 for result in results),
            records_written=sum(result.inserted for result in results),
            provider_requests=sum(result.provider_requests for result in results),
            significant_movements=sum(
                movement.significant for result in results for movement in result.movements
            ),
            errors=errors,
        )
