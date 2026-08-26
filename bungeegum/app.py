"""Application orchestrator — wires all modules together and runs the app."""

from __future__ import annotations

import sys

from bungeegum.core.config import AppConfig
from bungeegum.core.events import bus
from bungeegum.outputs.qt_overlay import OverlayWindow
from bungeegum.tracking.camera import CameraCapture
from bungeegum.tracking.face_tracker import FaceTracker
from bungeegum.tracking.hand_tracker import HandTracker


def run(config: AppConfig | None = None) -> None:
    """Start the full BungeeGum pipeline.

    1. Camera capture (background thread)
    2. Hand tracker (subscribes to camera frames)
    3. Face tracker (subscribes to camera frames)
    4. PyQt6 overlay (subscribes to hand + face detections)

    Pass a custom :class:`AppConfig` to override defaults.
    """
    # Must import QApplication before creating any QWidgets
    from PyQt6.QtWidgets import QApplication

    cfg = config or AppConfig()

    # --- Tracking layer ---
    camera = CameraCapture(bus, cfg.camera)
    hand_tracker = HandTracker(bus, cfg.tracker)
    face_tracker = FaceTracker(bus, cfg.face_tracker)

    # --- Processing layer (placeholders, wire up when ready) ---
    # from bungeegum.processing.gestures import GestureRecognizer
    # gesture_engine = GestureRecognizer(bus)
    # gesture_engine.start()

    # --- Output layer ---
    app = QApplication(sys.argv)
    overlay = OverlayWindow(bus, fullscreen=cfg.fullscreen)

    # Start pipeline: face tracker first (so its frame callback runs before
    # hand tracker — face boxes must be available for overlap filtering).
    face_tracker.start()
    hand_tracker.start()
    camera.start()

    # --- Run Qt event loop ---
    exit_code = app.exec()

    # --- Cleanup ---
    camera.stop()
    hand_tracker.stop()
    face_tracker.stop()
    sys.exit(exit_code)
