"""Landmark smoothing filters (placeholder for future use).

Planned filters:
- Exponential Moving Average (EMA)
- One Euro Filter
- Kalman Filter
"""

from __future__ import annotations

from thedronebender.core.types import HandData


class EMAFilter:
    """Simple exponential moving average for landmark smoothing.

    TODO: Implement per-landmark EMA to reduce jitter.
    """

    def __init__(self, alpha: float = 0.3) -> None:
        self.alpha = alpha

    def smooth(self, hands: list[HandData]) -> list[HandData]:
        # Placeholder — pass through for now
        return hands
