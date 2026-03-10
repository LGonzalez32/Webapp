import numpy as np
import warnings
from statsmodels.tsa.holtwinters import ExponentialSmoothing


def _seasonal_naive_forecast(values: list[float], horizon: int) -> tuple[list[float], list[float], list[float]]:
    """Fallback: repeat last full year's pattern."""
    period = 12
    n = len(values)
    point = []
    for h in range(1, horizon + 1):
        idx = (n - period + (h - 1)) % period
        if idx < 0:
            idx += period
        ref_idx = n - period + idx
        val = values[ref_idx] if 0 <= ref_idx < n else (np.mean(values) if values else 0.0)
        point.append(max(0.0, float(val)))
    # Wide confidence interval for naive
    lower = [max(0.0, v * 0.6) for v in point]
    upper = [v * 1.4 for v in point]
    return point, lower, upper


def run_ets(values: list[float], horizon: int, confidence: float = 0.80) -> tuple[list[float], list[float], list[float]]:
    """
    Holt-Winters ETS forecast.
    Returns (point_forecasts, lower_bounds, upper_bounds).
    Falls back to seasonal naive on failure.
    """
    n = len(values)
    if n < 6:
        return _seasonal_naive_forecast(values, horizon)

    arr = np.array(values, dtype=float)

    # Determine trend and seasonal components
    use_seasonal = n >= 24
    trend_type = "add" if n >= 12 else None
    seasonal_type = "add" if use_seasonal else None
    seasonal_periods = 12 if use_seasonal else None

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = ExponentialSmoothing(
                arr,
                trend=trend_type,
                seasonal=seasonal_type,
                seasonal_periods=seasonal_periods,
                initialization_method="estimated",
            )
            fit = model.fit(optimized=True, remove_bias=True)

        point = [max(0.0, float(v)) for v in fit.forecast(horizon)]

        # Confidence intervals from simulation
        sim = fit.simulate(horizon, repetitions=200, error="add")
        alpha = 1 - confidence
        lower = [max(0.0, float(np.percentile(sim.iloc[i], alpha / 2 * 100))) for i in range(horizon)]
        upper = [float(np.percentile(sim.iloc[i], (1 - alpha / 2) * 100)) for i in range(horizon)]

        return point, lower, upper

    except Exception:
        return _seasonal_naive_forecast(values, horizon)
