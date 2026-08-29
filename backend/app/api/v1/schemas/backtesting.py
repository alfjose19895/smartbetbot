from datetime import datetime

from pydantic import BaseModel

from app.core.constants import RESPONSIBLE_USE_NOTICE
from app.domain.backtesting import BacktestFilters, BacktestMetrics


class BacktestResponse(BaseModel):
    filters: BacktestFilters
    metrics: BacktestMetrics
    generated_at: datetime
    methodology: str
    responsible_use_notice: str = RESPONSIBLE_USE_NOTICE
