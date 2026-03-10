import asyncio
import time
from fastapi import APIRouter

from ...models.forecast_models import ForecastRequest, ForecastResponse
from ...services.forecast_engine import run_forecast

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
async def forecast(request: ForecastRequest):
    start = time.perf_counter()

    # Run CPU-bound forecast in thread pool to avoid blocking the event loop
    results = await asyncio.to_thread(
        run_forecast,
        request.inventory,
        request.sales,
        request.horizon_months,
    )

    elapsed_ms = (time.perf_counter() - start) * 1000

    return ForecastResponse(
        results=results,
        total_skus=len(results),
        processing_time_ms=round(elapsed_ms, 2),
    )
