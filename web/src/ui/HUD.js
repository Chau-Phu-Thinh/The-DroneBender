export class HUD {
  constructor(sceneManager, flightController, droneEntity, wsReceiver) {
    this.sm = sceneManager;
    this.fc = flightController;
    this.drone = droneEntity;
    this.ws = wsReceiver;

    // DOM Elements
    this.elWsStatus = document.getElementById('ws-status');
    this.elBtnMode = document.getElementById('btn-mode-toggle');
    this.elBtnCam = document.getElementById('btn-camera-toggle');
    this.elBtnReset = document.getElementById('btn-reset');
    this.elGlbInput = document.getElementById('glb-input');

    this.elValAlt = document.getElementById('val-alt');
    this.elValSpd = document.getElementById('val-spd');
    this.elValTilt = document.getElementById('val-tilt');
    this.elValRpm = document.getElementById('val-rpm');
    this.elValFps = document.getElementById('val-fps');
    this.elValHands = document.getElementById('val-hands');
    this.elValPing = document.getElementById('val-ping');
    this.elValBat = document.getElementById('val-bat');
    this.elTargetCoords = document.getElementById('target-coords');
    this.elArmedIndicator = document.getElementById('armed-indicator');

    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.fps = 60;
    this.battery = 98;

    this.bindEvents();
  }

  bindEvents() {
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
    if (connected) {
      this.elWsStatus.textContent = 'Connected';
      this.elWsStatus.className = 'status-tag status-online';
      this.elValPing.textContent = '4';
    } else {
      this.elWsStatus.textContent = 'Offline';
      this.elWsStatus.className = 'status-tag status-offline';
      this.elValPing.textContent = '--';
      this.elValHands.textContent = 'No Hand';
      this.elValHands.style.color = '';
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

    // Hands status
    if (this.ws.isConnected) {
      if (this.ws.handCount > 0) {
        if (t.isHoverLocked) {
          this.elValHands.textContent = '✊ FIST (LOCKED)';
          this.elValHands.style.color = '#8b1a1a';
        } else {
          this.elValHands.textContent = '✋ OPEN (FLYING)';
          this.elValHands.style.color = '#2d5016';
        }
      } else {
        this.elValHands.textContent = 'Waiting Hand…';
        this.elValHands.style.color = '#6b6b6b';
      }
    }
  }
}
