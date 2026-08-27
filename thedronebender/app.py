"""Application orchestrator — wires all modules together and runs the app."""

from __future__ import annotations

import sys

from thedronebender.core.config import AppConfig
from thedronebender.core.events import bus
from thedronebender.outputs.qt_overlay import OverlayWindow
from thedronebender.outputs.websocket import WebSocketBroadcaster
from thedronebender.tracking.camera import CameraCapture
from thedronebender.tracking.hand_tracker import HandTracker


def run(config: AppConfig | None = None) -> None:
    """Start the full TheDroneBender pipeline.

    1. Camera capture (background thread)
    2. Hand tracker (subscribes to camera frames)
    3. WebSocket server (broadcasts hands/gestures to Three.js)
    4. PyQt6 overlay (subscribes to hand detections)

    Pass a custom :class:`AppConfig` to override defaults.
    """
    # Must import QApplication before creating any QWidgets
    from PyQt6.QtWidgets import QApplication

    cfg = config or AppConfig()

    # --- Tracking layer ---
    camera = CameraCapture(bus, cfg.camera)
    hand_tracker = HandTracker(bus, cfg.tracker)

    # --- Output layer ---
    ws_server = WebSocketBroadcaster(bus, cfg.websocket)
    ws_server.start()

    app = QApplication(sys.argv)
    overlay = OverlayWindow(bus, fullscreen=cfg.fullscreen)

    hand_tracker.start()
    camera.start()

    # --- Run Qt event loop ---
    exit_code = app.exec()

    # --- Cleanup ---
    camera.stop()
    hand_tracker.stop()
    ws_server.stop()
    sys.exit(exit_code)
