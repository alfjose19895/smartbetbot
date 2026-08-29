from __future__ import annotations

from datetime import UTC, datetime, time
from uuid import UUID

import pytest

from app.domain.notifications import PushSendResult, QueuedNotification
from app.services.notifications import NotificationService, is_quiet_time

NOTIFICATION_ID = UUID("10000000-0000-4000-8000-000000000001")
USER_ID = UUID("20000000-0000-4000-8000-000000000001")
SIGNAL_ID = UUID("30000000-0000-4000-8000-000000000001")


def _notification(**changes: object) -> QueuedNotification:
    values: dict[str, object] = {
        "id": NOTIFICATION_ID,
        "user_id": USER_ID,
        "signal_id": SIGNAL_ID,
        "title": "SmartBetBot Signal",
        "body": "Home vs Away · OVER · Score 88",
        "timezone": "America/Guayaquil",
        "quiet_hours_enabled": True,
        "quiet_hours_start": time(22),
        "quiet_hours_end": time(7),
        "tokens": ("token-that-is-long-enough-0001",),
        "metadata": {},
    }
    values.update(changes)
    return QueuedNotification.model_validate(values)


def test_quiet_hours_support_overnight_and_daytime_ranges() -> None:
    overnight = _notification()
    daytime = _notification(
        quiet_hours_start=time(9),
        quiet_hours_end=time(12),
    )

    # Ecuador is UTC-5: 04:00 UTC is 23:00 local on the previous day.
    assert is_quiet_time(overnight, datetime(2026, 8, 25, 4, tzinfo=UTC)) is True
    assert is_quiet_time(overnight, datetime(2026, 8, 25, 16, tzinfo=UTC)) is False
    assert is_quiet_time(daytime, datetime(2026, 8, 25, 15, tzinfo=UTC)) is True


class _Provider:
    def __init__(self, success: bool) -> None:
        self.success = success
        self.sent: list[str] = []

    async def send(self, *, token: str, **_values: object) -> PushSendResult:
        self.sent.append(token)
        return PushSendResult(
            success=self.success,
            provider_message_id="message-1" if self.success else None,
            error_code=None if self.success else "invalid_registration",
        )

    async def close(self) -> None:
        return None


class _Repository:
    def __init__(self, notification: QueuedNotification) -> None:
        self.notification = notification
        self.sent = 0
        self.failed = 0

    async def list_queued(self, *, limit: int) -> tuple[QueuedNotification, ...]:
        assert limit == 10
        return (self.notification,)

    async def mark_sent(self, *_args: object, **_kwargs: object) -> None:
        self.sent += 1

    async def mark_failed(self, *_args: object, **_kwargs: object) -> None:
        self.failed += 1


@pytest.mark.anyio
async def test_notification_service_sends_and_updates_queue() -> None:
    repository = _Repository(_notification(quiet_hours_enabled=False))
    provider = _Provider(True)
    service = NotificationService(
        repository,  # type: ignore[arg-type]
        provider,
        target_limit=10,
        clock=lambda: datetime(2026, 8, 25, 15, tzinfo=UTC),
    )

    report = await service.run_once()

    assert report.records_written == 1
    assert repository.sent == 1
    assert repository.failed == 0
    assert provider.sent == ["token-that-is-long-enough-0001"]


@pytest.mark.anyio
async def test_notification_service_keeps_quiet_notifications_queued() -> None:
    repository = _Repository(_notification())
    provider = _Provider(True)
    service = NotificationService(
        repository,  # type: ignore[arg-type]
        provider,
        target_limit=10,
        clock=lambda: datetime(2026, 8, 25, 4, tzinfo=UTC),
    )

    report = await service.run_once()

    assert report.skipped_reason == "quiet_hours"
    assert repository.sent == repository.failed == 0
    assert provider.sent == []
