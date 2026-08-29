from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import ApiError, ConflictError
from app.repositories.base import fetch_one

PREFERENCE_COLUMNS = {
    "minimum_smart_score",
    "minimum_probability",
    "minimum_edge",
    "live_enabled",
    "prematch_enabled",
    "markets",
    "league_ids",
    "quiet_hours_enabled",
    "quiet_hours_start",
    "quiet_hours_end",
    "timezone",
}


class AccountRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self.connection = connection

    async def get_me(self, *, user_id: UUID, email: str | None) -> dict[str, Any] | None:
        row = await fetch_one(
            self.connection,
            """
            select
              p.id,
              p.display_name,
              p.avatar_url,
              p.role,
              p.timezone,
              p.created_at,
              p.updated_at,
              jsonb_build_object(
                'minimum_smart_score', up.minimum_smart_score,
                'minimum_probability', up.minimum_probability::double precision,
                'minimum_edge', up.minimum_edge::double precision,
                'live_enabled', up.live_enabled,
                'prematch_enabled', up.prematch_enabled,
                'markets', up.markets,
                'league_ids', up.league_ids,
                'quiet_hours_enabled', up.quiet_hours_enabled,
                'quiet_hours_start', up.quiet_hours_start,
                'quiet_hours_end', up.quiet_hours_end,
                'timezone', up.timezone,
                'updated_at', up.updated_at
              ) as preferences
            from public.profiles as p
            join public.user_preferences as up on up.user_id = p.id
            where p.id = :user_id
            """,
            {"user_id": user_id},
        )
        if row is not None:
            row["email"] = email
        return row

    async def get_role(self, user_id: UUID) -> str | None:
        row = await fetch_one(
            self.connection,
            "select role from public.profiles where id = :user_id",
            {"user_id": user_id},
        )
        return str(row["role"]) if row else None

    async def update_preferences(
        self,
        *,
        user_id: UUID,
        changes: dict[str, Any],
        email: str | None,
    ) -> dict[str, Any] | None:
        invalid_columns = changes.keys() - PREFERENCE_COLUMNS
        if invalid_columns:
            raise ValueError(f"Unsupported preference columns: {sorted(invalid_columns)}")

        if changes:
            assignments = ", ".join(f"{column} = :{column}" for column in sorted(changes))
            parameters = {"user_id": user_id, **changes}
            try:
                result = await self.connection.execute(
                    text(
                        f"""
                        update public.user_preferences
                        set {assignments}
                        where user_id = :user_id
                        """
                    ),
                    parameters,
                )
                if result.rowcount == 0:
                    await self.connection.rollback()
                    return None
                await self.connection.commit()
            except IntegrityError as exc:
                await self.connection.rollback()
                raise ApiError(
                    status_code=422,
                    code="preference_constraint_failed",
                    message="The preference combination is not valid.",
                ) from exc

        return await self.get_me(user_id=user_id, email=email)

    async def register_push(
        self,
        *,
        user_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        row = await fetch_one(
            self.connection,
            """
            insert into public.push_subscriptions (
              user_id, fcm_token, device_id, platform, user_agent, is_enabled, last_seen_at
            )
            values (
              :user_id, :fcm_token, :device_id, :platform, :user_agent, true, now()
            )
            on conflict (user_id, fcm_token) do update
            set device_id = excluded.device_id,
                platform = excluded.platform,
                user_agent = excluded.user_agent,
                is_enabled = true,
                last_seen_at = now(),
                updated_at = now()
            returning id, device_id, platform, is_enabled, last_seen_at, created_at, updated_at
            """,
            {"user_id": user_id, **payload},
        )
        await self.connection.commit()
        if row is None:
            raise ConflictError("The push subscription could not be registered.")
        return row

    async def delete_push(self, *, user_id: UUID, fcm_token: str) -> bool:
        result = await self.connection.execute(
            text(
                """
                delete from public.push_subscriptions
                where user_id = :user_id and fcm_token = :fcm_token
                """
            ),
            {"user_id": user_id, "fcm_token": fcm_token},
        )
        await self.connection.commit()
        return bool(result.rowcount)
