from __future__ import annotations

import asyncio
import json

from app.core.config import Settings
from app.domain.sports import LeagueQuery
from app.providers.sports.factory import build_sports_data_provider


async def verify() -> None:
    settings = Settings()
    provider = build_sports_data_provider(settings)
    try:
        response = await provider.list_leagues(LeagueQuery(external_id="39", current_only=True))
        if not response.items:
            raise RuntimeError("API-Football returned no data for the smoke-test league")
        print(
            json.dumps(
                {
                    "status": "ok",
                    "provider": response.metadata.provider,
                    "operation": response.metadata.operation,
                    "normalized_leagues": len(response.items),
                    "current_seasons": sum(
                        season.is_current for league in response.items for season in league.seasons
                    ),
                    "external_requests": response.metadata.external_requests,
                    "from_cache": response.metadata.from_cache,
                    "quota_limit": response.metadata.quota_limit,
                    "quota_remaining": response.metadata.quota_remaining,
                },
                separators=(",", ":"),
            )
        )
    finally:
        await provider.close()


if __name__ == "__main__":
    asyncio.run(verify())
