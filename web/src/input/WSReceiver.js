export class WSReceiver {
  constructor(url = 'ws://localhost:8765') {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.lastTimestamp = 0;
    this.latencyMs = 0;
    this.handCount = 0;

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
        // Auto-reconnect after 2 seconds
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
        const hand = hands[0]; // Primary tracking hand
        const lms = hand.landmarks;

        if (lms && lms.length >= 21) {
          // Index Finger Tip (Landmark 8)
          const indexTip = lms[8];
          // Thumb Tip (Landmark 4)
          const thumbTip = lms[4];
          // Wrist (Landmark 0)
          const wrist = lms[0];
          // Middle Finger MCP base (Landmark 9)
          const middleMcp = lms[9];

          // 1. Calculate Pinch distance (Pinch = Boost / Altitude Grab)
          const pinchDist = Math.hypot(
            indexTip[0] - thumbTip[0],
            indexTip[1] - thumbTip[1],
            indexTip[2] - thumbTip[2]
          );
          const isPinching = pinchDist < 0.08;

          // 2. Hand Scale (Distance wrist -> middle base) for Depth / Forward-Back
          const palmSize = Math.hypot(
            wrist[0] - middleMcp[0],
            wrist[1] - middleMcp[1],
            wrist[2] - middleMcp[2]
          );
          // Baseline palm size is ~0.25 (closer = larger palm size -> forward Z, farther = smaller -> back Z)
          const depthZ = THREE_MathMap(palmSize, 0.15, 0.45, 3.5, -3.5);

          // 3. Map Normalized 2D Camera coords (0.0 to 1.0) to 3D World (Meters)
          // X: 0.0 (left) to 1.0 (right) -> -6m to +6m
          const worldX = THREE_MathMap(indexTip[0], 0.0, 1.0, -6.0, 6.0);
          
          // Y: 0.0 (top of camera) to 1.0 (bottom) -> Inverted: High hand = High altitude
          const worldY = THREE_MathMap(indexTip[1], 1.0, 0.0, 0.3, 5.0);

          if (this.onHandTarget) {
            this.onHandTarget({
              x: worldX,
              y: worldY,
              z: depthZ,
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

function THREE_MathMap(x, in_min, in_max, out_min, out_max) {
  const clamped = Math.min(Math.max(x, in_min), in_max);
  return ((clamped - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
}
