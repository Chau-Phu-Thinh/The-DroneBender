"""Map gestures to actions (placeholder).

Planned mappings:
- Pinch → grab / select
- Fist → reset
- Point → cursor control
- Open palm → release
"""

from __future__ import annotations

from bungeegum.core.events import EventBus
from bungeegum.core.types import GestureEvent


class ActionMapper:
    """Subscribes to gesture.recognized, maps to application actions.

    TODO: Implement configurable gesture → action mapping.
    """

    def __init__(self, bus: EventBus) -> None:
        self._bus = bus

    def start(self) -> None:
        self._bus.on("gesture.recognized", self._on_gesture)

    def stop(self) -> None:
        self._bus.off("gesture.recognized", self._on_gesture)

    def _on_gesture(self, event: GestureEvent) -> None:
        # TODO: Dispatch action based on event.name
        pass
