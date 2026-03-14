from pydantic import BaseModel, Field
from typing import Literal
from datetime import date


class SalesForecastRequest(BaseModel):
    snapshot_id: str | None = None
    org_id: str | None = None
    year: int = Field(default=2026, ge=2020, le=2030)
    vendedor: str = "all"
    metric: Literal["units", "revenue"] = "units"
    horizon_months: int = Field(default=12, ge=1, le=24)


class MonthlyDataPoint(BaseModel):
    month: int = Field(ge=1, le=12, description="Month number (1-12)")
    value: float | None = None


class ForecastDataPoint(BaseModel):
    month: int = Field(ge=1, le=12)
    value: float
    lower_bound: float | None = None
    upper_bound: float | None = None


class SalesForecastResult(BaseModel):
    year: int
    metric: Literal["units", "revenue"]
    vendedor: str
    model_used: str
    actual_monthly: list[MonthlyDataPoint] = []
    forecast_monthly: list[ForecastDataPoint] = []
    prior_year_monthly: list[MonthlyDataPoint] = []
    meta_monthly: list[MonthlyDataPoint] = []
    ytd_actual: float = 0
    ytd_prior_year: float = 0
    best_month: int | None = None
    best_month_value: float = 0
    projected_year_total: float = 0
    trend_pct: float = 0
    generated_at: str | None = None


class SalesForecastResponse(BaseModel):
    success: bool = True
    forecast: SalesForecastResult | None = None
    error: str | None = None
    message: str | None = None


class AnnualPerformanceRequest(BaseModel):
    snapshot_id: str | None = None
    org_id: str | None = None
    year: int = Field(default=2026, ge=2020, le=2030)
    vendedor: str = "all"
    metric: Literal["units", "revenue"] = "units"
    dimension: Literal["vendedor", "producto", "cliente", "canal"] = "vendedor"
    dimension_value: str = "all"


class AnnualPerformanceKPIs(BaseModel):
    ytd: float = 0
    ytd_prior_year: float = 0
    vs_prior_year_pct: float | None = None
    best_month: MonthlyDataPoint | None = None
    projected_year_total: float = 0


class SeriesDataPoint(BaseModel):
    month: int
    value: float | None = None


class AnnualPerformanceSeries(BaseModel):
    actual_current_year: list[SeriesDataPoint] = []
    prior_year: list[SeriesDataPoint] = []
    forecast: list[SeriesDataPoint] = []
    meta: list[SeriesDataPoint] = []


class AnnualPerformanceResponse(BaseModel):
    success: bool = True
    year: int
    metric: str
    seller: str
    kpis: AnnualPerformanceKPIs
    series: AnnualPerformanceSeries
    error: str | None = None


class GenerateForecastResponse(BaseModel):
    success: bool = True
    forecast_id: str | None = None
    year: int
    vendedor: str
    metric_type: str
    status: str
    message: str | None = None
    error: str | None = None
