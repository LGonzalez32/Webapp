import numpy as np
from datetime import datetime, date
from dateutil.relativedelta import relativedelta

from ..models.forecast_models import (
    InventoryItem,
    SaleRecord,
    SKUForecastResult,
    MonthlyPoint,
)
from .outlier_detector import detect_and_clean
from .feature_engineer import extract_features
from .model_selector import select_model
from .ets_model import run_ets
from .arima_model import run_sarima
from .ensemble import run_ensemble


def _build_monthly_series(sales: list[SaleRecord], product: str, today: date) -> dict[str, float]:
    """Aggregate sales by month key (YYYY-MM) for a specific product, excluding current month."""
    current_month_key = today.strftime("%Y-%m")
    monthly: dict[str, float] = {}
    for s in sales:
        if s.Producto != product:
            continue
        try:
            sale_date = datetime.strptime(s.Fecha[:10], "%Y-%m-%d").date()
            key = sale_date.strftime("%Y-%m")
            if key == current_month_key:
                continue  # exclude incomplete current month
            monthly[key] = monthly.get(key, 0.0) + s.Unidades
        except ValueError:
            continue
    return monthly


def _fill_history(monthly: dict[str, float], today: date, n_months: int = 24) -> tuple[list[str], list[float]]:
    """Fill last n_months of complete months (i=n_months..1, never i=0/current month)."""
    keys = []
    values = []
    for i in range(n_months, 0, -1):
        d = today - relativedelta(months=i)
        key = d.strftime("%Y-%m")
        keys.append(key)
        values.append(monthly.get(key, 0.0))
    return keys, values


def _future_keys(today: date, horizon: int) -> list[str]:
    # h=0 → current month (first incomplete month = first forecast point)
    return [(today + relativedelta(months=h)).strftime("%Y-%m") for h in range(horizon)]


def _trend_direction(hist_values: list[float], fc_values: list[float]) -> str:
    hist_total = sum(hist_values[-12:])
    fc_total = sum(fc_values[:12])
    if hist_total == 0:
        return "stable"
    pct = (fc_total - hist_total) / hist_total * 100
    if pct > 5:
        return "up"
    if pct < -5:
        return "down"
    return "stable"


def run_forecast_for_sku(
    item: InventoryItem,
    sales: list[SaleRecord],
    today: date,
    horizon: int,
    confidence: float = 0.80,
) -> SKUForecastResult:
    # Build historical series
    monthly_raw = _build_monthly_series(sales, item.Producto, today)
    hist_keys, hist_values_raw = _fill_history(monthly_raw, today, n_months=24)

    # Outlier detection & cleaning
    outlier_result = detect_and_clean(hist_values_raw)
    hist_values = outlier_result.cleaned

    # Feature extraction
    features = extract_features(hist_values)

    # Model selection
    model_type = select_model(features)

    # Run selected model
    if model_type == "NAIVE":
        mean_val = features["last_3m_avg"] or features["mean"]
        fc_point = [max(0.0, round(mean_val)) for _ in range(horizon)]
        fc_lower = [max(0.0, v * 0.7) for v in fc_point]
        fc_upper = [v * 1.3 for v in fc_point]
    elif model_type == "ETS":
        fc_point, fc_lower, fc_upper = run_ets(hist_values, horizon, confidence)
    elif model_type == "SARIMA":
        fc_point, fc_lower, fc_upper = run_sarima(hist_values, horizon, confidence)
    else:  # ENSEMBLE
        fc_point, fc_lower, fc_upper = run_ensemble(hist_values, features, horizon, confidence)

    # Round forecasts
    fc_point = [round(v) for v in fc_point]
    fc_lower = [round(v) for v in fc_lower]
    fc_upper = [round(v) for v in fc_upper]

    future_keys = _future_keys(today, horizon)

    historical_monthly = [
        MonthlyPoint(monthKey=k, value=round(v))
        for k, v in zip(hist_keys, hist_values_raw)
    ]

    forecast_monthly = [
        MonthlyPoint(monthKey=k, value=p, lower=lo, upper=hi)
        for k, p, lo, hi in zip(future_keys, fc_point, fc_lower, fc_upper)
    ]

    hist_total = sum(hist_values_raw[-12:])
    fc_total = sum(fc_point[:12])
    trend_pct = ((fc_total - hist_total) / hist_total * 100) if hist_total > 0 else 0.0
    avg_monthly = features["mean"]

    return SKUForecastResult(
        productName=item.Producto,
        category=item.Categoria,
        supplier=item.Proveedor,
        historicalMonthly=historical_monthly,
        forecastMonthly=forecast_monthly,
        histTotal=hist_total,
        fcTotal=fc_total,
        trend=round(trend_pct, 2),
        avgMonthly=round(avg_monthly, 2),
        model_used=model_type,
        trend_direction=_trend_direction(hist_values_raw, fc_point),
        outliers_detected=outlier_result.outlier_count,
        confidence_level=confidence,
    )


def run_forecast(
    inventory: list[InventoryItem],
    sales: list[SaleRecord],
    horizon_months: int = 12,
) -> list[SKUForecastResult]:
    today = date.today().replace(day=1)
    results = []
    for item in inventory:
        result = run_forecast_for_sku(item, sales, today, horizon_months)
        results.append(result)
    return results
