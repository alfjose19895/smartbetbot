from __future__ import annotations

import argparse
import asyncio
from decimal import Decimal

from app.core.config import Settings
from app.core.logging import configure_logging
from app.domain.ingestion import IngestionReport, WorkerName
from app.services.intelligence import SignalEngineService
from app.workers.intelligence_runtime import (
    IntelligenceWorkerRuntime,
    build_intelligence_runtime,
)
from app.workers.runtime import install_shutdown_handlers, run_recorded_cycle, run_worker_loop


async def _cycle(runtime: IntelligenceWorkerRuntime) -> IngestionReport:
    settings = runtime.settings
    async with runtime.locks.hold(
        "worker:lock:signal:global", settings.signal_worker_lock_seconds
    ) as acquired:
        if not acquired:
            return IngestionReport(
                worker=WorkerName.SIGNAL,
                skipped_reason="worker_lock_not_acquired",
            )
        service = SignalEngineService(
            runtime.repository,
            target_limit=settings.signal_target_limit,
            material_odds_change=Decimal(str(settings.signal_material_odds_change)),
            material_edge_change=Decimal(str(settings.signal_material_edge_change)),
            material_smart_score_change=Decimal(str(settings.signal_material_smart_score_change)),
        )
        return await service.run_once()


async def run(*, run_once: bool | None = None) -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    runtime = await build_intelligence_runtime(settings)
    stop_event = asyncio.Event()
    install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(
                runtime,  # type: ignore[arg-type]
                WorkerName.SIGNAL,
                lambda: _cycle(runtime),
            ),
            interval_seconds=settings.signal_worker_interval_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot Signal Engine.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
