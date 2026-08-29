from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.core.database import create_database_engine
from app.providers.locks import WorkerLockManager
from app.repositories.ingestion import WorkerRunRepository
from app.repositories.intelligence import IntelligenceRepository
from app.workers.runtime import WorkerConfigurationError, _build_lock_manager


class InternalIntelligenceProvider:
    name = "internal_intelligence"

    async def close(self) -> None:
        return None


@dataclass(slots=True)
class IntelligenceWorkerRuntime:
    settings: Settings
    engine: AsyncEngine
    provider: InternalIntelligenceProvider
    locks: WorkerLockManager
    repository: IntelligenceRepository
    runs: WorkerRunRepository

    async def close(self) -> None:
        await self.locks.close()
        await self.engine.dispose()


async def build_intelligence_runtime(settings: Settings) -> IntelligenceWorkerRuntime:
    engine = create_database_engine(settings)
    if engine is None:
        raise WorkerConfigurationError("DATABASE_URL is required for intelligence workers.")
    try:
        locks = _build_lock_manager(settings)
    except Exception:
        await engine.dispose()
        raise
    return IntelligenceWorkerRuntime(
        settings=settings,
        engine=engine,
        provider=InternalIntelligenceProvider(),
        locks=locks,
        repository=IntelligenceRepository(engine),
        runs=WorkerRunRepository(engine),
    )
