import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import health, forecast, sales_forecast

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SalesFlow Forecast Engine",
    description="Professional time-series forecast API with ETS, SARIMA, and Ensemble models",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(forecast.router, prefix="/api/v1", tags=["forecast"])
app.include_router(sales_forecast.router, prefix="/api/v1", tags=["sales-forecast"])


@app.on_event("startup")
async def startup_event():
    logger.info("SalesFlow Forecast Engine starting up (env=%s)", settings.app_env)
