"""WebSocket server — broadcasts hand/gesture data to external clients.

This enables Three.js, Blender, Unity, or any WebSocket client to receive
real-time hand tracking data.

Usage:
    broadcaster = WebSocketBroadcaster(bus, config)
    broadcaster.start()  # launches asyncio loop in background thread
    # ... later ...
    broadcaster.stop()
"""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any

from bungeegum.core.config import WebSocketConfig
from bungeegum.core.events import EventBus
from bungeegum.core.types import GestureEvent, HandData

# websockets is an optional dependency — fail gracefully
try:
    import websockets
    from websockets.asyncio.server import ServerConnection

    _HAS_WEBSOCKETS = True
except ImportError:
    _HAS_WEBSOCKETS = False


class WebSocketBroadcaster:
    """Broadcasts hand and gesture events over WebSocket.

    Runs its own asyncio event loop in a daemon thread so it doesn't
    interfere with PyQt6's event loop.
    """

    def __init__(
        self,
        bus: EventBus,
        config: WebSocketConfig | None = None,
    ) -> None:
        if not _HAS_WEBSOCKETS:
            raise ImportError(
                "The 'websockets' package is required for WebSocket output. "
                "Install it with: uv add websockets"
            )
        self._bus = bus
        self._cfg = config or WebSocketConfig()
        self._clients: set[ServerConnection] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None

    # -- public API --------------------------------------------------------

    def start(self) -> None:
        """Start the WebSocket server in a background thread."""
        self._bus.on("hand.detected", self._on_hands)
        self._bus.on("gesture.recognized", self._on_gesture)

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print(
            f"WebSocket server listening on "
            f"ws://{self._cfg.host}:{self._cfg.port}"
        )

    def stop(self) -> None:
        """Shut down the server and close all connections."""
        self._bus.off("hand.detected", self._on_hands)
        self._bus.off("gesture.recognized", self._on_gesture)
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=2)

    # -- internals ---------------------------------------------------------

    def _run_loop(self) -> None:
        assert self._loop is not None
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._serve())

    async def _serve(self) -> None:
        assert self._loop is not None
        async with websockets.serve(
            self._handler, self._cfg.host, self._cfg.port
        ):
            await asyncio.Future()  # run forever

    async def _handler(self, ws: ServerConnection) -> None:
        self._clients.add(ws)
        try:
            async for _ in ws:  # keep connection alive
                pass
        finally:
            self._clients.discard(ws)

    def _broadcast(self, payload: dict[str, Any]) -> None:
        if not self._clients or self._loop is None:
            return
        data = json.dumps(payload)
        for ws in list(self._clients):
            asyncio.run_coroutine_threadsafe(ws.send(data), self._loop)

    def _on_hands(self, payload: dict) -> None:
        hands: list[HandData] = payload["hands"]
        self._broadcast({
            "type": "hands",
            "data": [h.to_dict() for h in hands],
        })

    def _on_gesture(self, event: GestureEvent) -> None:
        self._broadcast({
            "type": "gesture",
            "data": {
                "name": event.name,
                "hand": event.hand,
                "value": event.value,
            },
        })
