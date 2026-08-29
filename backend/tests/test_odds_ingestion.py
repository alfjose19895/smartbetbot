from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

import pytest

from app.domain.ingestion import NormalizedOddsSnapshot, PreviousOddsSnapshot, StoredFixture
from app.domain.sports import (
    Bookmaker,
    OddsMarket,
    OddsPhase,
    OddsQuery,
    OddsQuote,
    OddsSelection,
    ProviderRef,
    ProviderRequestMetadata,
    ProviderResponse,
)
from app.services.ingestion.odds import (
    OddsIngestionService,
    calculate_movement,
    devig_probabilities,
    evaluate_odds,
    normalize_odds_quote,
    raw_implied_probability,
)

NOW = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)
FIXTURE_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def ref(value: str) -> ProviderRef:
    return ProviderRef(provider="api_football", external_id=value)


def fixture(provider_id: str = "123") -> StoredFixture:
    return StoredFixture(
        id=FIXTURE_ID,
        provider="api_football",
        provider_id=provider_id,
        league_provider_id="39",
        home_team_provider_id="1",
        away_team_provider_id="2",
        season=2026,
        kickoff_at=NOW,
        status="live",
        match_minute=61,
    )


def quote(
    *,
    market: str,
    selection: str,
    odds: str = "1.65",
    phase: OddsPhase = OddsPhase.LIVE,
    line: str | None = None,
    captured_at: datetime = NOW,
    match_minute: int | None = 61,
    canonical_market: str | None = None,
    canonical_selection: str | None = None,
    stopped: bool = False,
) -> OddsQuote:
    return OddsQuote(
        fixture_ref=ref("123"),
        bookmaker=Bookmaker(ref=ref("6"), name="Example Book"),
        market=OddsMarket(ref=ref("5"), name=market, canonical_name=canonical_market),
        selection=OddsSelection(
            ref=ref(f"selection-{selection}"),
            name=selection,
            canonical_name=canonical_selection,
        ),
        phase=phase,
        decimal_odds=Decimal(odds),
        captured_at=captured_at,
        line=Decimal(line) if line is not None else None,
        match_minute=match_minute,
        stopped=stopped,
    )


def normalize(value: OddsQuote, *, bucket_seconds: int = 15) -> NormalizedOddsSnapshot:
    result = normalize_odds_quote(value, fixture(), bucket_seconds=bucket_seconds)
    assert result is not None
    return result


@pytest.mark.parametrize(
    ("market", "selection", "phase", "line", "minute", "expected"),
    [
        (
            "Goals Over/Under",
            "Over 0.5",
            OddsPhase.PREMATCH,
            None,
            None,
            ("total_goals", "over", "0.500"),
        ),
        (
            "Over/Under",
            "Over 1.5",
            OddsPhase.PREMATCH,
            None,
            None,
            ("total_goals", "over", "1.500"),
        ),
        (
            "Goals Over/Under",
            "Under 2.5",
            OddsPhase.PREMATCH,
            None,
            None,
            ("total_goals", "under", "2.500"),
        ),
        (
            "Both Teams To Score",
            "Yes",
            OddsPhase.PREMATCH,
            None,
            None,
            ("both_teams_to_score", "yes", None),
        ),
        ("Match Winner", "X", OddsPhase.PREMATCH, None, None, ("match_winner", "draw", None)),
        (
            "Double Chance",
            "Home or Draw",
            OddsPhase.PREMATCH,
            None,
            None,
            ("double_chance", "1x", None),
        ),
        ("Double Chance", "Draw/Away", OddsPhase.LIVE, None, 50, ("double_chance", "x2", None)),
        (
            "Goals Over/Under",
            "Under 3.5",
            OddsPhase.LIVE,
            None,
            50,
            ("total_goals", "under", "3.500"),
        ),
        ("Next Goal", "Draw", OddsPhase.LIVE, None, 50, ("next_goal", "no_goal", None)),
    ],
)
def test_normalizes_exact_mvp_markets(
    market: str,
    selection: str,
    phase: OddsPhase,
    line: str | None,
    minute: int | None,
    expected: tuple[str, str, str | None],
) -> None:
    snapshot = normalize(
        quote(
            market=market,
            selection=selection,
            phase=phase,
            line=line,
            match_minute=minute,
        ),
        bucket_seconds=15 if phase == OddsPhase.LIVE else 10800,
    )

    assert (snapshot.market, snapshot.selection) == expected[:2]
    assert (format(snapshot.line, "f") if snapshot.line is not None else None) == expected[2]
    assert snapshot.raw_implied_probability == Decimal("0.606061")
    assert snapshot.raw_payload["normalization_version"] == "odds:v1"
    assert "key" not in str(snapshot.raw_payload).lower()


@pytest.mark.parametrize(
    "value",
    [
        quote(market="Match Winner - First Half", selection="Home"),
        quote(market="Double Chance", selection="12"),
        quote(market="Next Goal", selection="Home", match_minute=None),
        quote(
            market="Goals Over/Under",
            selection="Under 1.5",
            phase=OddsPhase.PREMATCH,
            match_minute=None,
        ),
        quote(market="Correct Score", selection="1-0"),
    ],
)
def test_rejects_period_specific_or_non_mvp_quotes(value: OddsQuote) -> None:
    assert normalize_odds_quote(value, fixture(), bucket_seconds=15) is None


def test_rejects_quote_for_a_different_fixture() -> None:
    value = quote(market="Match Winner", selection="Home").model_copy(
        update={"fixture_ref": ref("999")}
    )

    assert normalize_odds_quote(value, fixture(), bucket_seconds=15) is None


def test_fingerprint_deduplicates_a_bucket_but_preserves_changes_and_returns() -> None:
    first = normalize(quote(market="Match Winner", selection="Home", odds="1.90"))
    same_bucket = normalize(
        quote(
            market="Match Winner",
            selection="Home",
            odds="1.90",
            captured_at=NOW + timedelta(seconds=8),
        )
    )
    changed = normalize(
        quote(
            market="Match Winner",
            selection="Home",
            odds="1.70",
            captured_at=NOW + timedelta(seconds=8),
        )
    )
    returned_later = normalize(
        quote(
            market="Match Winner",
            selection="Home",
            odds="1.90",
            captured_at=NOW + timedelta(seconds=16),
        )
    )

    assert first.fingerprint == same_bucket.fingerprint
    assert changed.fingerprint != first.fingerprint
    assert returned_later.fingerprint != first.fingerprint


def test_implied_probability_and_movement_use_decimal_math() -> None:
    current = normalize(quote(market="Match Winner", selection="Home", odds="1.62"))
    previous = PreviousOddsSnapshot(
        decimal_odds=Decimal("1.91"),
        raw_implied_probability=raw_implied_probability(Decimal("1.91")),
        captured_at=NOW - timedelta(minutes=4),
    )

    movement = calculate_movement(
        current,
        previous,
        significant_threshold=Decimal("0.05"),
    )

    assert movement is not None
    assert movement.odds_change == Decimal("-0.151832")
    assert movement.implied_probability_change == Decimal("0.093724")
    assert movement.direction == "shortening"
    assert movement.significant is True
    assert (
        calculate_movement(
            current,
            previous.model_copy(update={"captured_at": NOW + timedelta(seconds=1)}),
            significant_threshold=Decimal("0.05"),
        )
        is None
    )


def test_devig_requires_all_non_overlapping_sides() -> None:
    snapshots = tuple(
        normalize(quote(market="Match Winner", selection=selection, odds=odds))
        for selection, odds in (("Home", "2.00"), ("Draw", "4.00"), ("Away", "4.00"))
    )

    fair = devig_probabilities(snapshots)

    assert fair[snapshots[0].fingerprint] == Decimal("0.500000")
    assert fair[snapshots[1].fingerprint] == Decimal("0.250000")
    assert devig_probabilities(snapshots[:2]) == {}


def test_probability_delta_can_make_a_price_movement_significant() -> None:
    current = normalize(quote(market="Match Winner", selection="Home", odds="1.80"))
    previous = PreviousOddsSnapshot(
        decimal_odds=Decimal("1.90"),
        raw_implied_probability=raw_implied_probability(Decimal("1.90")),
        captured_at=NOW - timedelta(minutes=1),
    )

    movement = calculate_movement(
        current,
        previous,
        significant_threshold=Decimal("0.10"),
        significant_probability_delta=Decimal("0.02"),
    )

    assert movement is not None
    assert abs(movement.odds_change) < Decimal("0.10")
    assert movement.implied_probability_change >= Decimal("0.02")
    assert movement.significant is True


def test_edge_exists_only_when_own_model_probability_is_supplied() -> None:
    snapshot = normalize(quote(market="Match Winner", selection="Home", odds="2.00"))

    without_model = evaluate_odds(snapshot, fair_market_probability=Decimal("0.45"))
    with_model = evaluate_odds(
        snapshot,
        fair_market_probability=Decimal("0.45"),
        model_probability=Decimal("0.60"),
    )

    assert without_model.edge is None
    assert without_model.model_probability is None
    assert with_model.edge == Decimal("0.150000")


def metadata(requests: int = 1) -> ProviderRequestMetadata:
    return ProviderRequestMetadata(
        provider="api_football",
        operation="live_odds",
        requested_at=NOW,
        duration_ms=5,
        external_requests=requests,
    )


class FakeProvider:
    name = "api_football"

    def __init__(self, responses: dict[str, tuple[OddsQuote, ...] | Exception]) -> None:
        self.responses = responses
        self.calls: list[OddsQuery] = []
        self.active = 0
        self.max_active = 0

    async def get_odds(self, query: OddsQuery) -> ProviderResponse[OddsQuote]:
        self.calls.append(query)
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0)
        self.active -= 1
        value = self.responses[query.fixture_external_ids[0]]
        if isinstance(value, Exception):
            raise value
        return ProviderResponse(items=value, metadata=metadata())


class FakeRepository:
    def __init__(self, targets: tuple[StoredFixture, ...] = ()) -> None:
        self.targets = targets
        self.previous: PreviousOddsSnapshot | None = None
        self.fingerprints: set[str] = set()
        self.append_calls: list[tuple[NormalizedOddsSnapshot, ...]] = []
        self.list_calls = 0

    async def list_active_odds_targets(self, *, limit: int) -> tuple[StoredFixture, ...]:
        self.list_calls += 1
        return self.targets[:limit]

    async def latest_odds(
        self, fixture_id: UUID, *, is_live: bool
    ) -> dict[tuple[str, str, str, Decimal | None], PreviousOddsSnapshot]:
        del fixture_id, is_live
        if self.previous is None:
            return {}
        return {("Example Book", "match_winner", "home", None): self.previous}

    async def persist_odds(self, snapshots: tuple[NormalizedOddsSnapshot, ...]) -> frozenset[str]:
        self.append_calls.append(snapshots)
        inserted = {item.fingerprint for item in snapshots} - self.fingerprints
        self.fingerprints.update(inserted)
        return frozenset(inserted)


class FakeLock:
    def __init__(self, *, contended: set[str] | None = None) -> None:
        self.contended = contended or set()
        self.acquired: list[tuple[str, int]] = []
        self.released: list[tuple[str, str]] = []

    @asynccontextmanager
    async def hold(self, key: str, ttl_seconds: int) -> AsyncIterator[bool]:
        self.acquired.append((key, ttl_seconds))
        acquired = not any(value in key for value in self.contended)
        try:
            yield acquired
        finally:
            if acquired:
                self.released.append((key, f"token-{key}"))


class FixedModelProbability:
    async def latest_model_probabilities(
        self, fixture_id: UUID
    ) -> dict[tuple[str, str, Decimal | None], Decimal]:
        del fixture_id
        return {("match_winner", "home", None): Decimal("0.80")}


def service(
    provider: FakeProvider,
    repository: FakeRepository,
    lock: FakeLock,
    **kwargs: Any,
) -> OddsIngestionService:
    return OddsIngestionService(
        provider=provider,  # type: ignore[arg-type]
        repository=repository,
        distributed_lock=lock,
        **kwargs,
    )


@pytest.mark.anyio
async def test_zero_live_targets_make_zero_provider_calls() -> None:
    provider = FakeProvider({})
    repository = FakeRepository()

    report = await service(provider, repository, FakeLock()).run_live_cycle()

    assert report.skipped_reason == "no_active_fixtures"
    assert report.provider_requests == 0
    assert provider.calls == []


@pytest.mark.anyio
async def test_live_cycle_persists_once_tracks_movement_and_injects_model_probability() -> None:
    home = quote(market="Match Winner", selection="Home", odds="1.62")
    unsupported = quote(market="Correct Score", selection="1-0", odds="8.00")
    provider = FakeProvider({"123": (home, home, unsupported)})
    repository = FakeRepository((fixture(),))
    repository.previous = PreviousOddsSnapshot(
        decimal_odds=Decimal("1.91"),
        raw_implied_probability=raw_implied_probability(Decimal("1.91")),
        captured_at=NOW - timedelta(minutes=4),
    )
    lock = FakeLock()

    report = await service(
        provider,
        repository,
        lock,
        model_probabilities=FixedModelProbability(),
    ).run_live_cycle()

    assert report.fixtures_seen == 1
    assert report.fixtures_written == 1
    assert report.records_written == 1
    assert report.significant_movements == 1
    assert len(repository.append_calls[0]) == 1
    assert lock.released[0][1].startswith("token-worker:lock:odds")


@pytest.mark.anyio
async def test_odds_hook_receives_only_new_evaluations_and_movements() -> None:
    calls: list[tuple[int, int]] = []

    class Hook:
        async def on_odds_persisted(
            self,
            _fixture: StoredFixture,
            *,
            evaluations: tuple[object, ...],
            movements: tuple[object, ...],
        ) -> None:
            calls.append((len(evaluations), len(movements)))

    provider = FakeProvider({"123": (quote(market="Match Winner", selection="Home", odds="1.62"),)})
    repository = FakeRepository((fixture(),))
    repository.previous = PreviousOddsSnapshot(
        decimal_odds=Decimal("1.91"),
        raw_implied_probability=raw_implied_probability(Decimal("1.91")),
        captured_at=NOW - timedelta(minutes=4),
    )

    report = await service(provider, repository, FakeLock(), hook=Hook()).run_live_cycle()

    assert report.errors == ()
    assert calls == [(1, 1)]


@pytest.mark.anyio
async def test_lock_contention_skips_fixture_without_provider_call() -> None:
    provider = FakeProvider({"123": (quote(market="Match Winner", selection="Home"),)})
    repository = FakeRepository((fixture(),))

    report = await service(
        provider,
        repository,
        FakeLock(contended={"123"}),
    ).run_live_cycle()

    assert report.fixtures_seen == 1
    assert report.records_written == 0
    assert provider.calls == []


@pytest.mark.anyio
async def test_fixture_failures_are_isolated_and_concurrency_is_bounded() -> None:
    fixture_2 = fixture("456").model_copy(
        update={"id": UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")}
    )
    valid_2 = quote(market="Match Winner", selection="Away").model_copy(
        update={"fixture_ref": ref("456")}
    )
    provider = FakeProvider(
        {
            "123": RuntimeError("upstream body must not leak"),
            "456": (valid_2,),
        }
    )
    repository = FakeRepository((fixture(), fixture_2))

    report = await service(
        provider,
        repository,
        FakeLock(),
        max_concurrency=1,
    ).run_live_cycle()

    assert report.records_written == 1
    assert provider.max_active == 1
    assert len(report.errors) == 1
    assert "RuntimeError" in report.errors[0]
    assert "upstream body" not in report.errors[0]


@pytest.mark.anyio
async def test_prematch_uses_shared_service_and_distinct_lock_scope() -> None:
    prematch_quote = quote(
        market="Double Chance",
        selection="1X",
        phase=OddsPhase.PREMATCH,
        match_minute=None,
    )
    provider = FakeProvider({"123": (prematch_quote,)})
    repository = FakeRepository()
    lock = FakeLock()

    report = await service(provider, repository, lock).ingest_prematch((fixture(),))

    assert report.records_written == 1
    assert provider.calls[0].phase == OddsPhase.PREMATCH
    assert lock.acquired[0][0].endswith(":prematch")


@pytest.mark.anyio
async def test_provider_error_releases_owned_lock() -> None:
    provider = FakeProvider({"123": RuntimeError("failure")})
    repository = FakeRepository((fixture(),))
    lock = FakeLock()

    report = await service(provider, repository, lock).run_live_cycle()

    assert report.records_written == 0
    assert len(report.errors) == 1
    assert len(lock.released) == 1
