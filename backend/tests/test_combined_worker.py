from __future__ import annotations

import asyncio

import pytest

from app.workers import combined


@pytest.mark.anyio
async def test_combined_worker_starts_every_runner_with_one_stop_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, bool | None, asyncio.Event]] = []

    def runner_for(name: str):  # type: ignore[no-untyped-def]
        async def runner(*, run_once: bool | None, stop_event: asyncio.Event) -> None:
            calls.append((name, run_once, stop_event))

        return runner

    names = ("prematch", "live", "odds", "probability", "signals", "settlement", "notifications")
    monkeypatch.setattr(
        combined,
        "WORKER_RUNNERS",
        tuple((name, runner_for(name)) for name in names),
    )
    monkeypatch.setattr(combined, "install_shutdown_handlers", lambda _event: None)

    await combined.run(run_once=True)

    assert [name for name, _run_once, _event in calls] == list(names)
    assert all(run_once is True for _name, run_once, _event in calls)
    assert len({id(event) for _name, _run_once, event in calls}) == 1
    assert calls[0][2].is_set()


@pytest.mark.anyio
async def test_combined_worker_cancels_siblings_when_startup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sibling_cancelled = asyncio.Event()

    async def failing(*, run_once: bool | None, stop_event: asyncio.Event) -> None:
        del run_once, stop_event
        raise RuntimeError("invalid worker configuration")

    async def sibling(*, run_once: bool | None, stop_event: asyncio.Event) -> None:
        del run_once, stop_event
        try:
            await asyncio.Event().wait()
        finally:
            sibling_cancelled.set()

    monkeypatch.setattr(
        combined,
        "WORKER_RUNNERS",
        (("failing", failing), ("sibling", sibling)),
    )
    monkeypatch.setattr(combined, "install_shutdown_handlers", lambda _event: None)

    with pytest.raises(RuntimeError, match="invalid worker configuration"):
        await combined.run(run_once=True)

    assert sibling_cancelled.is_set()
