"""Centralized configuration and constants."""

from __future__ import annotations

from dataclasses import dataclass, field


# Hand skeleton connections (21 landmarks)
HAND_CONNECTIONS: list[tuple[int, int]] = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index finger
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle finger
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring finger
    (13, 17), (17, 18), (18, 19), (19, 20),  # pinky finger
    (0, 17),                                  # wrist → pinky base
]

FINGERTIPS: frozenset[int] = frozenset({4, 8, 12, 16, 20})


@dataclass
class CameraConfig:
    """Camera capture settings."""

    device: int = 0
    width: int = 1280
    height: int = 720
    buffer_size: int = 1


@dataclass
class TrackerConfig:
    """MediaPipe hand landmarker settings."""

    model_path: str = "models/hand_landmarker.task"
    detect_width: int = 320
    num_hands: int = 2
    min_detection_confidence: float = 0.7
    min_presence_confidence: float = 0.7
    min_tracking_confidence: float = 0.5



@dataclass
class WebSocketConfig:
    """WebSocket server settings."""

    host: str = "0.0.0.0"
    port: int = 8765


@dataclass
class AppConfig:
    """Top-level application config, composed of sub-configs."""

    camera: CameraConfig = field(default_factory=CameraConfig)
    tracker: TrackerConfig = field(default_factory=TrackerConfig)

    websocket: WebSocketConfig = field(default_factory=WebSocketConfig)
    show_overlay: bool = True
    fullscreen: bool = True
