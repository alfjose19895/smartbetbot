from __future__ import annotations

import argparse
import asyncio
from types import SimpleNamespace

from app.core.config import Settings
from app.core.database import create_database_engine
from app.core.logging import configure_logging
from app.domain.ingestion import IngestionReport, WorkerName
from app.providers.push import FirebasePushProvider
from app.repositories.ingestion import WorkerRunRepository
from app.repositories.notifications import NotificationRepository
from app.services.notifications import NotificationService
from app.workers.intelligence_runtime import InternalIntelligenceProvider
from app.workers.runtime import (
    WorkerConfigurationError,
    _build_lock_manager,
    install_shutdown_handlers,
    run_recorded_cycle,
    run_worker_loop,
)


async def run(*, run_once: bool | None = None) -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    credentials = (
        settings.firebase_project_id,
        settings.firebase_client_email,
        settings.firebase_private_key_value,
    )
    engine = create_database_engine(settings)
    if engine is None:
        raise WorkerConfigurationError("DATABASE_URL is required for notification worker.")
    locks = _build_lock_manager(settings)
    runtime_base = SimpleNamespace(
        settings=settings,
        engine=engine,
        provider=InternalIntelligenceProvider(),
        locks=locks,
        repository=NotificationRepository(engine),
        runs=WorkerRunRepository(engine),
    )
    if not all(credentials):

        async def missing_credentials() -> IngestionReport:
            return IngestionReport(
                worker=WorkerName.NOTIFICATION,
                skipped_reason="firebase_credentials_missing",
            )

        try:
            await run_recorded_cycle(
                runtime_base,  # type: ignore[arg-type]
                WorkerName.NOTIFICATION,
                missing_credentials,
            )
        finally:
            await locks.close()
            await engine.dispose()
        return

    provider = FirebasePushProvider(
        project_id=settings.firebase_project_id or "",
        client_email=settings.firebase_client_email or "",
        private_key=settings.firebase_private_key_value or "",
    )
    repository = runtime_base.repository
    runtime = SimpleNamespace(
        settings=settings,
        engine=engine,
        provider=InternalIntelligenceProvider(),
        locks=locks,
        repository=repository,
        runs=WorkerRunRepository(engine),
    )

    async def cycle() -> IngestionReport:
        async with locks.hold(
            "worker:lock:notification:global", settings.notification_worker_lock_seconds
        ) as acquired:
            if not acquired:
                return IngestionReport(
                    worker=WorkerName.NOTIFICATION,
                    skipped_reason="worker_lock_not_acquired",
                )
            return await NotificationService(
                repository,
                provider,
                target_limit=settings.notification_target_limit,
            ).run_once()

    stop_event = asyncio.Event()
    install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(
                runtime,  # type: ignore[arg-type]
                WorkerName.NOTIFICATION,
                cycle,
            ),
            interval_seconds=settings.notification_worker_interval_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await provider.close()
        await locks.close()
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot FCM notifications.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
