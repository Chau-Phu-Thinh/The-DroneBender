import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { DroneEntity } from './entities/DroneEntity.js';
import { FlightController } from './controllers/FlightController.js';
import { WSReceiver } from './input/WSReceiver.js';
import { WebCameraTracker } from './input/WebCameraTracker.js';
import { MockController } from './input/MockController.js';
import { HUD } from './ui/HUD.js';

console.log('🛸 Initializing The DroneBender 3D Simulation...');

// 1. Scene & Render Engine
const sceneManager = new SceneManager('canvas-container');

// 2. 3D Drone Entity
const droneEntity = new DroneEntity(sceneManager.scene);

// 3. Flight Controller (Physics / Dynamics)
const flightController = new FlightController(droneEntity);

// 4. WebSocket Receiver (Connects to Python Hand Tracker if available)
const wsReceiver = new WSReceiver('ws://localhost:8765');

// 5. In-Browser Web Camera Tracker (Client-Side MediaPipe GPU)
const webCameraTracker = new WebCameraTracker();

// 6. Mock / Fallback Keyboard & Mouse Controller
const mockController = new MockController(flightController);

// 7. UI HUD
const hud = new HUD(sceneManager, flightController, droneEntity, wsReceiver, webCameraTracker, mockController);

// Shared Hand Target Handler
function handleHandTarget(data) {
  if (data.isFist) {
    flightController.applyYawRate(0);
    flightController.setHoverLock(true);
  } else {
    flightController.setHoverLock(false);
    flightController.setTargetPosition(data.x, data.y, data.z);
    flightController.applyYawRate(data.yawRate);
  }
}

// Wire WebCameraTracker events
webCameraTracker.onHandTarget = handleHandTarget;
webCameraTracker.onStatusChange = () => {
  hud.updateWSStatus(wsReceiver.isConnected);
};

// Wire WS events
wsReceiver.onStatusChange = (connected) => {
  hud.updateWSStatus(connected);
};

wsReceiver.onHandTarget = (data) => {
  // Only use WS data if Web Camera is not active
  if (!webCameraTracker.isActive) {
    handleHandTarget(data);
  }
};

// 8. Main Simulation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();

  // Update In-Browser Web Camera Tracker (if active)
  if (webCameraTracker.isActive) {
    webCameraTracker.update(now);
  }

  // Update Mock / Keyboard input
  const isHandStreaming =
    (webCameraTracker.isActive && webCameraTracker.handCount > 0) ||
    (wsReceiver.isConnected && wsReceiver.handCount > 0);
  mockController.update(delta, isHandStreaming);

  // Update Drone Physics & Kinematics
  flightController.update(delta);

  // Update HUD
  hud.update(delta);

  // Update Camera & Render 3D Scene
  sceneManager.update(
    delta,
    flightController.position,
    new THREE.Euler(flightController.pitch, flightController.yaw, flightController.roll)
  );
}

animate();
