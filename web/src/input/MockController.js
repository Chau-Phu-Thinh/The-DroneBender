import * as THREE from 'three';

export class MockController {
  constructor(flightController) {
    this.fc = flightController;
    this.keys = {};
    this.targetPos = new THREE.Vector3(0, this.fc.minAltitude, 0);
    this.mouseTarget = new THREE.Vector2(0, 0);

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousemove', (e) => {
      // Normalized screen coords (-1.0 to 1.0)
      this.mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseTarget.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
  }

  reset() {
    this.targetPos.set(0, this.fc.minAltitude, 0);
  }

  update(delta, isWSActive) {
    // If WebSocket is actively feeding hand tracking, don't override unless keyboard is actively pressed
    let pitchInput = 0;
    let rollInput = 0;
    let yawInput = 0;
    let throttleInput = 0.5;

    // Pitch: W / S
    if (this.keys['KeyW'] || this.keys['ArrowUp']) pitchInput -= 1.0;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) pitchInput += 1.0;

    // Roll: A / D
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) rollInput -= 1.0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) rollInput += 1.0;

    // Yaw: Q / E
    if (this.keys['KeyQ']) yawInput -= 1.0;
    if (this.keys['KeyE']) yawInput += 1.0;

    // Altitude: Space (Up) / Shift (Down)
    if (this.keys['Space']) throttleInput += 0.4;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) throttleInput -= 0.4;

    const hasKeyInput = pitchInput !== 0 || rollInput !== 0 || yawInput !== 0 || throttleInput !== 0.5;

    if (this.fc.mode === 'manual_rc') {
      this.fc.setRCInput(pitchInput, rollInput, yawInput, throttleInput);
    } else {
      // In finger tracking mode without WS/Webcam: Keyboard moves the virtual target position
      if (hasKeyInput) {
        const moveSpeed = 4.0 * delta;
        this.targetPos.x += rollInput * moveSpeed;
        this.targetPos.z += pitchInput * moveSpeed;
        this.targetPos.y += (throttleInput - 0.5) * 2 * moveSpeed;
        this.targetPos.y = Math.max(this.fc.minAltitude, Math.min(10.0, this.targetPos.y));
        this.fc.setTargetPosition(this.targetPos.x, this.targetPos.y, this.targetPos.z);
      }
    }
  }
}
