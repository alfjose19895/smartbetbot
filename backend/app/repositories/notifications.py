from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.notifications import QueuedNotification


class NotificationRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def list_queued(self, *, limit: int) -> tuple[QueuedNotification, ...]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    select n.id, n.user_id, n.signal_id, n.title, n.body,
                      preferences.timezone, preferences.quiet_hours_enabled,
                      preferences.quiet_hours_start, preferences.quiet_hours_end,
                      array_agg(subscription.fcm_token order by subscription.id) as tokens,
                      n.metadata
                    from public.notifications n
                    join public.user_preferences preferences on preferences.user_id = n.user_id
                    join public.push_subscriptions subscription
                      on subscription.user_id = n.user_id and subscription.is_enabled
                    where n.status = 'queued' and n.channel = 'push'
                    group by n.id, preferences.timezone, preferences.quiet_hours_enabled,
                      preferences.quiet_hours_start, preferences.quiet_hours_end
                    order by n.created_at, n.id
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
            return tuple(QueuedNotification.model_validate(dict(row)) for row in result.mappings())

    async def mark_sent(
        self, notification_id: UUID, *, message_id: str | None, sent_at: datetime
    ) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    update public.notifications
                    set status = 'sent', provider_message_id = :message_id,
                      sent_at = :sent_at, error_code = null
                    where id = :notification_id and status = 'queued'
                    """
                ),
                {
                    "notification_id": notification_id,
                    "message_id": message_id,
                    "sent_at": sent_at,
                },
            )

    async def mark_failed(
        self, notification_id: UUID, *, error_code: str, metadata: dict[str, object]
    ) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    update public.notifications
                    set status = 'failed', error_code = :error_code,
                      metadata = metadata || cast(:metadata as jsonb)
                    where id = :notification_id and status = 'queued'
                    """
                ),
                {
                    "notification_id": notification_id,
                    "error_code": error_code,
                    "metadata": json.dumps(metadata),
                },
            )
