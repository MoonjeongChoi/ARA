"""Z-score based outlier detection for journal entries.

Limitation: classical z-score has a masking effect for small samples (N < 10).
A single extreme value shifts the mean, reducing its own z-score. For N < 10,
consider this output informational only. Robust alternatives (median + MAD) are
a future candidate for improvement.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List


def detect_outliers(
    entries: List[Dict[str, Any]],
    z_threshold: float = 2.0,
) -> List[Dict[str, Any]]:
    """Return entries whose |z-score| exceeds z_threshold, sorted by |z| descending.

    Returns an empty list when N < 3 (z-score is statistically meaningless).
    """
    amounts = [float(e.get("amount") or 0) for e in entries]
    n = len(amounts)
    if n < 3:
        return []

    mean = sum(amounts) / n
    variance = sum((a - mean) ** 2 for a in amounts) / n
    std = math.sqrt(variance)
    if std == 0:
        return []

    outliers: List[Dict[str, Any]] = []
    for entry, amount in zip(entries, amounts):
        z = (amount - mean) / std
        if abs(z) > z_threshold:
            outliers.append(
                {
                    "date": entry.get("date") or "",
                    "description": entry.get("description") or "",
                    "amount": amount,
                    "z_score": round(z, 2),
                }
            )

    outliers.sort(key=lambda x: abs(x["z_score"]), reverse=True)
    return outliers
