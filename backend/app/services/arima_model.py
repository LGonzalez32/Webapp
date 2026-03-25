import numpy as np
import warnings
import threading
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller

# Timeout per candidate fit (seconds)
_MAX_FIT_SECONDS = 5


def _is_stationary(values: np.ndarray) -> bool:
    try:
        result = adfuller(values, autolag="AIC")
        return result[1] < 0.05
    except Exception:
        return True


def _fit_with_timeout(arr, order, seasonal_order, maxiter, timeout):
    """Fit SARIMAX with a timeout. Returns fit result or None."""
    result_container = [None]
    error_container = [None]

    def _fit():
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = SARIMAX(
                    arr,
                    order=order,
                    seasonal_order=seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                result_container[0] = model.fit(disp=False, maxiter=maxiter)
        except Exception as e:
            error_container[0] = e

    t = threading.Thread(target=_fit, daemon=True)
    t.start()
    t.join(timeout=timeout)

    if t.is_alive():
        # Timed out — thread will eventually finish but we ignore it
        return None
    if error_container[0]:
        return None
    return result_container[0]


def run_sarima(values: list[float], horizon: int, confidence: float = 0.80) -> tuple[list[float], list[float], list[float]]:
    """
    SARIMAX forecast with ADF stationarity test.
    Falls back through simpler orders on failure.
    Each candidate has a 5-second timeout and maxiter=50.
    Returns (point_forecasts, lower_bounds, upper_bounds).
    """
    if len(values) < 12:
        from .ets_model import run_ets
        return run_ets(values, horizon, confidence)

    arr = np.array(values, dtype=float)

    # Determine differencing order
    d = 0 if _is_stationary(arr) else 1

    # 3 candidates max — fastest first, with timeout per candidate
    candidates = [
        ((1, d, 1), (0, 0, 0, 0)),     # Non-seasonal ARIMA — fastest
        ((1, d, 1), (1, 1, 0, 12)),     # Standard seasonal
        ((0, d, 1), (0, 1, 1, 12)),     # Airline model variant
    ]

    alpha = 1 - confidence

    for order, seasonal_order in candidates:
        fit = _fit_with_timeout(arr, order, seasonal_order, maxiter=50, timeout=_MAX_FIT_SECONDS)
        if fit is None:
            continue

        try:
            forecast_result = fit.get_forecast(steps=horizon)
            point = [max(0.0, float(v)) for v in forecast_result.predicted_mean]
            ci = forecast_result.conf_int(alpha=alpha)
            lower = [max(0.0, float(ci.iloc[i, 0])) for i in range(horizon)]
            upper = [float(ci.iloc[i, 1]) for i in range(horizon)]
            return point, lower, upper
        except Exception:
            continue

    # All candidates failed — fallback to ETS
    from .ets_model import run_ets
    return run_ets(values, horizon, confidence)
