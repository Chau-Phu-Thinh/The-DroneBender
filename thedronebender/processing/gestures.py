"""Gesture recognition from hand landmarks (placeholder).

Planned gestures:
- Pinch (thumb + index)
- Fist (all fingers closed)
- Point (only index extended)
- Open palm
- Thumbs up
"""

from __future__ import annotations

from thedronebender.core.events import EventBus
from thedronebender.core.types import GestureEvent, HandData


class GestureRecognizer:
    """Subscribes to hand.detected, emits gesture.recognized.

    TODO: Implement gesture detection logic.
    """

    def __init__(self, bus: EventBus) -> None:
        self._bus = bus

    def start(self) -> None:
        self._bus.on("hand.detected", self._on_hands)

    def stop(self) -> None:
        self._bus.off("hand.detected", self._on_hands)

    def _on_hands(self, payload: dict) -> None:
        hands: list[HandData] = payload["hands"]
        # TODO: Analyze landmarks, emit GestureEvent
        pass
