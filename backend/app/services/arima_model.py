import numpy as np
import warnings
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller


def _is_stationary(values: np.ndarray) -> bool:
    try:
        result = adfuller(values, autolag="AIC")
        return result[1] < 0.05
    except Exception:
        return True


def run_sarima(values: list[float], horizon: int, confidence: float = 0.80) -> tuple[list[float], list[float], list[float]]:
    """
    SARIMAX forecast with ADF stationarity test.
    Falls back through simpler orders on failure.
    Returns (point_forecasts, lower_bounds, upper_bounds).
    """
    if len(values) < 12:
        # Not enough data for SARIMA, return zero-trend ETS fallback
        from .ets_model import run_ets
        return run_ets(values, horizon, confidence)

    arr = np.array(values, dtype=float)

    # Determine differencing order
    d = 0 if _is_stationary(arr) else 1

    # Try candidate orders: seasonal first, then simpler
    candidates = [
        ((1, d, 1), (1, 1, 0, 12)),
        ((1, d, 0), (1, 1, 0, 12)),
        ((2, d, 1), (0, 1, 1, 12)),
        ((1, d, 1), (0, 0, 0, 0)),
        ((1, d, 0), (0, 0, 0, 0)),
    ]

    alpha = 1 - confidence

    for order, seasonal_order in candidates:
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
                fit = model.fit(disp=False, maxiter=100)

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
