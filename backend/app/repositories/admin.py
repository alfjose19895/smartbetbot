from __future__ import annotations

from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncConnection

from app.repositories.base import fetch_one, fetch_page


class AdminRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self.connection = connection

    async def list_resource(
        self,
        resource: Literal["workers", "api_usage", "models", "strategies"],
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], int]:
        statements = {
            "workers": """
                select
                  id, worker, started_at, finished_at, status, fixtures_processed,
                  signals_generated, errors, duration_ms, metadata,
                  count(*) over() as total_count
                from public.worker_runs
                order by started_at desc, id
                limit :limit offset :offset
            """,
            "api_usage": """
                select
                  id, provider, endpoint, http_method, response_status, requests_used,
                  rate_limit_remaining, duration_ms, request_id, worker, fixture_id, requested_at,
                  count(*) over() as total_count
                from public.api_usage
                order by requested_at desc, id desc
                limit :limit offset :offset
            """,
            "models": """
                select
                  id, name, version, model_type, status, training_started_at,
                  training_finished_at, training_data_cutoff, evaluation_metrics,
                  calibration_metrics, artifact_uri, is_active, created_at, updated_at,
                  count(*) over() as total_count
                from public.model_versions
                order by created_at desc, id
                limit :limit offset :offset
            """,
            "strategies": """
                select
                  id, name, slug, market, is_live, enabled,
                  min_probability::double precision as min_probability,
                  min_edge::double precision as min_edge,
                  min_smart_score,
                  min_data_quality::double precision as min_data_quality,
                  min_odds::double precision as min_odds,
                  max_odds::double precision as max_odds,
                  cooldown_seconds, config_json, created_at, updated_at,
                  count(*) over() as total_count
                from public.strategies
                order by name, id
                limit :limit offset :offset
            """,
        }
        return await fetch_page(
            self.connection,
            statements[resource],
            {"limit": limit, "offset": offset},
        )

    async def overview(self) -> dict[str, Any]:
        row = await fetch_one(
            self.connection,
            """
            select
              (select count(*)::integer from public.api_usage
                where requested_at >= now() - interval '24 hours') as api_requests_24h,
              (select avg(duration_ms)::double precision from public.api_usage
                where requested_at >= now() - interval '24 hours')
                as provider_average_latency_ms_24h,
              (select count(*)::integer from public.api_usage
                where requested_at >= now() - interval '24 hours'
                  and (response_status >= 400 or response_status is null)) as provider_errors_24h,
              (select count(*)::integer from public.signals
                where triggered_at >= now() - interval '24 hours') as signals_24h,
              (select count(*)::integer from public.strategies where enabled) as active_strategies,
              (select name || ':' || version from public.model_versions
                where is_active order by updated_at desc limit 1) as current_model,
              coalesce((
                select jsonb_agg(to_jsonb(latest) order by latest.worker)
                from (
                  select distinct on (worker)
                    id, worker, started_at, finished_at, status, fixtures_processed,
                    signals_generated, errors, duration_ms, metadata
                  from public.worker_runs
                  order by worker, started_at desc, id desc
                ) latest
              ), '[]'::jsonb) as workers
            """,
        )
        assert row is not None
        return row
