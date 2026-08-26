"""MediaPipe face detection — subscribes to frames, publishes FaceData."""

from __future__ import annotations

import os
import time

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np

from bungeegum.core.config import FaceTrackerConfig
from bungeegum.core.events import EventBus
from bungeegum.core.types import FaceData, HandData


def _overlap_ratio(
    fx: float, fy: float, fw: float, fh: float,
    hx: float, hy: float, hw: float, hh: float,
) -> float:
    """Return fraction of the face bbox that overlaps the hand bbox (0-1)."""
    ix = max(fx, hx)
    iy = max(fy, hy)
    ix2 = min(fx + fw, hx + hw)
    iy2 = min(fy + fh, hy + hh)
    if ix2 <= ix or iy2 <= iy:
        return 0.0
    inter = (ix2 - ix) * (iy2 - iy)
    face_area = fw * fh
    return inter / face_area if face_area > 0 else 0.0


class FaceTracker:
    """Wraps MediaPipe FaceDetector in VIDEO mode.

    Listens for ``frame.captured`` events, runs inference on a downscaled
    copy, and emits ``face.detected`` with a list of :class:`FaceData`.
    The raw RGB frame is attached so display outputs can render it.

    Also subscribes to ``hand.detected`` to filter out false-positive face
    detections that overlap with known hand bounding boxes.
    """

    # Faces whose bbox overlaps a hand by more than this are rejected.
    HAND_OVERLAP_THRESHOLD = 0.4

    def __init__(self, bus: EventBus, config: FaceTrackerConfig | None = None) -> None:
        self._bus = bus
        self._cfg = config or FaceTrackerConfig()
        self._detector: vision.FaceDetector | None = None
        self._start_time = time.perf_counter()
        self._hands: list[HandData] = []  # latest known hands

    # -- public API --------------------------------------------------------

    def start(self) -> None:
        """Create the detector model and subscribe to camera frames."""
        if not os.path.exists(self._cfg.model_path):
            raise FileNotFoundError(
                f"'{self._cfg.model_path}' not found. Download from: "
                "https://storage.googleapis.com/mediapipe-models/"
                "face_detector/blaze_face_short_range/float16/1/"
                "blaze_face_short_range.tflite"
            )

        base_options = python.BaseOptions(
            model_asset_path=self._cfg.model_path,
        )
        options = vision.FaceDetectorOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO,
            min_detection_confidence=self._cfg.min_detection_confidence,
        )
        self._detector = vision.FaceDetector.create_from_options(options)
        self._start_time = time.perf_counter()

        self._bus.on("hand.detected", self._on_hand)
        self._bus.on("frame.captured", self._on_frame)

    def stop(self) -> None:
        """Release the detector model."""
        self._bus.off("frame.captured", self._on_frame)
        self._bus.off("hand.detected", self._on_hand)
        if self._detector is not None:
            self._detector.close()
            self._detector = None

    # -- internals ---------------------------------------------------------

    def _on_hand(self, payload: dict) -> None:
        """Cache latest hand data for overlap filtering."""
        self._hands = payload["hands"]

    def _is_overlapping_hand(self, face: FaceData) -> bool:
        """Return True if this face bbox overlaps a known hand too much."""
        for hand in self._hands:
            xs = [lm.x for lm in hand.landmarks]
            ys = [lm.y for lm in hand.landmarks]
            hx, hy = min(xs), min(ys)
            hw, hh = max(xs) - hx, max(ys) - hy
            if _overlap_ratio(face.x, face.y, face.width, face.height,
                              hx, hy, hw, hh) > self.HAND_OVERLAP_THRESHOLD:
                return True
        return False

    def _on_frame(self, frame_rgb: np.ndarray) -> None:
        if self._detector is None:
            return

        h, w = frame_rgb.shape[:2]
        dw = self._cfg.detect_width
        dh = int(h * dw / w)
        small = cv2.resize(frame_rgb, (dw, dh), interpolation=cv2.INTER_LINEAR)

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=small)
        ts_ms = int((time.perf_counter() - self._start_time) * 1000)
        result = self._detector.detect_for_video(mp_image, ts_ms)

        faces: list[FaceData] = []
        if result.detections:
            for det in result.detections:
                bb = det.bounding_box
                # Convert pixel coords on the downscaled image back to
                # normalized 0–1 coords (relative to original frame).
                face = FaceData(
                    x=bb.origin_x / dw,
                    y=bb.origin_y / dh,
                    width=bb.width / dw,
                    height=bb.height / dh,
                    confidence=det.categories[0].score if det.categories else 0.0,
                )
                # Reject faces that sit inside a hand bounding box
                if not self._is_overlapping_hand(face):
                    faces.append(face)

        self._bus.emit("face.detected", {"frame": frame_rgb, "faces": faces})
