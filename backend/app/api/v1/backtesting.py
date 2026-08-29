from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.v1.schemas.backtesting import BacktestResponse
from app.core.database import get_connection
from app.core.security import get_current_user
from app.domain.backtesting import BacktestFilters
from app.repositories.backtesting import BacktestRepository
from app.services.backtesting import BacktestEngine

router = APIRouter(
    prefix="/backtests",
    tags=["backtesting"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/run", response_model=BacktestResponse, operation_id="run_backtest")
async def run_backtest(
    filters: BacktestFilters,
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> BacktestResponse:
    result = await BacktestEngine(BacktestRepository(connection)).run(filters)
    return BacktestResponse.model_validate(result.model_dump())
