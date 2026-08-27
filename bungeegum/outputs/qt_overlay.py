"""PyQt6 overlay window — subscribes to the event bus and renders hands."""

from __future__ import annotations

import os
import time

os.environ.setdefault("QT_QPA_PLATFORM", "xcb")

import numpy as np

from PyQt6.QtCore import Qt, QTimer, QPointF, QRectF, pyqtSignal, QObject
from PyQt6.QtGui import (
    QImage,
    QPixmap,
    QPainter,
    QPen,
    QBrush,
    QColor,
    QRadialGradient,
    QFont,
    QPainterPath,
)
from PyQt6.QtWidgets import QApplication, QLabel, QMainWindow, QVBoxLayout, QWidget

from bungeegum.core.config import HAND_CONNECTIONS, FINGERTIPS
from bungeegum.core.events import EventBus
from bungeegum.core.types import HandData

# ---------------------------------------------------------------------------
# Pre-built pen / brush constants — avoids per-frame object allocation
# ---------------------------------------------------------------------------
_GLOW_PEN = QPen(QColor(0, 255, 255, 60))
_GLOW_PEN.setWidth(9)
_GLOW_PEN.setCapStyle(Qt.PenCapStyle.RoundCap)

_LINE_PEN = QPen(QColor(0, 255, 255))
_LINE_PEN.setWidth(3)
_LINE_PEN.setCapStyle(Qt.PenCapStyle.RoundCap)

_TEXT_PEN = QPen(QColor(230, 230, 235))
_HUD_TEXT_PEN = QPen(QColor(240, 240, 245))
_NO_PEN = Qt.PenStyle.NoPen

_BADGE_BRUSH = QBrush(QColor(20, 21, 26, 190))
_HUD_BRUSH = QBrush(QColor(20, 21, 26, 170))
_POINT_BRUSH = QBrush(QColor(255, 255, 255))


class _Signals(QObject):
    """Thread-safe bridge: worker thread → Qt UI thread."""

    result_ready = pyqtSignal(object, object)  # (frame_rgb, list[HandData])


class OverlayWindow(QMainWindow):
    """Full-screen PyQt6 window that renders camera + hand landmarks.

    Subscribes to ``hand.detected`` events from the :class:`EventBus`.
    The heavy inference happens elsewhere; this class only paints.
    """

    def __init__(self, bus: EventBus, fullscreen: bool = True) -> None:
        super().__init__()
        self._bus = bus
        self.setWindowTitle("Hand Tracking")
        self.setStyleSheet("background-color: #14151a;")

        self.video_label = QLabel()
        self.video_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.video_label)
        self.setCentralWidget(container)

        self._fps = 0.0
        self._last_tick = time.perf_counter()

        # Cross-thread signal for delivering data from the bus callback
        # (which runs on the camera thread) to the Qt event loop.
        self._signals = _Signals()
        self._signals.result_ready.connect(self._on_result_ready)

        # Latest data ready for the render pass
        self._ready_frame: np.ndarray | None = None
        self._ready_hands: list[HandData] = []

        # Render timer (~60 Hz ceiling)
        self._render_timer = QTimer(self)
        self._render_timer.timeout.connect(self._render)
        self._render_timer.start(16)

        # Subscribe to detection events
        self._bus.on("hand.detected", self._on_hand_detected)

        if fullscreen:
            self.showFullScreen()
        else:
            self.resize(1280, 720)
            self.show()

    # ------------------------------------------------------------------
    # Bus callback (runs on camera/tracker thread)
    # ------------------------------------------------------------------
    def _on_hand_detected(self, payload: dict) -> None:
        self._signals.result_ready.emit(payload["frame"], payload["hands"])

    # ------------------------------------------------------------------
    # Qt slot (runs on UI thread)
    # ------------------------------------------------------------------
    def _on_result_ready(self, frame_rgb: np.ndarray, hands: list[HandData]) -> None:
        self._ready_frame = frame_rgb
        self._ready_hands = hands

    # ------------------------------------------------------------------
    # Render loop
    # ------------------------------------------------------------------
    def _render(self) -> None:
        if self._ready_frame is None:
            return

        frame_rgb = self._ready_frame
        hands = self._ready_hands
        self._ready_frame = None  # don't re-render the same frame

        h, w = frame_rgb.shape[:2]

        qimage = QImage(frame_rgb.data, w, h, 3 * w, QImage.Format.Format_RGB888)
        pixmap = QPixmap.fromImage(qimage)

        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        for hand in hands:
            self._draw_hand(painter, hand, w, h)

        self._draw_hud(painter, w, h, len(hands))
        painter.end()

        # Scale to fill label (letterboxed, fast scaling)
        target = self.video_label.size()
        if target.width() > 0 and target.height() > 0:
            pixmap = pixmap.scaled(
                target,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.FastTransformation,
            )
        self.video_label.setPixmap(pixmap)

        # Smoothed FPS counter
        now = time.perf_counter()
        dt = now - self._last_tick
        self._last_tick = now
        if dt > 0:
            inst = 1.0 / dt
            self._fps = self._fps * 0.85 + inst * 0.15 if self._fps else inst

    # ------------------------------------------------------------------
    # Drawing helpers
    # ------------------------------------------------------------------
    def _draw_hand(self, painter: QPainter, hand: HandData, w: int, h: int) -> None:
        points = [QPointF(lm.x * w, lm.y * h) for lm in hand.landmarks]

        # Skeleton: glow + crisp stroke
        for i, j in HAND_CONNECTIONS:
            p1, p2 = points[i], points[j]
            painter.setPen(_GLOW_PEN)
            painter.drawLine(p1, p2)
            painter.setPen(_LINE_PEN)
            painter.drawLine(p1, p2)

        # Joints
        for idx, pt in enumerate(points):
            is_tip = idx in FINGERTIPS
            r = 7 if is_tip else 5

            grad = QRadialGradient(pt, r * 1.6)
            grad.setColorAt(0.0, QColor(255, 255, 255, 230))
            grad.setColorAt(0.5, QColor(255, 255, 255, 120))
            grad.setColorAt(1.0, QColor(255, 255, 255, 0))
            painter.setPen(_NO_PEN)
            painter.setBrush(QBrush(grad))
            painter.drawEllipse(pt, r * 1.6, r * 1.6)

            painter.setBrush(_POINT_BRUSH)
            painter.drawEllipse(pt, r, r)

        # Handedness badge
        self._draw_badge(
            painter,
            points[0],
            f"{hand.handedness}  {hand.confidence * 100:.0f}%",
        )

    def _draw_badge(self, painter: QPainter, anchor: QPointF, text: str) -> None:
        font = QFont("Segoe UI", 11, QFont.Weight.DemiBold)
        painter.setFont(font)
        fm = painter.fontMetrics()
        tw = fm.horizontalAdvance(text)
        px, py = 10, 6

        rect = QRectF(
            anchor.x() - tw / 2 - px,
            anchor.y() + 18,
            tw + px * 2,
            fm.height() + py,
        )
        path = QPainterPath()
        path.addRoundedRect(rect, 10, 10)
        painter.setPen(_NO_PEN)
        painter.setBrush(_BADGE_BRUSH)
        painter.drawPath(path)
        painter.setPen(_TEXT_PEN)
        painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, text)

    def _draw_hud(self, painter: QPainter, w: int, h: int, count: int) -> None:
        text = f"FPS: {self._fps:4.1f}   Hands: {count}"
        font = QFont("Segoe UI", 12, QFont.Weight.DemiBold)
        painter.setFont(font)
        fm = painter.fontMetrics()
        tw = fm.horizontalAdvance(text)

        rect = QRectF(14, 14, tw + 20, fm.height() + 12)
        path = QPainterPath()
        path.addRoundedRect(rect, 10, 10)
        painter.setPen(_NO_PEN)
        painter.setBrush(_HUD_BRUSH)
        painter.drawPath(path)
        painter.setPen(_HUD_TEXT_PEN)
        painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, text)

    # ------------------------------------------------------------------
    # Key / close events
    # ------------------------------------------------------------------
    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.showNormal() if self.isFullScreen() else self.close()
        elif event.key() == Qt.Key.Key_F11:
            self.showNormal() if self.isFullScreen() else self.showFullScreen()
        else:
            super().keyPressEvent(event)

    def closeEvent(self, event) -> None:
        self._render_timer.stop()
        self._bus.off("hand.detected", self._on_hand_detected)
        super().closeEvent(event)
