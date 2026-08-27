/**
 * WebSocket receiver — connects to the Python hand-tracking backend
 * and translates raw hand landmarks into drone flight commands.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                   OPTIMAL GESTURE MAPPING                       │
 * ├──────────────┬───────────────────────────────────────────────────┤
 * │ LEFT / RIGHT │ Wrist X position on screen                       │
 * ├──────────────┼───────────────────────────────────────────────────┤
 * │ UP / DOWN    │ Wrist Y position on screen (raise hand = ascend) │
 * ├──────────────┼───────────────────────────────────────────────────┤
 * │ FORWARD/BACK │ Hand depth / Palm size & Hand forward tilt       │
 * │              │ (Push hand forward = Fly Forward)                │
 * │              │ (Pull hand back = Fly Backward)                  │
 * ├──────────────┼───────────────────────────────────────────────────┤
 * │ YAW ROTATE   │ Hand roll angle (Tilt hand left / right)         │
 * │              │ (Tilt CW = Yaw Right, Tilt CCW = Yaw Left)       │
 * ├──────────────┼───────────────────────────────────────────────────┤
 * │ HOVER LOCK   │ Closed Fist (Nắm bàn tay lại)                    │
 * │              │ Freeze position & rotation completely            │
 * └──────────────┴───────────────────────────────────────────────────┘
 */

export class WSReceiver {
  constructor(url = 'ws://localhost:8765') {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.handCount = 0;

    // Smoothed outputs (EMA)
    this._sx = 0;
    this._sy = 1.5;
    this._sz = 0;
    this._sYaw = 0;
    this._alpha = 0.28;
    this._alphaYaw = 0.22;

    // Callbacks
    this.onStatusChange = null;
    this.onHandTarget = null; // Emits { x, y, z, yawRate, isFist, handedness, confidence }
    this.onGesture = null;

    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log(`✓ Connected to Hand Tracking at ${this.url}`);
        if (this.onStatusChange) this.onStatusChange(true);
      };

      this.ws.onmessage = (event) => {
        try {
          this.handlePayload(JSON.parse(event.data));
        } catch (err) {
          console.error('WS parse error:', err);
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
        if (!lms || lms.length < 21) return;

        // Key landmarks
        const wrist     = lms[0];
        const thumbTip  = lms[4];
        const indexMcp  = lms[5];
        const indexPip  = lms[6];
        const indexTip  = lms[8];
        const middleMcp = lms[9];
        const middlePip = lms[10];
        const middleTip = lms[12];
        const ringMcp   = lms[13];
        const ringPip   = lms[14];
        const ringTip   = lms[16];
        const pinkyMcp  = lms[17];
        const pinkyPip  = lms[18];
        const pinkyTip  = lms[20];

        // ════════════════════════════════════════════════════════
        // 1) CLOSED FIST DETECTION (NẮM BÀN TAY LẠI)
        // ════════════════════════════════════════════════════════
        let closedCount = 0;
        if (dist2D(indexTip, wrist) < dist2D(indexPip, wrist) * 1.15) closedCount++;
        if (dist2D(middleTip, wrist) < dist2D(middlePip, wrist) * 1.15) closedCount++;
        if (dist2D(ringTip, wrist) < dist2D(ringPip, wrist) * 1.15) closedCount++;
        if (dist2D(pinkyTip, wrist) < dist2D(pinkyPip, wrist) * 1.15) closedCount++;

        // Fist triggered if at least 3 fingers are closed
        const isFist = closedCount >= 3;

        // ════════════════════════════════════════════════════════
        // 2) LEFT / RIGHT (X) — Wrist X screen position
        // ════════════════════════════════════════════════════════
        const rawX = mapRange(wrist[0], 0.12, 0.88, -6.0, 6.0);

        // ════════════════════════════════════════════════════════
        // 3) UP / DOWN (Altitude Y) — Wrist Y screen position
        // ════════════════════════════════════════════════════════
        const rawY = mapRange(wrist[1], 0.85, 0.15, 0.4, 6.0);

        // ════════════════════════════════════════════════════════
        // 4) FORWARD / BACKWARD (Z) — Hand Depth + Palm Size
        // ════════════════════════════════════════════════════════
        const palmSize = dist2D(wrist, middleMcp);
        const rawZ = mapRange(palmSize, 0.12, 0.38, 4.5, -5.0);

        // ════════════════════════════════════════════════════════
        // 5) YAW ROTATION — Hand Roll Angle (Nghiêng bàn tay)
        // ════════════════════════════════════════════════════════
        let yawRate = 0;
        if (!isFist) {
          const rollDx = pinkyMcp[0] - indexMcp[0];
          const rollDy = pinkyMcp[1] - indexMcp[1];
          let rollAngle = Math.atan2(rollDy, rollDx);

          if (hand.handedness === 'Left') rollAngle = -rollAngle;

          const DEADZONE = 0.15; // ~8.5 degrees deadzone
          if (Math.abs(rollAngle) > DEADZONE) {
            const sign = rollAngle > 0 ? 1 : -1;
            const mag = Math.abs(rollAngle) - DEADZONE;
            yawRate = sign * mapRange(mag, 0, 0.7, 0, 2.8);
          }
        }

        // Apply EMA smoothing
        const a = this._alpha;
        const aY = this._alphaYaw;
        this._sx = lerp(this._sx, rawX, a);
        this._sy = lerp(this._sy, rawY, a);
        this._sz = lerp(this._sz, rawZ, a);
        this._sYaw = isFist ? 0 : lerp(this._sYaw, yawRate, aY);

        if (this.onHandTarget) {
          this.onHandTarget({
            x: this._sx,
            y: this._sy,
            z: this._sz,
            yawRate: isFist ? 0 : this._sYaw,
            isFist,
            isPinching: isFist,
            handedness: hand.handedness,
            confidence: hand.confidence,
          });
        }
      }
    } else if (payload.type === 'gesture') {
      if (this.onGesture) this.onGesture(payload.data);
    }
  }
}

// ── Utilities ───────────────────────────────────────────────────────

function mapRange(x, inMin, inMax, outMin, outMax) {
  const lo = Math.min(inMin, inMax);
  const hi = Math.max(inMin, inMax);
  const clamped = Math.min(Math.max(x, lo), hi);
  return ((clamped - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function dist2D(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(current, target, alpha) {
  return current * (1 - alpha) + target * alpha;
}
