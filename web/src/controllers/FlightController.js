import * as THREE from 'three';

export const FlightMode = {
  FINGER_TRACKING: 'finger_tracking',
  MANUAL_RC: 'manual_rc',
};

export class FlightController {
  constructor(droneEntity) {
    this.drone = droneEntity;

    // Mode
    this.mode = FlightMode.FINGER_TRACKING;
    this.isArmed = true;
    this.isHoverLocked = false;
    this.hoverLockPos = new THREE.Vector3(0, 1.5, 0);

    // Kinematics State
    this.position = new THREE.Vector3(0, 1.5, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.targetPosition = new THREE.Vector3(0, 1.5, 0);

    // Orientation State (Euler angles)
    this.pitch = 0; // X axis
    this.roll = 0;  // Z axis
    this.yaw = 0;   // Y axis
    this.targetYawRate = 0;

    // RC Flight Inputs (Normalized -1.0 to 1.0)
    this.rcInput = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.5,
    };

    // Physics Constants & Gains
    this.maxSpeed = 8.0;      // m/s
    this.maxTilt = 0.55;       // ~32 degrees max banking angle
    this.posLerpSpeed = 4.5;   // Spring response to finger
    this.tiltResponse = 8.0;   // How fast body tilts into movement
    this.minAltitude = 0.06;   // Ground landing plane
    this.maxAltitude = 12.0;

    // Initialize Drone position
    this.drone.setPosition(this.position);
  }

  setMode(mode) {
    this.mode = mode;
  }

  toggleMode() {
    this.mode =
      this.mode === FlightMode.FINGER_TRACKING
        ? FlightMode.MANUAL_RC
        : FlightMode.FINGER_TRACKING;
    return this.mode;
  }

  setArmed(armed) {
    this.isArmed = armed;
  }

  setHoverLock(locked) {
    if (locked && !this.isHoverLocked) {
      // Just entered lock: save current position
      this.hoverLockPos.copy(this.position);
    }
    this.isHoverLocked = locked;
  }

  setTargetPosition(x, y, z) {
    if (!this.isHoverLocked) {
      this.targetPosition.set(
        THREE.MathUtils.clamp(x, -15, 15),
        THREE.MathUtils.clamp(y, this.minAltitude, this.maxAltitude),
        THREE.MathUtils.clamp(z, -15, 15)
      );
    }
  }

  applyYawRate(rate) {
    this.targetYawRate = rate;
  }

  setRCInput(pitch, roll, yawRate, throttle) {
    this.rcInput.pitch = THREE.MathUtils.clamp(pitch, -1, 1);
    this.rcInput.roll = THREE.MathUtils.clamp(roll, -1, 1);
    this.rcInput.yaw = THREE.MathUtils.clamp(yawRate, -1, 1);
    this.rcInput.throttle = THREE.MathUtils.clamp(throttle, 0, 1);
  }

  reset() {
    this.position.set(0, 1.5, 0);
    this.velocity.set(0, 0, 0);
    this.targetPosition.set(0, 1.5, 0);
    this.hoverLockPos.set(0, 1.5, 0);
    this.isHoverLocked = false;
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.targetYawRate = 0;
    this.drone.setPosition(this.position);
    this.drone.setRotation(new THREE.Euler(0, 0, 0));
  }

  update(delta) {
    if (!this.isArmed) {
      // Disarmed -> Free fall / drop to ground
      this.velocity.y -= 9.8 * delta;
      this.position.y += this.velocity.y * delta;
      if (this.position.y < this.minAltitude) {
        this.position.y = this.minAltitude;
        this.velocity.set(0, 0, 0);
      }
      this.drone.setPosition(this.position);
      this.drone.update(delta, 0, false);
      return;
    }

    if (this.mode === FlightMode.FINGER_TRACKING) {
      this.updateFingerTracking(delta);
    } else {
      this.updateManualRC(delta);
    }

    // Ground altitude clamp
    if (this.position.y < this.minAltitude) {
      this.position.y = this.minAltitude;
      this.velocity.y = Math.max(0, this.velocity.y);
    }

    // Apply translation & rotation to Drone Model
    this.drone.setPosition(this.position);
    this.drone.setRotation(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));

    // Update Propellers & Thrust
    const currentSpeed = this.velocity.length();
    const throttleEst = THREE.MathUtils.clamp(0.4 + currentSpeed / this.maxSpeed * 0.6, 0.2, 1.0);
    this.drone.update(delta, throttleEst, this.isArmed);
  }

  updateFingerTracking(delta) {
    // 1. Update Yaw from hand tilt roll angle
    if (this.targetYawRate !== 0) {
      this.yaw += this.targetYawRate * delta;
    }

    // 2. Target following or Hover lock
    const target = this.isHoverLocked ? this.hoverLockPos : this.targetPosition;
    const error = new THREE.Vector3().subVectors(target, this.position);

    // 3. Velocity calculation
    const desiredVel = error.clone().multiplyScalar(this.isHoverLocked ? 6.0 : this.posLerpSpeed);
    desiredVel.clampLength(0, this.maxSpeed);

    // Smooth velocity transition
    const dampRate = this.isHoverLocked ? 8.0 : 6.0;
    this.velocity.lerp(desiredVel, delta * dampRate);
    this.position.addScaledVector(this.velocity, delta);

    // 4. Dynamic Banking / Tilt based on velocity transformed into local drone coordinate system
    const localVelX = this.velocity.x * Math.cos(-this.yaw) - this.velocity.z * Math.sin(-this.yaw);
    const localVelZ = this.velocity.x * Math.sin(-this.yaw) + this.velocity.z * Math.cos(-this.yaw);

    // Pitch tilts forward when moving forward (local -Z)
    const targetPitch = THREE.MathUtils.clamp(
      (localVelZ / this.maxSpeed) * this.maxTilt,
      -this.maxTilt,
      this.maxTilt
    );

    // Roll tilts sideways when moving lateral (local X)
    const targetRoll = THREE.MathUtils.clamp(
      (-localVelX / this.maxSpeed) * this.maxTilt,
      -this.maxTilt,
      this.maxTilt
    );

    // Smooth tilt transitions
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, delta * this.tiltResponse);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, delta * this.tiltResponse);
  }

  updateManualRC(delta) {
    // RC Manual Mode
    const targetPitch = this.rcInput.pitch * this.maxTilt;
    const targetRoll = -this.rcInput.roll * this.maxTilt;

    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, delta * this.tiltResponse);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, delta * this.tiltResponse);

    // Yaw rotation
    this.yaw += -this.rcInput.yaw * 2.5 * delta;

    // Movement from tilt + throttle
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));

    const moveDir = new THREE.Vector3()
      .addScaledVector(forward, -this.rcInput.pitch)
      .addScaledVector(right, this.rcInput.roll);

    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * this.maxSpeed, delta * 4);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * this.maxSpeed, delta * 4);

    // Altitude from Throttle (0.5 is hover equilibrium)
    const vertSpeed = (this.rcInput.throttle - 0.5) * 6.0;
    this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, vertSpeed, delta * 4);

    this.position.addScaledVector(this.velocity, delta);
  }

  getTelemetry() {
    return {
      altitude: this.position.y,
      speed: this.velocity.length(),
      pitchDeg: (this.pitch * (180 / Math.PI)).toFixed(1),
      rollDeg: (this.roll * (180 / Math.PI)).toFixed(1),
      yawDeg: (this.yaw * (180 / Math.PI) % 360).toFixed(0),
      rpm: Math.round(this.drone.rpm),
      mode: this.mode,
      isArmed: this.isArmed,
      isHoverLocked: this.isHoverLocked,
    };
  }
}
