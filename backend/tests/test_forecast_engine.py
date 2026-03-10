import pytest
from datetime import date, timedelta

from app.models.forecast_models import InventoryItem, SaleRecord
from app.services.forecast_engine import run_forecast, run_forecast_for_sku
from app.services.outlier_detector import detect_and_clean
from app.services.feature_engineer import extract_features
from app.services.model_selector import select_model


# ─── Fixtures ───────────────────────────────────────────────────────────────

def make_item(name: str = "SKU-A", category: str = "Cat1", supplier: str = "SupA") -> InventoryItem:
    return InventoryItem(Producto=name, Stock=100, Categoria=category, Proveedor=supplier, Costo=10.0)


def make_sales(product: str, months: int = 24, base: float = 50.0) -> list[SaleRecord]:
    """Generate synthetic monthly sales going back `months` months."""
    today = date.today().replace(day=1)
    sales = []
    for i in range(months, 0, -1):
        sale_date = (today - timedelta(days=i * 30)).strftime("%Y-%m-%d")
        sales.append(SaleRecord(Fecha=sale_date, Producto=product, Unidades=base + i % 10))
    return sales


# ─── Test 1: Outlier detector removes spikes ────────────────────────────────

def test_outlier_detector_removes_spike():
    values = [50.0] * 20
    values[10] = 5000.0  # obvious spike
    result = detect_and_clean(values)
    assert result.outlier_count >= 1
    assert result.cleaned[10] < 1000.0, "Spike should be cleaned"


# ─── Test 2: Feature engineer returns correct keys ──────────────────────────

def test_feature_engineer_keys():
    values = [float(i) for i in range(24)]
    features = extract_features(values)
    required_keys = {"n_months", "cv", "trend_r2", "has_seasonality", "seasonal_strength", "zero_pct"}
    for key in required_keys:
        assert key in features, f"Missing feature: {key}"


# ─── Test 3: Model selector returns NAIVE for sparse data ───────────────────

def test_model_selector_naive_for_sparse():
    values = [0.0] * 10 + [1.0] * 2  # 83% zeros
    features = extract_features(values)
    model = select_model(features)
    assert model == "NAIVE"


# ─── Test 4: Full forecast pipeline returns correct structure ────────────────

def test_forecast_pipeline_structure():
    item = make_item("SKU-TEST")
    sales = make_sales("SKU-TEST", months=24, base=30.0)
    results = run_forecast([item], sales, horizon_months=12)

    assert len(results) == 1
    r = results[0]
    assert r.productName == "SKU-TEST"
    assert len(r.forecastMonthly) == 12
    assert len(r.historicalMonthly) == 24
    assert r.model_used in {"NAIVE", "ETS", "SARIMA", "ENSEMBLE"}
    assert r.trend_direction in {"up", "down", "stable"}
    assert r.outliers_detected >= 0


# ─── Test 5: Forecast values are non-negative ───────────────────────────────

def test_forecast_values_non_negative():
    item = make_item("SKU-NEG")
    sales = make_sales("SKU-NEG", months=18, base=20.0)
    results = run_forecast([item], sales, horizon_months=6)

    r = results[0]
    for pt in r.forecastMonthly:
        assert pt.value >= 0, f"Negative forecast at {pt.monthKey}: {pt.value}"
        if pt.lower is not None:
            assert pt.lower >= 0, f"Negative lower bound at {pt.monthKey}"
