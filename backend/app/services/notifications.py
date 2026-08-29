from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, time
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.domain.ingestion import IngestionReport, WorkerName
from app.domain.notifications import PushSendResult, QueuedNotification
from app.providers.push import PushProvider


class NotificationRepositoryProtocol(Protocol):
    async def list_queued(self, *, limit: int) -> tuple[QueuedNotification, ...]: ...

    async def mark_sent(
        self, notification_id: object, *, message_id: str | None, sent_at: datetime
    ) -> None: ...

    async def mark_failed(
        self, notification_id: object, *, error_code: str, metadata: dict[str, object]
    ) -> None: ...


def is_quiet_time(notification: QueuedNotification, now: datetime) -> bool:
    if (
        not notification.quiet_hours_enabled
        or notification.quiet_hours_start is None
        or notification.quiet_hours_end is None
    ):
        return False
    try:
        local = now.astimezone(ZoneInfo(notification.timezone))
    except ZoneInfoNotFoundError:
        local = now.astimezone(UTC)
    current: time = local.timetz().replace(tzinfo=None)
    start = notification.quiet_hours_start
    end = notification.quiet_hours_end
    if start < end:
        return start <= current < end
    return current >= start or current < end


class NotificationService:
    def __init__(
        self,
        repository: NotificationRepositoryProtocol,
        provider: PushProvider,
        *,
        target_limit: int = 100,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = repository
        self.provider = provider
        self.target_limit = target_limit
        self.clock = clock or (lambda: datetime.now(UTC))

    async def run_once(self) -> IngestionReport:
        queued = await self.repository.list_queued(limit=self.target_limit)
        if not queued:
            return IngestionReport(
                worker=WorkerName.NOTIFICATION,
                skipped_reason="no_queued_notifications",
            )
        sent = 0
        errors: list[str] = []
        quiet = 0
        for notification in queued:
            now = self.clock()
            if is_quiet_time(notification, now):
                quiet += 1
                continue
            results: list[PushSendResult] = []
            for token in notification.tokens:
                results.append(
                    await self.provider.send(
                        token=token,
                        title=notification.title,
                        body=notification.body,
                        data={
                            "signal_id": str(notification.signal_id),
                            "url": f"/signals/{notification.signal_id}",
                        },
                    )
                )
            successful = next((item for item in results if item.success), None)
            if successful:
                await self.repository.mark_sent(
                    notification.id,
                    message_id=successful.provider_message_id,
                    sent_at=now,
                )
                sent += 1
            else:
                error_code = next(
                    (item.error_code for item in results if item.error_code),
                    "push_delivery_failed",
                )
                await self.repository.mark_failed(
                    notification.id,
                    error_code=error_code,
                    metadata={"tokens_attempted": len(results)},
                )
                errors.append(f"notification:{notification.id}:{error_code}")
        return IngestionReport(
            worker=WorkerName.NOTIFICATION,
            records_written=sent,
            skipped_reason="quiet_hours" if quiet == len(queued) else None,
            errors=tuple(errors),
        )
