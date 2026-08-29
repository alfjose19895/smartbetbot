from __future__ import annotations

import argparse
import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.core.config import Settings
from app.core.logging import configure_logging
from app.workers import live, notifications, odds, prematch, probability, settlement, signals
from app.workers.runtime import install_shutdown_handlers

logger = logging.getLogger("smartbetbot.worker.supervisor")

WorkerRunner = Callable[..., Awaitable[None]]

WORKER_RUNNERS: tuple[tuple[str, WorkerRunner], ...] = (
    ("prematch", prematch.run),
    ("live", live.run),
    ("odds", odds.run),
    ("probability", probability.run),
    ("signals", signals.run),
    ("settlement", settlement.run),
    ("notifications", notifications.run),
)


async def run(*, run_once: bool | None = None) -> None:
    """Run every private worker loop under one Railway service."""
    settings = Settings()
    configure_logging(settings.log_level)
    stop_event = asyncio.Event()
    install_shutdown_handlers(stop_event)
    effective_run_once = settings.worker_run_once if run_once is None else run_once
    tasks = [
        asyncio.create_task(
            runner(run_once=effective_run_once, stop_event=stop_event),
            name=f"smartbetbot-{name}",
        )
        for name, runner in WORKER_RUNNERS
    ]
    logger.info(
        "worker_supervisor_started",
        extra={
            "workers": [name for name, _runner in WORKER_RUNNERS],
            "run_once": effective_run_once,
        },
    )
    try:
        await asyncio.gather(*tasks)
    except BaseException:
        stop_event.set()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    finally:
        stop_event.set()
        logger.info("worker_supervisor_stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run all SmartBetBot background workers.")
    parser.add_argument("--once", action="store_true", help="Run one cycle per worker and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
