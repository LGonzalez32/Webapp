import numpy as np
from scipy.stats import linregress
from typing import TypedDict


class Features(TypedDict):
    n_months: int
    n_nonzero: int
    zero_pct: float
    mean: float
    std: float
    cv: float
    trend_slope: float
    trend_r2: float
    last_3m_avg: float
    last_6m_avg: float
    last_12m_avg: float
    has_seasonality: bool
    seasonal_strength: float
    max_value: float
    min_nonzero: float
    range_ratio: float


def extract_features(values: list[float]) -> Features:
    arr = np.array(values, dtype=float)
    n = len(arr)

    nonzero = arr[arr > 0]
    n_nonzero = len(nonzero)
    zero_pct = (n - n_nonzero) / max(1, n)

    mean = float(np.mean(arr)) if n > 0 else 0.0
    std = float(np.std(arr)) if n > 0 else 0.0
    cv = std / mean if mean > 0 else 0.0

    # Linear trend via OLS
    if n >= 4:
        x = np.arange(n, dtype=float)
        slope, _, r_value, _, _ = linregress(x, arr)
        trend_slope = float(slope)
        trend_r2 = float(r_value ** 2)
    else:
        trend_slope = 0.0
        trend_r2 = 0.0

    # Recent averages
    last_3m_avg = float(np.mean(arr[-3:])) if n >= 3 else mean
    last_6m_avg = float(np.mean(arr[-6:])) if n >= 6 else mean
    last_12m_avg = float(np.mean(arr[-12:])) if n >= 12 else mean

    # Seasonality: autocorrelation at lag 12
    has_seasonality = False
    seasonal_strength = 0.0
    if n >= 24:
        try:
            autocorr = float(np.corrcoef(arr[:-12], arr[12:])[0, 1])
            if not np.isnan(autocorr):
                seasonal_strength = abs(autocorr)
                has_seasonality = autocorr > 0.3
        except Exception:
            pass

    max_value = float(np.max(arr)) if n > 0 else 0.0
    min_nonzero = float(np.min(nonzero)) if n_nonzero > 0 else 0.0
    range_ratio = (max_value - min_nonzero) / mean if mean > 0 else 0.0

    return Features(
        n_months=n,
        n_nonzero=n_nonzero,
        zero_pct=zero_pct,
        mean=mean,
        std=std,
        cv=cv,
        trend_slope=trend_slope,
        trend_r2=trend_r2,
        last_3m_avg=last_3m_avg,
        last_6m_avg=last_6m_avg,
        last_12m_avg=last_12m_avg,
        has_seasonality=has_seasonality,
        seasonal_strength=seasonal_strength,
        max_value=max_value,
        min_nonzero=min_nonzero,
        range_ratio=range_ratio,
    )
