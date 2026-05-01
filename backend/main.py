import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent / ".env")

from app.core.config import settings
from app.api.routes import health, chat

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """QW1 — singleton httpx.AsyncClient with explicit timeouts/limits/h2.

    Defaults to a per-request client are wrong for LLM streaming:
      * timeout=5s default would kill 12s diagnoses.
      * No connection pool reuse → TLS handshake each request (~50-150ms).
      * No keepalive → DeepSeek h2 connection rebuilt each time.

    These settings enable HTTP/2 (saves an RTT on connection setup) and a
    pool sized for a small Render Pro instance.
    """
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0),
        limits=httpx.Limits(
            max_connections=50,
            max_keepalive_connections=20,
            keepalive_expiry=30.0,
        ),
        http2=True,
    )
    logger.info("SalesFlow Forecast Engine starting up (env=%s)", settings.app_env)
    try:
        yield
    finally:
        await app.state.http_client.aclose()


app = FastAPI(
    title="SalesFlow Forecast Engine",
    description="Professional time-series forecast API with ETS, SARIMA, and Ensemble models",
    version="1.0.0",
    lifespan=lifespan,
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


@app.get("/")
async def root():
    """Root health check for Render."""
    return {"status": "ok", "service": "salesflow-backend"}

try:
    from app.api.routes import forecast, sales_forecast
    app.include_router(forecast.router, prefix="/api/v1", tags=["forecast"])
    app.include_router(sales_forecast.router, prefix="/api/v1", tags=["sales-forecast"])
    logger.info("Forecast routers loaded")
except ImportError:
    logger.info("Forecast routers skipped (numpy/pandas not available)")
