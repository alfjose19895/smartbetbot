from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router
from app.api.v1.admin import router as admin_router
from app.api.v1.backtesting import router as backtesting_router
from app.api.v1.fixtures import router as fixtures_router
from app.api.v1.performance import router as performance_router
from app.api.v1.signals import router as signals_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(fixtures_router)
api_router.include_router(signals_router)
api_router.include_router(performance_router)
api_router.include_router(accounts_router)
api_router.include_router(admin_router)
api_router.include_router(backtesting_router)
