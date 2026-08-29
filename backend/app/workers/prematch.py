from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from app.core.config import Settings
from app.core.logging import configure_logging
from app.domain.ingestion import IngestionReport, WorkerName
from app.services.ingestion.odds import OddsIngestionService
from app.services.ingestion.prematch import PrematchIngestionPolicy, PrematchIngestionService
from app.workers.runtime import (
    WorkerRuntime,
    build_worker_runtime,
    install_shutdown_handlers,
    run_recorded_cycle,
    run_worker_loop,
)


def _merge_reports(
    prematch: IngestionReport,
    odds: IngestionReport | None,
) -> IngestionReport:
    if odds is None:
        return prematch
    return prematch.model_copy(
        update={
            "records_written": prematch.records_written + odds.records_written,
            "provider_requests": prematch.provider_requests + odds.provider_requests,
            "significant_movements": odds.significant_movements,
            "errors": prematch.errors + tuple(f"odds:{error}" for error in odds.errors),
        }
    )


async def _run_prematch_cycle(runtime: WorkerRuntime) -> IngestionReport:
    settings = runtime.settings
    league_ids = settings.prematch_league_id_list
    lock_key = f"worker:lock:prematch:{runtime.provider.name}:catalog"
    async with runtime.locks.hold(
        lock_key,
        ttl_seconds=settings.prematch_worker_lock_seconds,
    ) as acquired:
        if not acquired:
            return IngestionReport(
                worker=WorkerName.PREMATCH,
                skipped_reason="worker_lock_not_acquired",
            )

        service = PrematchIngestionService(runtime.provider, runtime.repository)
        report = await service.run_once(
            PrematchIngestionPolicy(
                league_external_ids=league_ids,
                season_override=settings.prematch_season_override,
                context_lookahead_days=settings.prematch_lookahead_days,
                lineup_window_minutes=settings.prematch_lineup_window_minutes,
                prediction_window_hours=settings.prematch_prediction_horizon_hours,
                h2h_window_days=settings.prematch_lookahead_days,
                h2h_last=settings.prematch_h2h_last,
                quota_reserve=settings.prematch_quota_reserve,
                max_enriched_fixtures_per_season=settings.prematch_enrichment_limit,
            )
        )
        if not league_ids or settings.prematch_odds_limit == 0:
            return report

        targets = await runtime.repository.list_prematch_odds_targets(
            provider=runtime.provider.name,
            league_provider_ids=league_ids,
            now=datetime.now(UTC),
            horizon_hours=settings.prematch_odds_horizon_hours,
            limit=settings.prematch_odds_limit,
        )
        odds_service = OddsIngestionService(
            provider=runtime.provider,
            repository=runtime.repository,
            distributed_lock=runtime.locks,
            model_probabilities=runtime.repository,
            significant_movement_threshold=Decimal(
                str(settings.odds_movement_relative_price_change)
            ),
            significant_probability_delta=Decimal(str(settings.odds_movement_probability_delta)),
            prematch_bucket_seconds=settings.prematch_sync_interval_seconds,
            lock_ttl_seconds=settings.odds_worker_lock_seconds,
            max_concurrency=settings.live_max_concurrency,
            target_limit=settings.odds_target_limit,
        )
        return _merge_reports(report, await odds_service.ingest_prematch(targets))


async def run(
    *,
    run_once: bool | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    runtime = await build_worker_runtime(settings, WorkerName.PREMATCH)
    if stop_event is None:
        stop_event = asyncio.Event()
        install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(
                runtime,
                WorkerName.PREMATCH,
                lambda: _run_prematch_cycle(runtime),
            ),
            interval_seconds=settings.prematch_sync_interval_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot prematch ingestion.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
