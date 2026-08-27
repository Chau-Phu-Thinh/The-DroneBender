import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Environment } from './Environment.js';

export class SceneManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f0e8);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 3, 5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 50;
    this.controls.target.set(0, 1, 0);

    // Environment
    this.environment = new Environment(this.scene);

    // Camera Mode ('chase' | 'free')
    this.cameraMode = 'chase';
    this.chaseOffset = new THREE.Vector3(0, 1.8, 3.8);

    // Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    if (mode === 'free') {
      this.controls.enabled = true;
    } else {
      this.controls.enabled = false;
    }
  }

  toggleCameraMode() {
    this.setCameraMode(this.cameraMode === 'chase' ? 'free' : 'chase');
    return this.cameraMode;
  }

  update(delta, dronePosition, droneRotation) {
    if (this.cameraMode === 'chase' && dronePosition) {
      const rotatedOffset = this.chaseOffset.clone().applyEuler(new THREE.Euler(0, droneRotation ? droneRotation.y : 0, 0));
      const targetCamPos = dronePosition.clone().add(rotatedOffset);
      this.camera.position.lerp(targetCamPos, 0.08);
      const lookTarget = dronePosition.clone().add(new THREE.Vector3(0, 0.3, 0));
      this.camera.lookAt(lookTarget);
    } else {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
