import * as THREE from 'three';

export class MockController {
  constructor(flightController) {
    this.fc = flightController;
    this.keys = {};
    this.targetPos = new THREE.Vector3(0, 1.5, 0);
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
      // In finger tracking mode without WS: Keyboard moves the virtual target position
      if (hasKeyInput) {
        const moveSpeed = 4.0 * delta;
        this.targetPos.x += rollInput * moveSpeed;
        this.targetPos.z += pitchInput * moveSpeed;
        this.targetPos.y += (throttleInput - 0.5) * 2 * moveSpeed;
        this.targetPos.y = Math.max(0.2, Math.min(10.0, this.targetPos.y));
        this.fc.setTargetPosition(this.targetPos.x, this.targetPos.y, this.targetPos.z);
      } else if (!isWSActive) {
        // Subtle idle hover bobbing
        const time = performance.now() * 0.0015;
        this.targetPos.x = Math.sin(time * 0.8) * 0.5;
        this.targetPos.z = Math.cos(time * 0.6) * 0.5;
        this.targetPos.y = 1.5 + Math.sin(time * 2.0) * 0.15;
        this.fc.setTargetPosition(this.targetPos.x, this.targetPos.y, this.targetPos.z);
      }
    }
  }
}
