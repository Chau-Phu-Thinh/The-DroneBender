import * as THREE from 'three';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.initLights();
    this.initGround();
    this.initLandingPad();
  }

  initLights() {
    // Ambient Light (Warm white)
    const ambientLight = new THREE.AmbientLight(0xfaf7f0, 2.0);
    this.scene.add(ambientLight);

    // Directional Sun Light (Warm white, casts soft shadows)
    const sunLight = new THREE.DirectionalLight(0xfffdf5, 3.0);
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

    // Rim Light (Subtle warm)
    const rimLight = new THREE.DirectionalLight(0xf5e6d3, 0.8);
    rimLight.position.set(-20, 15, -20);
    this.scene.add(rimLight);

    // Fog for Depth
    this.scene.fog = new THREE.FogExp2(0xf5f0e8, 0.012);
  }

  initGround() {
    // Ground Plane (Warm paper beige)
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xe8e3db,
      roughness: 0.95,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid Overlay (Dark accent lines + light warm gray subdivisions)
    const grid = new THREE.GridHelper(100, 100, 0x2d2d2d, 0xd4cfc7);
    grid.position.y = 0.001;
    this.scene.add(grid);
  }

  initLandingPad() {
    const padGroup = new THREE.Group();

    // Generate high-resolution procedural Compass Rose texture
    const compassTexture = createCompassTexture();

    const compassGeo = new THREE.PlaneGeometry(7.2, 7.2);
    const compassMat = new THREE.MeshBasicMaterial({
      map: compassTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const compassMesh = new THREE.Mesh(compassGeo, compassMat);
    compassMesh.rotation.x = -Math.PI / 2;
    compassMesh.position.y = 0.005;
    padGroup.add(compassMesh);

    this.scene.add(padGroup);
  }
}

/**
 * Creates a high-res 8-point nautical compass rose (Đông Tây Nam Bắc)
 * exactly matching the classic compass design with N, S, E, W, nw, ne, sw, se.
 */
function createCompassTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  const dark = '#2d2d2d';
  const light = '#f5f0e8';

  const pt = (r, angleRad) => [
    cx + r * Math.cos(angleRad),
    cy + r * Math.sin(angleRad),
  ];

  const drawCircle = (r, lineWidth = 4, stroke = dark) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  // 1. Concentric Dial Rings
  drawCircle(580, 5);
  drawCircle(530, 3);
  drawCircle(360, 4);
  drawCircle(320, 2);

  // Radial degree ticks in outer ring track (530 to 580)
  for (let i = 0; i < 72; i++) {
    const angle = (i * Math.PI * 2) / 72;
    const isMajor = i % 9 === 0;
    const isMedium = i % 3 === 0;
    const rIn = isMajor ? 505 : isMedium ? 525 : 545;
    const [x1, y1] = pt(rIn, angle);
    const [x2, y2] = pt(580, angle);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = dark;
    ctx.lineWidth = isMajor ? 5 : isMedium ? 3 : 2;
    ctx.stroke();
  }

  // Dots outside track (r = 620)
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI * 2) / 16;
    const [dx, dy] = pt(620, angle);
    ctx.beginPath();
    ctx.arc(dx, dy, 7, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
  }

  // 2. Compass Star - 8 Points
  // Intermediate Ordinal Points (NE, SE, SW, NW)
  const minorLen = 490;
  const minorBase = 110;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const [tx, ty] = pt(minorLen, angle);
    const [lx, ly] = pt(minorBase, angle - Math.PI / 4);
    const [rx, ry] = pt(minorBase, angle + Math.PI / 4);

    // Dark half
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.lineTo(lx, ly);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();

    // Light half
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Major Cardinal Points (N, E, S, W)
  const majorLen = 780;
  const majorBase = 150;
  const cardinalAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

  cardinalAngles.forEach((angle) => {
    const [tx, ty] = pt(majorLen, angle);
    const [lx, ly] = pt(majorBase, angle - Math.PI / 4);
    const [rx, ry] = pt(majorBase, angle + Math.PI / 4);

    // Dark half (left side of star point)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.lineTo(lx, ly);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Light half (right side of star point)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Center Hub
  drawCircle(50, 4);
  drawCircle(25, 3);
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();

  // 3. Letters / Typography
  ctx.fillStyle = dark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Major Cardinal Letters: N, S, E, W
  ctx.font = 'bold 115px "Georgia", "Times New Roman", serif';
  const labelDist = 890;
  ctx.fillText('N', cx, cy - labelDist);
  ctx.fillText('S', cx, cy + labelDist);
  ctx.fillText('E', cx + labelDist, cy + 10);
  ctx.fillText('W', cx - labelDist, cy + 10);

  // Minor Ordinal Letters: nw, ne, se, sw
  ctx.font = 'italic bold 58px "Georgia", "Times New Roman", serif';
  const minorLabelDist = 690;
  const minorLabels = [
    { text: 'ne', angle: -Math.PI / 4 },
    { text: 'se', angle: Math.PI / 4 },
    { text: 'sw', angle: (3 * Math.PI) / 4 },
    { text: 'nw', angle: (-3 * Math.PI) / 4 },
  ];
  minorLabels.forEach(({ text, angle }) => {
    const [lx, ly] = pt(minorLabelDist, angle);
    ctx.fillText(text, lx, ly);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  return texture;
}
