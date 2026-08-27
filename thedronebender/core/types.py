"""Shared data types — the contract between all modules."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Landmark:
    """A single 3D landmark point."""

    x: float
    y: float
    z: float
    visibility: float = 1.0


@dataclass(slots=True)
class HandData:
    """Detected hand with 21 landmarks + metadata."""

    landmarks: list[Landmark]  # 21 points
    handedness: str  # "Left" | "Right"
    confidence: float
    timestamp: float = field(default_factory=time.perf_counter)

    def to_dict(self) -> dict[str, Any]:
        """Serialize for WebSocket / JSON transport."""
        return {
            "handedness": self.handedness,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
            "landmarks": [(lm.x, lm.y, lm.z) for lm in self.landmarks],
        }


@dataclass(slots=True)
class GestureEvent:
    """A recognized gesture (pinch, fist, point, etc.)."""

    name: str  # "pinch", "fist", "point", ...
    hand: str  # "Left" | "Right"
    value: float  # 0.0 → 1.0 intensity
    timestamp: float = field(default_factory=time.perf_counter)

