"""Tests for consolidated realtime and jobs worker runners."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.workers import jobs, realtime


@pytest.mark.anyio
async def test_realtime_worker_runs_all_subworkers_and_stops() -> None:
    stop_event = asyncio.Event()

    mock_live = AsyncMock()
    mock_odds = AsyncMock()
    mock_prob = AsyncMock()
    mock_signals = AsyncMock()
    mock_notif = AsyncMock()

    mock_runners = (
        ("live", mock_live),
        ("odds", mock_odds),
        ("probability", mock_prob),
        ("signals", mock_signals),
        ("notifications", mock_notif),
    )

    with patch.object(realtime, "get_runners", return_value=mock_runners):
        await realtime.run(run_once=True, stop_event=stop_event)

        assert mock_live.call_count == 1
        assert mock_odds.call_count == 1
        assert mock_prob.call_count == 1
        assert mock_signals.call_count == 1
        assert mock_notif.call_count == 1


@pytest.mark.anyio
async def test_jobs_worker_runs_prematch_and_settlement() -> None:
    stop_event = asyncio.Event()

    mock_prematch = AsyncMock()
    mock_settlement = AsyncMock()

    mock_runners = (
        ("prematch", mock_prematch),
        ("settlement", mock_settlement),
    )

    with patch.object(jobs, "get_runners", return_value=mock_runners):
        await jobs.run(run_once=True, stop_event=stop_event)

        assert mock_prematch.call_count == 1
        assert mock_settlement.call_count == 1
