import asyncio
import time
from fastapi import APIRouter, HTTPException
from typing import Literal

from ...models.sales_forecast_models import (
    SalesForecastRequest,
    SalesForecastResponse,
    AnnualPerformanceRequest,
    AnnualPerformanceResponse,
    GenerateForecastResponse,
)
from ...services.sales_forecast_service import (
    generate_sales_forecast,
    persist_forecast_to_supabase,
    get_persisted_forecast,
    build_annual_performance,
    _forecast_cache,
)

router = APIRouter()

SALES_DATA_STORE: list[dict] = []


def set_sales_data(data: list[dict]):
    """Store sales data for forecasting - called from frontend."""
    global SALES_DATA_STORE
    SALES_DATA_STORE = data


def get_sales_data() -> list[dict]:
    """Get stored sales data."""
    return SALES_DATA_STORE


@router.post("/forecast/generate", response_model=GenerateForecastResponse)
async def generate_forecast(request: SalesForecastRequest):
    """Genera forecast de ventas y lo persiste en Supabase."""
    start = time.perf_counter()
    
    try:
        sales_data = get_sales_data()
        
        if not sales_data:
            return GenerateForecastResponse(
                success=False,
                year=request.year,
                vendedor=request.vendedor,
                metric_type=request.metric,
                status="error",
                error="No hay datos de ventas disponibles. Sube datos primero."
            )
        
        forecast = await asyncio.to_thread(
            generate_sales_forecast,
            sales_data,
            request.year,
            request.vendedor,
            request.metric,
            request.horizon_months,
            request.org_id,
            request.snapshot_id
        )
        
        try:
            forecast_id = await asyncio.to_thread(
                persist_forecast_to_supabase,
                forecast,
                request.org_id,
                request.snapshot_id
            )
        except Exception as e:
            forecast_id = None
        
        elapsed_ms = (time.perf_counter() - start) * 1000
        
        return GenerateForecastResponse(
            success=True,
            forecast_id=forecast_id,
            year=request.year,
            vendedor=request.vendedor,
            metric_type=request.metric,
            status="ready",
            message=f"Forecast generado en {elapsed_ms:.0f}ms"
        )
        
    except Exception as e:
        return GenerateForecastResponse(
            success=False,
            year=request.year,
            vendedor=request.vendedor,
            metric_type=request.metric,
            status="error",
            error=str(e)
        )


@router.post("/forecast/performance", response_model=AnnualPerformanceResponse)
async def get_annual_performance(request: AnnualPerformanceRequest):
    """Obtiene datos de rendimiento anual (actuales + forecast)."""
    try:
        sales_data = get_sales_data()
        
        if not sales_data:
            return AnnualPerformanceResponse(
                success=False,
                year=request.year,
                metric=request.metric,
                seller=request.vendedor,
                kpis=None,
                series=None,
                error="No hay datos de ventas disponibles"
            )
        
        existing_forecast = await asyncio.to_thread(
            get_persisted_forecast,
            request.year,
            request.vendedor,
            request.metric,
            request.org_id
        )
        
        if existing_forecast:
            forecast = existing_forecast
        else:
            forecast = await asyncio.to_thread(
                generate_sales_forecast,
                sales_data,
                request.year,
                request.vendedor,
                request.metric,
                12,
                request.org_id,
                request.snapshot_id,
                request.dimension,
                request.dimension_value
            )
        
        kpis, series = build_annual_performance(forecast)
        
        return AnnualPerformanceResponse(
            success=True,
            year=request.year,
            metric=request.metric,
            seller=request.vendedor,
            kpis=kpis,
            series=series,
            model_used=forecast.model_used
        )
        
    except Exception as e:
        return AnnualPerformanceResponse(
            success=False,
            year=request.year,
            metric=request.metric,
            seller=request.vendedor,
            kpis=None,
            series=None,
            error=str(e)
        )


@router.get("/forecast/{year}/{vendedor}/{metric}", response_model=SalesForecastResponse)
async def get_forecast(year: int, vendedor: str, metric: Literal["units", "revenue"], org_id: str | None = None):
    """Obtiene forecast persistido para un vendedor y métrica."""
    try:
        forecast = await asyncio.to_thread(
            get_persisted_forecast,
            year,
            vendedor,
            metric,
            org_id
        )
        
        if not forecast:
            return SalesForecastResponse(
                success=False,
                error=f"No existe forecast para {year}, {vendedor}, {metric}"
            )
        
        return SalesForecastResponse(
            success=True,
            forecast=forecast
        )
        
    except Exception as e:
        return SalesForecastResponse(
            success=False,
            error=str(e)
        )


@router.post("/forecast/sync-data")
async def sync_sales_data(data: dict):
    """Sincroniza datos de ventas desde el frontend para forecasting."""
    try:
        sales_list = data.get("sales", [])
        
        if not sales_list:
            return {"success": False, "error": "No se recibieron datos de ventas"}
        
        normalized = []
        for sale in sales_list:
            normalized.append({
                "fecha": sale.get("fecha"),
                "vendedor": sale.get("vendedor"),
                "unidades": sale.get("unidades", 0),
                "venta_neta": sale.get("venta_neta", 0),
                "producto": sale.get("producto"),
                "cliente": sale.get("cliente"),
            })
        
        set_sales_data(normalized)
        _forecast_cache.clear()  # Invalidate cache on new data

        return {
            "success": True,
            "message": f"Datos sincronizados: {len(normalized)} registros"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
