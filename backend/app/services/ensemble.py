from .feature_engineer import Features
from .ets_model import run_ets
from .arima_model import run_sarima


def run_ensemble(
    values: list[float],
    features: Features,
    horizon: int,
    confidence: float = 0.80,
) -> tuple[list[float], list[float], list[float]]:
    """
    Adaptive ensemble: weighted combination of ETS + SARIMA.
    Weights adapt based on trend_r2 and seasonal_strength.
    Returns (point_forecasts, lower_bounds, upper_bounds).
    """
    trend_r2 = features["trend_r2"]
    seasonal_strength = features["seasonal_strength"]

    # Determine weights
    if trend_r2 > 0.6:
        # Strong trend: SARIMA-heavy
        w_arima, w_ets = 0.7, 0.3
    elif seasonal_strength > 0.5:
        # Strong seasonality: ETS-heavy (Holt-Winters handles it better)
        w_arima, w_ets = 0.3, 0.7
    else:
        # Balanced
        w_arima, w_ets = 0.5, 0.5

    ets_point, ets_lower, ets_upper = run_ets(values, horizon, confidence)
    arima_point, arima_lower, arima_upper = run_sarima(values, horizon, confidence)

    point = [
        max(0.0, w_ets * e + w_arima * a)
        for e, a in zip(ets_point, arima_point)
    ]
    lower = [
        max(0.0, w_ets * e + w_arima * a)
        for e, a in zip(ets_lower, arima_lower)
    ]
    upper = [
        w_ets * e + w_arima * a
        for e, a in zip(ets_upper, arima_upper)
    ]

    return point, lower, upper
