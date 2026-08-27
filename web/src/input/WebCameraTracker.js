import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Hand landmark connections (21 landmarks)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17],                              // Palm base
];

export class WebCameraTracker {
  constructor() {
    this.handLandmarker = null;
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    this.stream = null;
    this.isActive = false;
    this.isLoading = false;
    this.lastVideoTime = -1;
    this.handCount = 0;

    // Smoothed values
    this._sx = 0;
    this._sy = 0.06;
    this._sz = 0;
    this._sYaw = 0;
    this._alpha = 0.28;
    this._alphaYaw = 0.25;

    // Preview Canvas
    this.previewCanvas = null;
    this.previewCtx = null;

    // Callbacks
    this.onHandTarget = null;
    this.onStatusChange = null;
  }

  setPreviewCanvas(canvasElement) {
    this.previewCanvas = canvasElement;
    if (this.previewCanvas) {
      this.previewCtx = this.previewCanvas.getContext('2d');
    }
  }

  async init() {
    if (this.handLandmarker) return;

    this.isLoading = true;
    if (this.onStatusChange) this.onStatusChange({ loading: true, active: false });

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.6,
      });

      this.isLoading = false;
      console.log('✓ MediaPipe Web HandLandmarker loaded successfully!');
    } catch (err) {
      this.isLoading = false;
      console.error('Error initializing MediaPipe:', err);
      if (this.onStatusChange) this.onStatusChange({ loading: false, error: err.message });
      throw err;
    }
  }

  async startCamera() {
    try {
      await this.init();

      if (this.stream) {
        this.stopCamera();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.video.srcObject = this.stream;

      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      this.isActive = true;
      if (this.onStatusChange) this.onStatusChange({ active: true, loading: false });
      console.log('✓ In-Browser Webcam started');
    } catch (err) {
      this.isActive = false;
      console.error('Error starting camera:', err);
      if (this.onStatusChange) this.onStatusChange({ active: false, error: err.message });
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.isActive = false;
    this.handCount = 0;
    this.video.srcObject = null;

    if (this.previewCtx && this.previewCanvas) {
      this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }

    if (this.onStatusChange) this.onStatusChange({ active: false, loading: false });
  }

  toggleCamera() {
    if (this.isActive) {
      this.stopCamera();
      return false;
    } else {
      this.startCamera();
      return true;
    }
  }

  update(now = performance.now()) {
    if (!this.isActive || !this.handLandmarker || this.video.paused || this.video.currentTime === this.lastVideoTime) {
      return;
    }

    this.lastVideoTime = this.video.currentTime;

    // Run inference directly on the GPU
    const result = this.handLandmarker.detectForVideo(this.video, now);

    const hands = result.landmarks || [];
    this.handCount = hands.length;

    // Draw preview with landmarks if canvas is available
    this.drawPreview(hands);

    if (hands.length > 0) {
      const lms = hands[0];
      this.processLandmarks(lms, result.handednesses ? result.handednesses[0][0].displayName : 'Right');
    }
  }

  processLandmarks(lms, handedness) {
    if (!lms || lms.length < 21) return;

    // Key landmarks (0..1 normalized)
    // Note: Video is mirrored horizontally for intuitive user mirror view
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

    // 1) CLOSED FIST DETECTION
    let closedCount = 0;
    if (dist2D(indexTip, wrist) < dist2D(indexPip, wrist) * 1.15) closedCount++;
    if (dist2D(middleTip, wrist) < dist2D(middlePip, wrist) * 1.15) closedCount++;
    if (dist2D(ringTip, wrist) < dist2D(ringPip, wrist) * 1.15) closedCount++;
    if (dist2D(pinkyTip, wrist) < dist2D(pinkyPip, wrist) * 1.15) closedCount++;

    const isFist = closedCount >= 3;

    // 2) LEFT / RIGHT (X) — Mirrored for front camera
    // In camera view, moving hand to your right should move drone right
    const mirroredX = 1.0 - wrist.x;
    const rawX = mapRange(mirroredX, 0.12, 0.88, -6.0, 6.0);

    // 3) UP / DOWN (Altitude Y) — High hand = high altitude
    const rawY = mapRange(wrist.y, 0.85, 0.15, 0.4, 6.0);

    // 4) FORWARD / BACKWARD (Z) — Palm depth / size
    const palmSize = dist2D(wrist, middleMcp);
    const rawZ = mapRange(palmSize, 0.12, 0.38, 4.5, -5.0);

    // 5) YAW ROTATION — Tilt angle (Mirrored)
    let rawYawRate = 0;
    if (!isFist) {
      const dx = (1.0 - middleMcp.x) - (1.0 - wrist.x); // Mirrored X
      const dy = wrist.y - middleMcp.y;                 // Up is positive
      const tiltAngle = Math.atan2(dx, dy);

      const DEADZONE = 0.26; // ±15 degrees
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
        handedness,
        confidence: 0.95,
      });
    }
  }

  drawPreview(hands) {
    if (!this.previewCtx || !this.previewCanvas) return;

    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Draw mirrored video feed
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();

    // Draw e-ink style landmarks
    if (hands.length > 0) {
      const lms = hands[0];

      // Draw skeleton lines
      ctx.strokeStyle = '#2d2d2d';
      ctx.lineWidth = 2.5;

      HAND_CONNECTIONS.forEach(([i, j]) => {
        const p1 = lms[i];
        const p2 = lms[j];
        // Mirrored coordinates on canvas
        const x1 = (1.0 - p1.x) * w;
        const y1 = p1.y * h;
        const x2 = (1.0 - p2.x) * w;
        const y2 = p2.y * h;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // Draw landmark points
      ctx.fillStyle = '#f5f0e8';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;

      lms.forEach((lm, idx) => {
        const x = (1.0 - lm.x) * w;
        const y = lm.y * h;
        const r = idx === 8 || idx === 0 || idx === 4 ? 4.5 : 3;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
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
  const dx = a.x !== undefined ? a.x - b.x : a[0] - b[0];
  const dy = a.y !== undefined ? a.y - b.y : a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(current, target, alpha) {
  return current * (1 - alpha) + target * alpha;
}
