# The DroneBender

Control 3D Drone simulation and real drones using finger tracking and hand gestures.

## Architecture

1. **Python Tracking Layer**: MediaPipe Hand Landmark Tracking + Gesture Recognition + WebSocket Broadcaster.
2. **Web 3D Simulation Layer**: Three.js + Blender 3D Drone Model + Flight Dynamics / PID Controller.
3. **Hardware Bridge (Upcoming)**: MAVLink / ESP32 / Drone SDK.

## Getting Started

### 1. Python Tracking Server
```bash
# Install dependencies
uv sync

# Run tracker + WebSocket broadcast
python main.py
```

### 2. Web 3D Simulation (Three.js)
```bash
cd web
npm install
npm run dev
```
