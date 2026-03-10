import numpy as np
from typing import NamedTuple


class OutlierResult(NamedTuple):
    cleaned: list[float]
    outlier_indices: list[int]
    outlier_count: int


def detect_and_clean(values: list[float]) -> OutlierResult:
    """
    IQR + Z-score consensus outlier detection.
    An index is flagged as outlier only if BOTH methods agree.
    Outliers are replaced via linear interpolation.
    """
    if len(values) < 6:
        return OutlierResult(cleaned=list(values), outlier_indices=[], outlier_count=0)

    arr = np.array(values, dtype=float)

    # IQR method (2.5x factor)
    q1, q3 = np.percentile(arr, [25, 75])
    iqr = q3 - q1
    iqr_lower = q1 - 2.5 * iqr
    iqr_upper = q3 + 2.5 * iqr
    iqr_outliers = set(np.where((arr < iqr_lower) | (arr > iqr_upper))[0].tolist())

    # Z-score method (threshold 3.0)
    mean = np.mean(arr)
    std = np.std(arr)
    if std > 0:
        z_scores = np.abs((arr - mean) / std)
        z_outliers = set(np.where(z_scores > 3.0)[0].tolist())
    else:
        z_outliers = set()

    # Consensus: both methods must agree
    consensus_outliers = sorted(iqr_outliers & z_outliers)

    if not consensus_outliers:
        return OutlierResult(cleaned=list(values), outlier_indices=[], outlier_count=0)

    # Linear interpolation treatment
    cleaned = arr.copy()
    for idx in consensus_outliers:
        # Find nearest non-outlier neighbors
        left = idx - 1
        while left >= 0 and left in consensus_outliers:
            left -= 1
        right = idx + 1
        while right < len(arr) and right in consensus_outliers:
            right += 1

        if left >= 0 and right < len(arr):
            # Interpolate between neighbors
            cleaned[idx] = cleaned[left] + (cleaned[right] - cleaned[left]) * (idx - left) / (right - left)
        elif left >= 0:
            cleaned[idx] = cleaned[left]
        elif right < len(arr):
            cleaned[idx] = cleaned[right]
        else:
            cleaned[idx] = 0.0

        # Ensure non-negative
        cleaned[idx] = max(0.0, cleaned[idx])

    return OutlierResult(
        cleaned=cleaned.tolist(),
        outlier_indices=consensus_outliers,
        outlier_count=len(consensus_outliers)
    )
