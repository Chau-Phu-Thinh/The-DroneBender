"""MediaPipe hand landmark detection — subscribes to frames, publishes HandData."""

from __future__ import annotations

import os
import time

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np

from thedronebender.core.config import TrackerConfig
from thedronebender.core.events import EventBus
from thedronebender.core.types import HandData, Landmark


class HandTracker:
    """Wraps MediaPipe HandLandmarker in VIDEO mode.

    Listens for ``frame.captured`` events, runs inference on a downscaled
    copy, and emits ``hand.detected`` with a list of :class:`HandData`.
    The raw RGB frame is attached to the event payload so that display
    outputs can render it without subscribing to the camera separately.
    """

    def __init__(self, bus: EventBus, config: TrackerConfig | None = None) -> None:
        self._bus = bus
        self._cfg = config or TrackerConfig()
        self._landmarker: vision.HandLandmarker | None = None
        self._start_time = time.perf_counter()

    # -- public API --------------------------------------------------------

    def start(self) -> None:
        """Create the landmarker model and subscribe to camera frames."""
        if not os.path.exists(self._cfg.model_path):
            raise FileNotFoundError(
                f"'{self._cfg.model_path}' not found. Download from: "
                "https://storage.googleapis.com/mediapipe-models/"
                "hand_landmarker/hand_landmarker/float16/latest/"
                "hand_landmarker.task"
            )

        base_options = python.BaseOptions(
            model_asset_path=self._cfg.model_path,
        )
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO,
            num_hands=self._cfg.num_hands,
            min_hand_detection_confidence=self._cfg.min_detection_confidence,
            min_hand_presence_confidence=self._cfg.min_presence_confidence,
            min_tracking_confidence=self._cfg.min_tracking_confidence,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._start_time = time.perf_counter()

        self._bus.on("frame.captured", self._on_frame)

    def stop(self) -> None:
        """Release the landmarker model."""
        self._bus.off("frame.captured", self._on_frame)
        if self._landmarker is not None:
            self._landmarker.close()
            self._landmarker = None

    # -- internals ---------------------------------------------------------

    def _on_frame(self, frame_rgb: np.ndarray) -> None:
        if self._landmarker is None:
            return

        h, w = frame_rgb.shape[:2]
        dw = self._cfg.detect_width
        dh = int(h * dw / w)
        small = cv2.resize(frame_rgb, (dw, dh), interpolation=cv2.INTER_LINEAR)

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=small)
        ts_ms = int((time.perf_counter() - self._start_time) * 1000)
        result = self._landmarker.detect_for_video(mp_image, ts_ms)

        hands: list[HandData] = []
        if result.hand_landmarks:
            for lm_list, handedness in zip(
                result.hand_landmarks, result.handedness
            ):
                # Flip label because we mirror the frame
                raw = handedness[0].category_name
                label = "Right" if raw == "Left" else "Left"
                hand = HandData(
                    landmarks=[Landmark(l.x, l.y, l.z) for l in lm_list],
                    handedness=label,
                    confidence=handedness[0].score,
                )
                hands.append(hand)

        self._bus.emit("hand.detected", {"frame": frame_rgb, "hands": hands})
