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
 * │ YAW ROTATE   │ Wrist-to-Middle MCP Tilt Angle (Nghiêng bàn tay) │
 * │              │ (Tilt Right > 15° = Yaw Right)                   │
 * │              │ (Tilt Left > 15° = Yaw Left)                     │
 * │              │ (Straight ±15° = Zero Rotation, Rock Solid)      │
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
    this._alphaYaw = 0.25;

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
        const indexPip  = lms[6];
        const indexTip  = lms[8];
        const middleMcp = lms[9];
        const middlePip = lms[10];
        const middleTip = lms[12];
        const ringPip   = lms[14];
        const ringTip   = lms[16];
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

        // Fist triggered if at least 3 fingers are curled in
        const isFist = closedCount >= 3;

        // ════════════════════════════════════════════════════════
        // 2) LEFT / RIGHT (X) — Wrist X screen position
        // ════════════════════════════════════════════════════════
        const rawX = mapRange(wrist[0], 0.12, 0.88, -6.0, 6.0);

        // ════════════════════════════════════════════════════════
        // 3) UP / DOWN (Altitude Y) — Wrist Y screen position
        // ════════════════════════════════════════════════════════
        // High hand on screen = High altitude, Low hand = Descend
        const rawY = mapRange(wrist[1], 0.85, 0.15, 0.4, 6.0);

        // ════════════════════════════════════════════════════════
        // 4) FORWARD / BACKWARD (Z) — Hand Depth + Palm Size
        // ════════════════════════════════════════════════════════
        const palmSize = dist2D(wrist, middleMcp);
        const rawZ = mapRange(palmSize, 0.12, 0.38, 4.5, -5.0);

        // ════════════════════════════════════════════════════════
        // 5) YAW ROTATION — Hand Tilt Angle (Cổ tay nghiêng)
        // ════════════════════════════════════════════════════════
        let rawYawRate = 0;
        if (!isFist) {
          // Vector from Wrist to Middle MCP (points UP along the hand)
          const dx = middleMcp[0] - wrist[0];
          const dy = wrist[1] - middleMcp[1]; // dy > 0 when fingers point up

          // Angle relative to straight vertical (0 rad = straight up)
          const tiltAngle = Math.atan2(dx, dy);

          // Generous Deadzone: ±15 degrees (0.26 rad) to guarantee NO drift/spinning when upright
          const DEADZONE = 0.26;
          if (Math.abs(tiltAngle) > DEADZONE) {
            const sign = tiltAngle > 0 ? 1 : -1;
            const mag = Math.min(1.0, (Math.abs(tiltAngle) - DEADZONE) / 0.45);
            rawYawRate = sign * mag * 2.2;
          }
        }

        // Apply EMA smoothing
        const a = this._alpha;
        const aY = this._alphaYaw;
        this._sx = lerp(this._sx, rawX, a);
        this._sy = lerp(this._sy, rawY, a);
        this._sz = lerp(this._sz, rawZ, a);

        // If within deadzone, snap yawRate straight to 0 without sluggish trailing
        if (rawYawRate === 0) {
          this._sYaw = 0;
        } else {
          this._sYaw = lerp(this._sYaw, rawYawRate, aY);
        }

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
