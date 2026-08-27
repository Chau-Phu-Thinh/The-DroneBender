import * as THREE from 'three';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.initLights();
    this.initGround();
    this.initLandingPad();
  }

  initLights() {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0x0f172a, 1.5);
    this.scene.add(ambientLight);

    // Directional Sun Light (Casts soft shadows)
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunLight.position.set(20, 30, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    const d = 25;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Subtle Cyan Rim Light
    const rimLight = new THREE.DirectionalLight(0x00ffcc, 1.0);
    rimLight.position.set(-20, 15, -20);
    this.scene.add(rimLight);

    // Scene Fog for Depth
    this.scene.fog = new THREE.FogExp2(0x0a0b10, 0.015);
  }

  initGround() {
    // Infinite Ground Plane
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x07090e,
      roughness: 0.85,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Cyber Grid Overlay
    const grid = new THREE.GridHelper(100, 100, 0x00ffcc, 0x1e293b);
    grid.position.y = 0.001;
    this.scene.add(grid);
  }

  initLandingPad() {
    const padGroup = new THREE.Group();

    // Outer Circle
    const outerGeo = new THREE.RingGeometry(2.8, 3.0, 64);
    const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide });
    const outerRing = new THREE.Mesh(outerGeo, cyanMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.005;
    padGroup.add(outerRing);

    // Inner Circle
    const innerGeo = new THREE.RingGeometry(1.4, 1.5, 64);
    const innerRing = new THREE.Mesh(innerGeo, cyanMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.005;
    padGroup.add(innerRing);

    // Center "H" Marking
    const hBarMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide });
    const barGeo1 = new THREE.PlaneGeometry(0.25, 1.2);
    const barGeo2 = new THREE.PlaneGeometry(0.8, 0.25);

    const b1 = new THREE.Mesh(barGeo1, hBarMat);
    b1.position.set(-0.4, 0.006, 0);
    b1.rotation.x = -Math.PI / 2;

    const b2 = new THREE.Mesh(barGeo1, hBarMat);
    b2.position.set(0.4, 0.006, 0);
    b2.rotation.x = -Math.PI / 2;

    const b3 = new THREE.Mesh(barGeo2, hBarMat);
    b3.position.set(0, 0.006, 0);
    b3.rotation.x = -Math.PI / 2;

    padGroup.add(b1, b2, b3);
    this.scene.add(padGroup);
  }
}
