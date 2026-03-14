from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from typing import Literal
import uuid

from ..models.sales_forecast_models import (
    SalesForecastResult,
    MonthlyDataPoint,
    ForecastDataPoint,
    AnnualPerformanceKPIs,
    AnnualPerformanceSeries,
    SeriesDataPoint,
)
from ..core.supabase_client import get_supabase
from .ets_model import run_ets
from .arima_model import run_sarima


def _get_monthly_sales_by_dimension(
    sales_data: list[dict],
    year: int,
    vendedor: str,
    metric: Literal["units", "revenue"],
    dimension: str = "vendedor",
    dimension_value: str = "all"
) -> dict[int, float]:
    """Agrega ventas por mes filtrando por vendedor y/o dimensión."""
    monthly: dict[int, float] = {m: 0.0 for m in range(1, 13)}
    
    for sale in sales_data:
        sale_vendedor = sale.get("vendedor", "")
        sale_date = sale.get("fecha")
        sale_units = float(sale.get("unidades", 0))
        sale_revenue = float(sale.get("venta_neta", 0))
        
        if vendedor != "all" and sale_vendedor.lower() != vendedor.lower():
            continue

        if dimension_value != "all":
            sale_dim_val = str(sale.get(dimension) or "")
            if sale_dim_val.lower() != dimension_value.lower():
                continue

        if not sale_date:
            continue
            
        try:
            if isinstance(sale_date, str):
                dt = datetime.strptime(sale_date[:10], "%Y-%m-%d").date()
            else:
                dt = sale_date
                
            if dt.year == year:
                month = dt.month
                value = sale_revenue if metric == "revenue" else sale_units
                monthly[month] += value
        except (ValueError, TypeError):
            continue
    
    return monthly


def _get_prior_year_sales(
    sales_data: list[dict],
    year: int,
    vendedor: str,
    metric: Literal["units", "revenue"],
    dimension: str = "vendedor",
    dimension_value: str = "all"
) -> dict[int, float]:
    """Obtiene ventas del año anterior."""
    return _get_monthly_sales_by_dimension(sales_data, year - 1, vendedor, metric, dimension, dimension_value)


def _build_historical_series(
    current_year_sales: dict[int, float],
    prior_year_sales: dict[int, float],
    months_of_history: int = 24
) -> list[float]:
    """Construye serie histórica para forecasting (meses hacia atrás)."""
    series = []
    today = date.today()
    
    for i in range(months_of_history, 0, -1):
        d = today - relativedelta(months=i)
        year, month = d.year, d.month
        
        if year == today.year and month == today.month + 1:
            continue
            
        if year == today.year:
            value = current_year_sales.get(month, 0)
        elif year == today.year - 1:
            value = prior_year_sales.get(month, 0)
        else:
            value = 0
            
        series.append(value)
    
    return series


def _run_simple_forecast(
    historical_values: list[float],
    horizon: int,
    confidence: float = 0.80
) -> tuple[list[float], list[float], list[float]]:
    """Ejecuta forecast simple usando media móvil si no hay modelos disponibles."""
    if not historical_values or sum(historical_values) == 0:
        avg = 100.0
    else:
        avg = sum(historical_values[-6:]) / min(6, len(historical_values))
    
    forecast = [round(avg) for _ in range(horizon)]
    
    std = 0
    if len(historical_values) > 1:
        variance = sum((x - avg) ** 2 for x in historical_values) / len(historical_values)
        std = variance ** 0.5
    
    z_score = 1.28 if confidence == 0.80 else 1.96
    lower = [max(0, round(v - z_score * std)) for v in forecast]
    upper = [round(v + z_score * std) for v in forecast]
    
    return forecast, lower, upper


def _run_ets_forecast(
    historical_values: list[float],
    horizon: int,
    confidence: float = 0.80
) -> tuple[list[float], list[float], list[float]]:
    """Ejecuta forecast usando ETS."""
    try:
        return run_ets(historical_values, horizon, confidence)
    except Exception:
        return _run_simple_forecast(historical_values, horizon, confidence)


def _run_sarima_forecast(
    historical_values: list[float],
    horizon: int,
    confidence: float = 0.80
) -> tuple[list[float], list[float], list[float]]:
    """Ejecuta forecast usando SARIMA."""
    try:
        return run_sarima(historical_values, horizon, confidence)
    except Exception:
        return _run_simple_forecast(historical_values, horizon, confidence)


def _select_model(historical_values: list[float]) -> str:
    """Selecciona el mejor modelo basado en los datos."""
    if not historical_values:
        return "SIMPLE"
    
    zeros = sum(1 for v in historical_values if v == 0)
    if zeros > len(historical_values) * 0.5:
        return "SIMPLE"
    
    if len(historical_values) < 12:
        return "ETS"
    
    return "SARIMA"


def generate_sales_forecast(
    sales_data: list[dict],
    year: int,
    vendedor: str,
    metric: Literal["units", "revenue"],
    horizon_months: int = 12,
    org_id: str | None = None,
    snapshot_id: str | None = None,
    dimension: str = "vendedor",
    dimension_value: str = "all"
) -> SalesForecastResult:
    """Genera forecast de ventas para un vendedor y métrica específicos."""
    
    current_year_sales = _get_monthly_sales_by_dimension(sales_data, year, vendedor, metric, dimension, dimension_value)
    prior_year_sales = _get_prior_year_sales(sales_data, year, vendedor, metric, dimension, dimension_value)
    
    historical = []
    for m in range(1, 13):
        if m in prior_year_sales:
            historical.append(prior_year_sales[m])
    for m in range(1, 13):
        if m in current_year_sales:
            historical.append(current_year_sales[m])
    
    model = _select_model(historical)
    
    if model == "SARIMA":
        fc_point, fc_lower, fc_upper = _run_sarima_forecast(historical, horizon_months)
    elif model == "ETS":
        fc_point, fc_lower, fc_upper = _run_ets_forecast(historical, horizon_months)
    else:
        fc_point, fc_lower, fc_upper = _run_simple_forecast(historical, horizon_months)
    
    today = date.today()
    current_month = today.month
    months_to_forecast = min(horizon_months, 12 - current_month)
    
    actual_monthly = []
    forecast_monthly = []
    prior_year_monthly = []
    meta_monthly = []
    
    for m in range(1, 13):
        if m <= current_month:
            val = current_year_sales.get(m, 0)
            actual_monthly.append(MonthlyDataPoint(month=m, value=val if val > 0 else None))
            forecast_monthly.append(ForecastDataPoint(month=m, value=0, lower_bound=None, upper_bound=None))
        else:
            actual_monthly.append(MonthlyDataPoint(month=m, value=None))
            idx = m - current_month - 1
            if idx < len(fc_point):
                forecast_monthly.append(ForecastDataPoint(
                    month=m,
                    value=fc_point[idx],
                    lower_bound=fc_lower[idx] if fc_lower else None,
                    upper_bound=fc_upper[idx] if fc_upper else None
                ))
            else:
                forecast_monthly.append(ForecastDataPoint(month=m, value=0))
        
        prior_year_monthly.append(MonthlyDataPoint(
            month=m,
            value=prior_year_sales.get(m, 0) if prior_year_sales.get(m, 0) > 0 else None
        ))
        meta_monthly.append(MonthlyDataPoint(month=m, value=None))
    
    ytd_actual = sum(current_year_sales.get(m, 0) for m in range(1, current_month + 1))
    ytd_prior = sum(prior_year_sales.get(m, 0) for m in range(1, current_month + 1))
    
    best_month = 1
    best_val = 0
    for m in range(1, current_month + 1):
        if current_year_sales.get(m, 0) > best_val:
            best_val = current_year_sales.get(m, 0)
            best_month = m
    
    projected = ytd_actual
    for m in range(current_month + 1, 13):
        idx = m - current_month - 1
        if idx < len(fc_point):
            projected += fc_point[idx]
    
    hist_total = sum(historical[-12:]) if len(historical) >= 12 else sum(historical)
    fc_total = sum(fc_point[:12])
    trend_pct = ((fc_total - hist_total) / hist_total * 100) if hist_total > 0 else 0
    
    return SalesForecastResult(
        year=year,
        metric=metric,
        vendedor=vendedor,
        model_used=model,
        actual_monthly=actual_monthly,
        forecast_monthly=forecast_monthly,
        prior_year_monthly=prior_year_monthly,
        meta_monthly=meta_monthly,
        ytd_actual=ytd_actual,
        ytd_prior_year=ytd_prior,
        best_month=best_month if best_val > 0 else None,
        best_month_value=best_val,
        projected_year_total=round(projected),
        trend_pct=round(trend_pct, 2),
        generated_at=datetime.now().isoformat()
    )


def persist_forecast_to_supabase(
    forecast: SalesForecastResult,
    org_id: str | None = None,
    snapshot_id: str | None = None
) -> str:
    """Persiste el forecast en Supabase y retorna el ID."""
    supabase = get_supabase()
    
    forecast_id = str(uuid.uuid4())
    
    forecast_record = {
        "id": forecast_id,
        "org_id": org_id,
        "snapshot_id": snapshot_id,
        "forecast_year": forecast.year,
        "vendedor": forecast.vendedor,
        "metric_type": forecast.metric,
        "status": "ready",
        "model_used": forecast.model_used,
        "generated_at": forecast.generated_at,
        "created_at": datetime.now().isoformat()
    }
    
    supabase.table("sales_forecasts").insert(forecast_record).execute()
    
    for fp in forecast.forecast_monthly:
        if fp.value > 0:
            result_record = {
                "forecast_id": forecast_id,
                "org_id": org_id,
                "forecast_year": forecast.year,
                "forecast_month": fp.month,
                "vendedor": forecast.vendedor,
                "metric_type": forecast.metric,
                "forecast_value": fp.value,
                "lower_bound": fp.lower_bound,
                "upper_bound": fp.upper_bound,
                "is_actual": False,
                "created_at": datetime.now().isoformat()
            }
            supabase.table("sales_forecast_results").insert(result_record).execute()
    
    for am in forecast.actual_monthly:
        if am.value and am.value > 0:
            result_record = {
                "forecast_id": forecast_id,
                "org_id": org_id,
                "forecast_year": forecast.year,
                "forecast_month": am.month,
                "vendedor": forecast.vendedor,
                "metric_type": forecast.metric,
                "forecast_value": am.value,
                "lower_bound": None,
                "upper_bound": None,
                "is_actual": True,
                "created_at": datetime.now().isoformat()
            }
            supabase.table("sales_forecast_results").insert(result_record).execute()
    
    return forecast_id


def get_persisted_forecast(
    year: int,
    vendedor: str,
    metric: Literal["units", "revenue"],
    org_id: str | None = None
) -> SalesForecastResult | None:
    """Recupera forecast persistido desde Supabase."""
    supabase = get_supabase()
    
    query = supabase.table("sales_forecasts").select("*").eq("forecast_year", year).eq("vendedor", vendedor).eq("metric_type", metric).order("created_at", desc=True).limit(1)
    
    if org_id:
        query = query.eq("org_id", org_id)
    
    result = query.execute()
    
    if not result.data or len(result.data) == 0:
        return None
    
    forecast_meta = result.data[0]
    forecast_id = forecast_meta["id"]
    
    results_query = supabase.table("sales_forecast_results").select("*").eq("forecast_id", forecast_id).order("forecast_month")
    results = results_query.execute()
    
    if not results.data:
        return None
    
    actual_monthly = [MonthlyDataPoint(month=m, value=0) for m in range(1, 13)]
    forecast_monthly = [ForecastDataPoint(month=m, value=0) for m in range(1, 13)]
    prior_year_monthly = [MonthlyDataPoint(month=m, value=None) for m in range(1, 13)]
    
    for r in results.data:
        m = r["forecast_month"]
        if r["is_actual"]:
            actual_monthly[m-1] = MonthlyDataPoint(month=m, value=r["forecast_value"])
        else:
            forecast_monthly[m-1] = ForecastDataPoint(
                month=m,
                value=r["forecast_value"],
                lower_bound=r.get("lower_bound"),
                upper_bound=r.get("upper_bound")
            )
    
    ytd_actual = sum(a.value for a in actual_monthly[:date.today().month] if a.value)
    
    forecast_vals = [f.value for f in forecast_monthly if f.month > date.today().month]
    projected = ytd_actual + sum(forecast_vals)
    
    return SalesForecastResult(
        year=year,
        metric=metric,
        vendedor=vendedor,
        model_used=forecast_meta.get("model_used", "UNKNOWN"),
        actual_monthly=actual_monthly,
        forecast_monthly=forecast_monthly,
        prior_year_monthly=prior_year_monthly,
        meta_monthly=[MonthlyDataPoint(month=m, value=None) for m in range(1, 13)],
        ytd_actual=ytd_actual,
        ytd_prior_year=0,
        best_month=None,
        best_month_value=0,
        projected_year_total=round(projected),
        trend_pct=0,
        generated_at=forecast_meta.get("generated_at")
    )


def build_annual_performance(
    forecast: SalesForecastResult,
) -> tuple[AnnualPerformanceKPIs, AnnualPerformanceSeries]:
    """Construye el payload de rendimiento anual para la UI."""
    
    vs_prior_pct = None
    if forecast.ytd_prior_year > 0:
        vs_prior_pct = ((forecast.ytd_actual - forecast.ytd_prior_year) / forecast.ytd_prior_year) * 100
    
    kpis = AnnualPerformanceKPIs(
        ytd=forecast.ytd_actual,
        ytd_prior_year=forecast.ytd_prior_year,
        vs_prior_year_pct=round(vs_prior_pct, 1) if vs_prior_pct is not None else None,
        best_month=MonthlyDataPoint(month=forecast.best_month, value=forecast.best_month_value) if forecast.best_month else None,
        projected_year_total=forecast.projected_year_total
    )
    
    actual_series = []
    forecast_series = []
    prior_series = []
    meta_series = []
    
    for m in range(1, 13):
        actual = forecast.actual_monthly[m-1]
        fc = forecast.forecast_monthly[m-1]
        prior = forecast.prior_year_monthly[m-1]
        
        actual_series.append(SeriesDataPoint(month=m, value=actual.value if actual.value and actual.value > 0 else None))
        
        if fc.month > date.today().month:
            forecast_series.append(SeriesDataPoint(month=m, value=fc.value if fc.value > 0 else None))
        else:
            forecast_series.append(SeriesDataPoint(month=m, value=None))
        
        prior_series.append(SeriesDataPoint(month=m, value=prior.value if prior.value and prior.value > 0 else None))
        meta_series.append(SeriesDataPoint(month=m, value=None))
    
    series = AnnualPerformanceSeries(
        actual_current_year=actual_series,
        prior_year=prior_series,
        forecast=forecast_series,
        meta=meta_series
    )
    
    return kpis, series
