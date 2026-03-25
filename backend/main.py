import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import health, chat

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SalesFlow Forecast Engine",
    description="Professional time-series forecast API with ETS, SARIMA, and Ensemble models",
    version="1.0.0",
)

_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "https://data-solutions-hub.com,http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])

try:
    from app.api.routes import forecast, sales_forecast
    app.include_router(forecast.router, prefix="/api/v1", tags=["forecast"])
    app.include_router(sales_forecast.router, prefix="/api/v1", tags=["sales-forecast"])
    logger.info("Forecast routers loaded")
except ImportError:
    logger.info("Forecast routers skipped (numpy/pandas not available)")


@app.on_event("startup")
async def startup_event():
    logger.info("SalesFlow Forecast Engine starting up (env=%s)", settings.app_env)
