"""Realtime Worker orchestrator for SmartBetBot.

Runs all live, odds, probability, signal engine, and notification loops
concurrently in a single Railway service with graceful shutdown and error isolation.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.core.config import Settings
from app.core.logging import configure_logging
from app.workers import live, notifications, odds, probability, signals
from app.workers.runtime import install_shutdown_handlers

logger = logging.getLogger("smartbetbot.worker.realtime")

WorkerRunner = Callable[..., Awaitable[None]]


def get_runners() -> tuple[tuple[str, WorkerRunner], ...]:
    return (
        ("live", live.run),
        ("odds", odds.run),
        ("probability", probability.run),
        ("signals", signals.run),
        ("notifications", notifications.run),
    )


async def run(*, run_once: bool | None = None, stop_event: asyncio.Event | None = None) -> None:
    """Run realtime ingestion, intelligence, and notification loops."""
    settings = Settings()
    configure_logging(settings.log_level)
    event = stop_event or asyncio.Event()
    install_shutdown_handlers(event)
    effective_run_once = settings.worker_run_once if run_once is None else run_once
    runners = get_runners()

    tasks = [
        asyncio.create_task(
            runner(run_once=effective_run_once, stop_event=event),
            name=f"smartbetbot-realtime-{name}",
        )
        for name, runner in runners
    ]
    logger.info(
        "realtime_worker_started",
        extra={
            "workers": [name for name, _ in runners],
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
        logger.info("realtime_worker_stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot realtime worker.")
    parser.add_argument("--once", action="store_true", help="Run one cycle per worker and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
