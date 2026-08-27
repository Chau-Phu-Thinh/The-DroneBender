export class HUD {
  constructor(sceneManager, flightController, droneEntity, wsReceiver, webCameraTracker) {
    this.sm = sceneManager;
    this.fc = flightController;
    this.drone = droneEntity;
    this.ws = wsReceiver;
    this.cam = webCameraTracker;

    // DOM Elements
    this.elWsStatus = document.getElementById('ws-status');
    this.elBtnWebcam = document.getElementById('btn-webcam-toggle');
    this.elBtnMode = document.getElementById('btn-mode-toggle');
    this.elBtnCam = document.getElementById('btn-camera-toggle');
    this.elBtnReset = document.getElementById('btn-reset');
    this.elGlbInput = document.getElementById('glb-input');

    this.elPreviewContainer = document.getElementById('camera-preview-container');
    this.elPreviewCanvas = document.getElementById('camera-preview-canvas');
    this.elBtnClosePreview = document.getElementById('btn-close-preview');

    this.elValAlt = document.getElementById('val-alt');
    this.elValSpd = document.getElementById('val-spd');
    this.elValTilt = document.getElementById('val-tilt');
    this.elValRpm = document.getElementById('val-rpm');
    this.elValFps = document.getElementById('val-fps');
    this.elValHands = document.getElementById('val-hands');
    this.elValSource = document.getElementById('val-source');
    this.elValBat = document.getElementById('val-bat');
    this.elValWs = document.getElementById('val-ws');
    this.elTargetCoords = document.getElementById('target-coords');
    this.elArmedIndicator = document.getElementById('armed-indicator');

    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.fps = 60;
    this.battery = 98;

    if (this.cam && this.elPreviewCanvas) {
      this.cam.setPreviewCanvas(this.elPreviewCanvas);
    }

    this.bindEvents();
  }

  bindEvents() {
    // Web Camera Toggle
    if (this.elBtnWebcam && this.cam) {
      this.elBtnWebcam.addEventListener('click', async () => {
        if (this.cam.isActive) {
          this.cam.stopCamera();
          this.elBtnWebcam.classList.remove('active');
          this.elBtnWebcam.querySelector('span').textContent = '📷 Bật Webcam Web';
          if (this.elPreviewContainer) this.elPreviewContainer.classList.remove('visible');
        } else {
          this.elBtnWebcam.querySelector('span').textContent = '⏳ Đang tải AI Model...';
          try {
            await this.cam.startCamera();
            this.elBtnWebcam.classList.add('active');
            this.elBtnWebcam.querySelector('span').textContent = '📷 Tắt Webcam Web';
            if (this.elPreviewContainer) this.elPreviewContainer.classList.add('visible');
          } catch (err) {
            this.elBtnWebcam.classList.remove('active');
            this.elBtnWebcam.querySelector('span').textContent = '📷 Thử Lại Webcam';
            alert('Không thể mở camera: ' + err.message);
          }
        }
      });
    }

    // Close preview window button
    if (this.elBtnClosePreview && this.elPreviewContainer) {
      this.elBtnClosePreview.addEventListener('click', () => {
        this.elPreviewContainer.classList.remove('visible');
      });
    }

    // Mode Switcher
    this.elBtnMode.addEventListener('click', () => {
      const mode = this.fc.toggleMode();
      this.elBtnMode.classList.toggle('active', mode === 'finger_tracking');
      this.elBtnMode.querySelector('span').textContent =
        mode === 'finger_tracking' ? 'Finger Tracking' : 'Manual RC';
    });

    // Camera Switcher
    this.elBtnCam.addEventListener('click', () => {
      const mode = this.sm.toggleCameraMode();
      this.elBtnCam.querySelector('span').textContent =
        mode === 'chase' ? 'Chase Cam' : 'Free Orbit';
    });

    // Reset Flight
    this.elBtnReset.addEventListener('click', () => {
      this.fc.reset();
    });

    // Custom Blender GLB Loader
    this.elGlbInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.drone.loadGLB(event.target.result);
        };
        reader.readAsArrayBuffer(file);
      }
    });

    // Drag & Drop GLB anywhere onto canvas
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.drone.loadGLB(event.target.result);
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }

  updateWSStatus(connected) {
    if (this.cam && this.cam.isActive) {
      this.elWsStatus.textContent = 'Webcam Online';
      this.elWsStatus.className = 'status-tag status-online';
      if (this.elValWs) this.elValWs.textContent = 'Active (Local GPU)';
      return;
    }

    if (connected) {
      this.elWsStatus.textContent = 'WS Online';
      this.elWsStatus.className = 'status-tag status-online';
      if (this.elValWs) this.elValWs.textContent = 'Connected (8765)';
    } else {
      this.elWsStatus.textContent = 'Standby';
      this.elWsStatus.className = 'status-tag status-offline';
      if (this.elValWs) this.elValWs.textContent = 'WS Offline';
    }
  }

  update(delta) {
    // Calculate FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
      this.elValFps.textContent = `${this.fps} fps`;

      // Slow battery drain
      this.battery = Math.max(12, this.battery - 0.01);
      this.elValBat.textContent = Math.round(this.battery);
    }

    // Telemetry Update
    const t = this.fc.getTelemetry();
    this.elValAlt.textContent = Math.max(0, t.altitude).toFixed(2);
    this.elValSpd.textContent = t.speed.toFixed(1);
    this.elValTilt.textContent = `${t.pitchDeg}° / ${t.rollDeg}°`;
    this.elValRpm.textContent = t.rpm;

    // Armed status
    this.elArmedIndicator.textContent = t.isArmed ? (t.isHoverLocked ? '● HOVER LOCK' : '● Armed') : '○ Disarmed';

    // Target coords display
    const tgt = this.fc.targetPosition;
    this.elTargetCoords.textContent = t.isHoverLocked
      ? `LOCKED: (${tgt.x.toFixed(1)}, ${tgt.y.toFixed(1)}, ${tgt.z.toFixed(1)})`
      : `TARGET: (${tgt.x.toFixed(1)}, ${tgt.y.toFixed(1)}, ${tgt.z.toFixed(1)})`;

    // Active Tracking Source & Hand status
    const isCamActive = this.cam && this.cam.isActive;
    const isWsActive = this.ws && this.ws.isConnected;

    if (this.elValSource) {
      if (isCamActive) {
        this.elValSource.textContent = 'Webcam (Web GPU)';
        this.elValSource.style.color = '#2d5016';
      } else if (isWsActive) {
        this.elValSource.textContent = 'WebSocket (Python)';
        this.elValSource.style.color = '#2d5016';
      } else {
        this.elValSource.textContent = 'Keyboard / Mouse';
        this.elValSource.style.color = '#6b6b6b';
      }
    }

    const handCount = isCamActive ? this.cam.handCount : (isWsActive ? this.ws.handCount : 0);

    if (handCount > 0) {
      if (t.isHoverLocked) {
        this.elValHands.textContent = '✊ FIST (LOCKED)';
        this.elValHands.style.color = '#8b1a1a';
      } else {
        this.elValHands.textContent = '✋ OPEN (FLYING)';
        this.elValHands.style.color = '#2d5016';
      }
    } else {
      if (isCamActive || isWsActive) {
        this.elValHands.textContent = 'Waiting Hand…';
        this.elValHands.style.color = '#6b6b6b';
      } else {
        this.elValHands.textContent = 'Bấm Bật Webcam';
        this.elValHands.style.color = '#2d5016';
      }
    }
  }
}
