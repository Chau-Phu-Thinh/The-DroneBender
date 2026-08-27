import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class DroneEntity {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.propellers = []; // Array of meshes to rotate
    this.customModel = null;
    this.rpm = 0;
    this.targetRpm = 6000;

    // Ground Shadow / Thrust Ring Projector
    this.thrustRing = this.createThrustRing();
    this.scene.add(this.thrustRing);

    // Build Default Procedural Quadcopter Model
    this.buildDefaultDrone();
  }

  createThrustRing() {
    const geo = new THREE.RingGeometry(0.3, 0.38, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    return ring;
  }

  buildDefaultDrone() {
    this.droneBodyGroup = new THREE.Group();

    // 1. Central Body
    const bodyGeo = new THREE.BoxGeometry(0.35, 0.12, 0.45);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      metalness: 0.8,
      roughness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.droneBodyGroup.add(body);

    // Top Canopy (Aerodynamic)
    const canopyGeo = new THREE.ConeGeometry(0.16, 0.25, 4);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      metalness: 0.9,
      roughness: 0.1,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.rotation.y = Math.PI / 4;
    canopy.rotation.x = Math.PI / 2;
    canopy.position.set(0, 0.08, -0.05);
    canopy.scale.set(1, 0.6, 1.4);
    canopy.castShadow = true;
    this.droneBodyGroup.add(canopy);

    // Front Camera Gimbal
    const camGimbal = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 })
    );
    camGimbal.position.set(0, -0.02, -0.22);
    this.droneBodyGroup.add(camGimbal);

    // Camera Lens (Glow Cyan)
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.02, -0.26);
    this.droneBodyGroup.add(lens);

    // 2. Carbon Fiber Arms (X-Frame configuration)
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.5,
      metalness: 0.7,
    });

    const motorMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.2,
    });

    // 4 Arm positions (FL, FR, BL, BR)
    const armPositions = [
      { name: 'FL', x: -0.45, z: -0.45, isFront: true, isLeft: true },
      { name: 'FR', x: 0.45, z: -0.45, isFront: true, isLeft: false },
      { name: 'BL', x: -0.45, z: 0.45, isFront: false, isLeft: true },
      { name: 'BR', x: 0.45, z: 0.45, isFront: false, isLeft: false },
    ];

    armPositions.forEach((pos) => {
      // Carbon arm tube
      const armLength = Math.hypot(pos.x, pos.z);
      const armGeo = new THREE.CylinderGeometry(0.02, 0.02, armLength, 12);
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(pos.x / 2, 0, pos.z / 2);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -Math.atan2(pos.z, pos.x);
      arm.castShadow = true;
      this.droneBodyGroup.add(arm);

      // Motor Mount
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), motorMat);
      motor.position.set(pos.x, 0.03, pos.z);
      motor.castShadow = true;
      this.droneBodyGroup.add(motor);

      // Propeller (2-blade carbon + blurred visual disc)
      const propGroup = new THREE.Group();
      propGroup.position.set(pos.x, 0.075, pos.z);

      const bladeGeo = new THREE.BoxGeometry(0.48, 0.005, 0.04);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x050505,
        roughness: 0.4,
        metalness: 0.8,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.castShadow = true;
      propGroup.add(blade);

      // Translucent blurred rotor disc for high speed rotation
      const discGeo = new THREE.CircleGeometry(0.24, 24);
      const discMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      propGroup.add(disc);

      this.droneBodyGroup.add(propGroup);
      this.propellers.push({
        group: propGroup,
        direction: (pos.isFront && pos.isLeft) || (!pos.isFront && !pos.isLeft) ? 1 : -1,
      });

      // Navigation LED Lights
      const ledColor = pos.isFront ? 0x00ffcc : 0xff0055;
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 8, 8),
        new THREE.MeshBasicMaterial({ color: ledColor })
      );
      led.position.set(pos.x, -0.02, pos.z);
      this.droneBodyGroup.add(led);

      // Light point for front LEDs
      if (pos.isFront) {
        const pointLight = new THREE.PointLight(ledColor, 0.5, 2);
        pointLight.position.set(pos.x, -0.02, pos.z);
        this.droneBodyGroup.add(pointLight);
      }
    });

    this.root.add(this.droneBodyGroup);
  }

  loadGLB(urlOrBuffer) {
    const loader = new GLTFLoader();
    const onLoad = (gltf) => {
      if (this.droneBodyGroup) {
        this.root.remove(this.droneBodyGroup);
      }
      if (this.customModel) {
        this.root.remove(this.customModel);
      }

      this.customModel = gltf.scene;
      this.customModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Search for propeller meshes in Blender hierarchy
      this.propellers = [];
      const propNames = ['Prop_FL', 'Prop_FR', 'Prop_BL', 'Prop_BR', 'Propeller', 'Rotor'];
      this.customModel.traverse((node) => {
        if (propNames.some((name) => node.name.includes(name))) {
          this.propellers.push({ group: node, direction: 1 });
        }
      });

      this.root.add(this.customModel);
      console.log('✓ Custom Blender Drone Model Loaded successfully!');
    };

    if (typeof urlOrBuffer === 'string') {
      loader.load(urlOrBuffer, onLoad);
    } else {
      loader.parse(urlOrBuffer, '', onLoad, (err) => console.error('GLTF parse error:', err));
    }
  }

  update(delta, throttle = 1.0, isArmed = true) {
    // Smoothly adjust RPM based on throttle and armed state
    const desiredRpm = isArmed ? 3000 + throttle * 5000 : 0;
    this.rpm = THREE.MathUtils.lerp(this.rpm, desiredRpm, delta * 5);

    // Rotate propellers
    const propSpeed = (this.rpm / 60) * Math.PI * 2 * delta;
    this.propellers.forEach((prop) => {
      prop.group.rotation.y += propSpeed * prop.direction;
    });

    // Update Thrust Ground Ring position & scale with altitude
    const droneY = this.root.position.y;
    this.thrustRing.position.x = this.root.position.x;
    this.thrustRing.position.z = this.root.position.z;
    
    // Scale ring larger & more transparent as drone climbs
    const ringScale = Math.max(0.6, 1.0 + droneY * 0.4);
    this.thrustRing.scale.set(ringScale, ringScale, ringScale);
    this.thrustRing.material.opacity = isArmed ? Math.max(0.05, 0.45 - droneY * 0.08) : 0;
  }

  setPosition(pos) {
    this.root.position.copy(pos);
  }

  setRotation(euler) {
    this.root.rotation.copy(euler);
  }

  getPosition() {
    return this.root.position;
  }

  getRotation() {
    return this.root.rotation;
  }
}
