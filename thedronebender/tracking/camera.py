"""Threaded camera capture — grabs frames and publishes them on the bus."""

from __future__ import annotations

import threading

import cv2
import numpy as np

from thedronebender.core.config import CameraConfig
from thedronebender.core.events import EventBus


class CameraCapture:
    """Dedicated thread that reads from a webcam and emits 'frame.captured'.

    The frame is flipped horizontally (selfie-mode) and converted to RGB
    before being published so downstream consumers don't need to care
    about the raw camera format.
    """

    def __init__(self, bus: EventBus, config: CameraConfig | None = None) -> None:
        self._bus = bus
        self._cfg = config or CameraConfig()
        self._running = False
        self._thread: threading.Thread | None = None
        self._cap: cv2.VideoCapture | None = None

    # -- public API --------------------------------------------------------

    def start(self) -> None:
        """Open the camera and start the capture thread."""
        self._cap = cv2.VideoCapture(self._cfg.device)
        if not self._cap.isOpened():
            raise RuntimeError(
                f"Could not open camera device {self._cfg.device}."
            )

        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._cfg.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._cfg.height)
        self._cap.set(cv2.CAP_PROP_BUFFERSIZE, self._cfg.buffer_size)

        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"Camera resolution granted: {actual_w}x{actual_h}")

        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Signal the capture thread to stop and release the camera."""
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    # -- internals ---------------------------------------------------------

    def _loop(self) -> None:
        assert self._cap is not None
        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                continue
            rgb = cv2.cvtColor(cv2.flip(frame, 1), cv2.COLOR_BGR2RGB)
            self._bus.emit("frame.captured", rgb)
