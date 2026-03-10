from pydantic import BaseModel, Field
from typing import Literal


class SaleRecord(BaseModel):
    Fecha: str
    Producto: str
    Unidades: float


class InventoryItem(BaseModel):
    Producto: str
    Stock: float
    Categoria: str
    Proveedor: str
    Costo: float


class ForecastRequest(BaseModel):
    inventory: list[InventoryItem]
    sales: list[SaleRecord]
    horizon_months: int = Field(default=12, ge=1, le=24)
    org_id: str | None = None
    session_id: str | None = None


class MonthlyPoint(BaseModel):
    monthKey: str
    value: float
    lower: float | None = None
    upper: float | None = None


class SKUForecastResult(BaseModel):
    productName: str
    category: str
    supplier: str
    historicalMonthly: list[MonthlyPoint]
    forecastMonthly: list[MonthlyPoint]
    histTotal: float
    fcTotal: float
    trend: float
    avgMonthly: float
    model_used: Literal["NAIVE", "ETS", "SARIMA", "ENSEMBLE"]
    trend_direction: Literal["up", "down", "stable"]
    outliers_detected: int
    confidence_level: float = 0.80


class ForecastResponse(BaseModel):
    results: list[SKUForecastResult]
    total_skus: int
    processing_time_ms: float
    engine_version: str = "1.0.0"
