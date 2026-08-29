from __future__ import annotations

import argparse
import asyncio

from app.core.config import Settings
from app.core.logging import configure_logging
from app.domain.ingestion import WorkerName
from app.services.ingestion.live import LiveIngestionService, LiveIngestionSettings
from app.workers.runtime import (
    build_worker_runtime,
    install_shutdown_handlers,
    run_recorded_cycle,
    run_worker_loop,
)


async def run(
    *,
    run_once: bool | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    runtime = await build_worker_runtime(settings, WorkerName.LIVE)
    service = LiveIngestionService(
        provider=runtime.provider,
        repository=runtime.repository,
        locks=runtime.locks,
        settings=LiveIngestionSettings(
            fixture_poll_seconds=settings.live_fixture_poll_seconds,
            event_poll_seconds=settings.live_event_poll_seconds,
            stats_poll_seconds=settings.live_stats_poll_seconds,
            candidate_lookback_seconds=settings.live_candidate_stale_hours * 3600,
            candidate_lookahead_seconds=settings.live_candidate_warmup_minutes * 60,
            lock_ttl_seconds=settings.live_worker_lock_seconds,
            max_concurrency=settings.live_max_concurrency,
        ),
    )
    if stop_event is None:
        stop_event = asyncio.Event()
        install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(runtime, WorkerName.LIVE, service.run_cycle),
            interval_seconds=settings.live_fixture_poll_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot live ingestion.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
