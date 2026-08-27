/**
 * WebSocket receiver — connects to the Python hand-tracking backend
 * and translates raw hand landmarks into drone flight commands.
 *
 * Gesture mapping (intuitive drone control):
 *
 *   LEFT / RIGHT  →  Index fingertip X position (Landmark 8)
 *   UP / DOWN     →  Wrist Y position (Landmark 0) — raise hand = ascend
 *   FORWARD / BACK →  Hand tilt angle (wrist-to-middle-finger vector pitch)
 *   ALTITUDE LOCK →  Pinch (thumb tip ↔ index tip distance < threshold)
 */

export class WSReceiver {
  constructor(url = 'ws://localhost:8765') {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.lastTimestamp = 0;
    this.latencyMs = 0;
    this.handCount = 0;

    // Smoothed target (exponential moving average to reduce jitter)
    this._smoothX = 0;
    this._smoothY = 1.5;
    this._smoothZ = 0;
    this._smoothAlpha = 0.35; // 0 = no smoothing, 1 = no lag

    // Callbacks
    this.onStatusChange = null;
    this.onHandTarget = null;
    this.onGesture = null;

    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log(`✓ Connected to Hand Tracking WebSocket at ${this.url}`);
        if (this.onStatusChange) this.onStatusChange(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handlePayload(payload);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.handCount = 0;
        if (this.onStatusChange) this.onStatusChange(false);
        setTimeout(() => this.connect(), 2000);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
      setTimeout(() => this.connect(), 2000);
    }
  }

  handlePayload(payload) {
    if (payload.type === 'hands') {
      const hands = payload.data || [];
      this.handCount = hands.length;

      if (hands.length > 0) {
        const hand = hands[0];
        const lms = hand.landmarks;

        if (lms && lms.length >= 21) {
          // Key landmarks
          const wrist       = lms[0];   // [x, y, z]
          const thumbTip    = lms[4];
          const indexTip    = lms[8];
          const middleMcp   = lms[9];   // middle finger base
          const middleTip   = lms[12];

          // ── LEFT / RIGHT ──────────────────────────────────────
          // Wrist X position (normalized 0..1) → world X (-6..+6 m)
          // Using wrist instead of fingertip for more stable lateral control
          const rawX = mapRange(wrist[0], 0.0, 1.0, -6.0, 6.0);

          // ── UP / DOWN (Altitude) ──────────────────────────────
          // Wrist Y (0 = top of camera, 1 = bottom) → inverted altitude
          // Raise hand high = fly up, lower hand = descend
          const rawY = mapRange(wrist[1], 0.85, 0.15, 0.3, 6.0);

          // ── FORWARD / BACKWARD ────────────────────────────────
          // Computed from the pitch angle of the hand:
          //   Palm tilted forward (fingers pointing away) → fly forward
          //   Palm tilted back (fingers pointing toward you) → fly backward
          //
          // We measure the Y-difference between middle fingertip and wrist.
          // Neutral hand: middleTip.y ≈ wrist.y → pitch ~0
          // Tilt forward (fingers up in camera = lower Y): middleTip.y < wrist.y → negative pitch → forward
          // Tilt back (fingers down = higher Y): middleTip.y > wrist.y → positive pitch → backward
          const handPitchDelta = middleTip[1] - wrist[1];
          // Typical range: -0.25 (forward tilt) to +0.15 (back tilt)
          const rawZ = mapRange(handPitchDelta, -0.20, 0.15, -4.0, 3.0);

          // ── PINCH = Lock Altitude ─────────────────────────────
          const pinchDist = Math.hypot(
            indexTip[0] - thumbTip[0],
            indexTip[1] - thumbTip[1],
            indexTip[2] - thumbTip[2]
          );
          const isPinching = pinchDist < 0.07;

          // ── Apply EMA smoothing ───────────────────────────────
          const a = this._smoothAlpha;
          this._smoothX = this._smoothX * (1 - a) + rawX * a;
          this._smoothY = this._smoothY * (1 - a) + rawY * a;
          this._smoothZ = this._smoothZ * (1 - a) + rawZ * a;

          if (this.onHandTarget) {
            this.onHandTarget({
              x: this._smoothX,
              y: isPinching ? this._smoothY : this._smoothY,  // keep Y when pinching in future
              z: this._smoothZ,
              isPinching,
              handedness: hand.handedness,
              confidence: hand.confidence,
            });
          }
        }
      }
    } else if (payload.type === 'gesture') {
      if (this.onGesture) this.onGesture(payload.data);
    }
  }
}

// ── Utility ─────────────────────────────────────────────────────────
function mapRange(x, inMin, inMax, outMin, outMax) {
  const clamped = Math.min(Math.max(x, Math.min(inMin, inMax)), Math.max(inMin, inMax));
  return ((clamped - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
