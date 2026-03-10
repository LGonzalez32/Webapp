from typing import Literal
from .feature_engineer import Features

ModelType = Literal["NAIVE", "ETS", "SARIMA", "ENSEMBLE"]


def select_model(features: Features) -> ModelType:
    """
    Rule-based model selection:
    - NAIVE: fewer than 6 months of data OR more than 50% zeros
    - ENSEMBLE: >= 18 months, cv between 0.3 and 1.2
    - SARIMA: >= 12 months with seasonality or strong trend (r2 > 0.5)
    - ETS: default for 6-11 months of adequate data
    """
    n = features["n_months"]
    zero_pct = features["zero_pct"]
    cv = features["cv"]
    trend_r2 = features["trend_r2"]
    has_seasonality = features["has_seasonality"]

    # Not enough data or too sparse
    if n < 6 or zero_pct > 0.5:
        return "NAIVE"

    # Rich data: use ensemble
    if n >= 18 and 0.3 <= cv <= 1.2:
        return "ENSEMBLE"

    # Seasonal or trending data: SARIMA
    if n >= 12 and (has_seasonality or trend_r2 > 0.5):
        return "SARIMA"

    # Default
    return "ETS"
