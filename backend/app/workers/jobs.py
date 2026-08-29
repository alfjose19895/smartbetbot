"""Jobs Worker orchestrator for SmartBetBot.

Runs prematch synchronization, catalog updates, settlement of completed matches,
and background maintenance in a single Railway service.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.core.config import Settings
from app.core.logging import configure_logging
from app.workers import prematch, settlement
from app.workers.runtime import install_shutdown_handlers

logger = logging.getLogger("smartbetbot.worker.jobs")

WorkerRunner = Callable[..., Awaitable[None]]


def get_runners() -> tuple[tuple[str, WorkerRunner], ...]:
    return (
        ("prematch", prematch.run),
        ("settlement", settlement.run),
    )


async def run(*, run_once: bool | None = None, stop_event: asyncio.Event | None = None) -> None:
    """Run prematch synchronization and settlement jobs."""
    settings = Settings()
    configure_logging(settings.log_level)
    event = stop_event or asyncio.Event()
    install_shutdown_handlers(event)
    effective_run_once = settings.worker_run_once if run_once is None else run_once
    runners = get_runners()

    tasks = [
        asyncio.create_task(
            runner(run_once=effective_run_once, stop_event=event),
            name=f"smartbetbot-jobs-{name}",
        )
        for name, runner in runners
    ]
    logger.info(
        "jobs_worker_started",
        extra={
            "jobs": [name for name, _ in runners],
            "run_once": effective_run_once,
        },
    )
    try:
        await asyncio.gather(*tasks)
    except BaseException:
        event.set()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    finally:
        event.set()
        logger.info("jobs_worker_stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot jobs worker.")
    parser.add_argument("--once", action="store_true", help="Run one cycle per job and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
