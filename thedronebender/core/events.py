"""Lightweight in-process event bus (pub/sub)."""

from __future__ import annotations

import threading
from collections import defaultdict
from typing import Any, Callable


class EventBus:
    """Thread-safe publish/subscribe event bus.

    Modules communicate through named events without importing each other.
    Callbacks are invoked synchronously on the emitting thread, so keep
    them fast or offload heavy work to a queue.
    """

    def __init__(self) -> None:
        self._listeners: dict[str, list[Callable[..., Any]]] = defaultdict(list)
        self._lock = threading.Lock()

    def on(self, event: str, callback: Callable[..., Any]) -> None:
        """Subscribe *callback* to *event*."""
        with self._lock:
            self._listeners[event].append(callback)

    def off(self, event: str, callback: Callable[..., Any]) -> None:
        """Unsubscribe *callback* from *event*."""
        with self._lock:
            try:
                self._listeners[event].remove(callback)
            except ValueError:
                pass

    def emit(self, event: str, data: Any = None) -> None:
        """Publish *event* with optional *data* to all subscribers."""
        with self._lock:
            callbacks = list(self._listeners.get(event, []))
        for cb in callbacks:
            cb(data)


# Global singleton — import and use directly.
bus = EventBus()
