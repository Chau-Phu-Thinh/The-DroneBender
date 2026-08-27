import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { DroneEntity } from './entities/DroneEntity.js';
import { FlightController } from './controllers/FlightController.js';
import { WSReceiver } from './input/WSReceiver.js';
import { MockController } from './input/MockController.js';
import { HUD } from './ui/HUD.js';

console.log('🛸 Initializing The DroneBender 3D Simulation...');

// 1. Scene & Render Engine
const sceneManager = new SceneManager('canvas-container');

// 2. 3D Drone Entity
const droneEntity = new DroneEntity(sceneManager.scene);

// 3. Flight Controller (Physics / Dynamics)
const flightController = new FlightController(droneEntity);

// 4. WebSocket Receiver (Connects to Python Hand Tracker)
const wsReceiver = new WSReceiver('ws://localhost:8765');

// 5. Mock / Fallback Keyboard & Mouse Controller
const mockController = new MockController(flightController);

// 6. UI HUD
const hud = new HUD(sceneManager, flightController, droneEntity, wsReceiver);

// Wire WS events to FlightController
wsReceiver.onStatusChange = (connected) => {
  hud.updateWSStatus(connected);
};

wsReceiver.onHandTarget = (data) => {
  if (data.isFist) {
    // Closed Fist -> Lock position / Hover in place
    flightController.setHoverLock(true);
  } else {
    // Open Hand -> Full 3D Flight & Yaw Steering
    flightController.setHoverLock(false);
    flightController.setTargetPosition(data.x, data.y, data.z);
    flightController.applyYawRate(data.yawRate);
  }
};

wsReceiver.onGesture = (gesture) => {
  if (gesture.name === 'fist') {
    flightController.setHoverLock(true);
  }
};

// 7. Main Simulation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);

  // Update Mock / Keyboard input
  const isWSStreaming = wsReceiver.isConnected && wsReceiver.handCount > 0;
  mockController.update(delta, isWSStreaming);

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
