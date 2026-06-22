import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import * as dat from 'dat.gui';


const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

let canvasRect = null;
function updateCanvasRect() {
  if (renderer && renderer.domElement) {
    canvasRect = renderer.domElement.getBoundingClientRect();
  }
}
updateCanvasRect();


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(7.5, 0.8, 1.2);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.minDistance = 2;
controls.maxDistance = 100;
controls.autoRotate = false;
controls.enableRotate = true;
controls.rotateSpeed = 0.4;

const ambientLight = new THREE.AmbientLight(0xfff6ea, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemiLight);


const createThickCylinderGeometry = (innerRadius, outerRadius, height) => {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const extrudeSettings = {
    depth: height,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 128
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  return geometry;
};

// Globe and orbit ring materials
const globeMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8d9c4,
  roughness: 0.85,
  metalness: 0.05,
  transparent: true,
  opacity: 0.0,
  emissive: 0x271d1a,
  emissiveIntensity: 0.02
});
const orbitMaterial = new THREE.MeshBasicMaterial({ color: 0xf3e3d6, transparent: true, opacity: 0.0, side: THREE.DoubleSide });

let globe = null;
let orbitRing = null;

// Cylinder params
const cylinderParams = { radius: 2.5, height: 3.45, wallRatio: 0.88 };

function buildCylinder() {
  const outerR = cylinderParams.radius;
  const innerR = outerR * cylinderParams.wallRatio;
  const height = cylinderParams.height;

  if (globe) scene.remove(globe);
  if (orbitRing) scene.remove(orbitRing);

  const globeGeometry = createThickCylinderGeometry(innerR, outerR, height);
  globeGeometry.translate(0, 0, 4 - height);
  globe = new THREE.Mesh(globeGeometry, globeMaterial);
  scene.add(globe);

  // Make the orbit ring slightly shorter and offset it to completely prevent co-planar Z-fighting on caps
  const orbitHeight = height - 0.02;
  const orbitGeometry = createThickCylinderGeometry(innerR * 0.985, outerR * 1.005, orbitHeight);
  orbitGeometry.translate(0, 0, 4 - height + 0.01);
  orbitRing = new THREE.Mesh(orbitGeometry, orbitMaterial);
  scene.add(orbitRing);

  if (typeof introActive !== 'undefined' && introActive) {
    globe.visible = false;
    orbitRing.visible = false;
  }

  if (window.labelsInitialized) {
    initNavLabels();
  }
}

// --- Intro Cursive Animation State ---
let introActive = true;
let introTimer = 0;
let unwriteTimer = 0;
let loadedCount = 0;
let allAssetsLoaded = false;
let fullyOptimized = false;
let isPostSequence = false;
let postSeqTimer = 0;
let postSeqAngle = 0;
let sequenceEverCompleted = false;
let loaderFinishedTime = 0;
let loaderOverlayHidden = false;

let writePauseTimer = 0;
let unwritePauseTimer = 0;
let introFinaleActive = false;
let introFinaleTimer = 0;
let isVehicleHeld = false;
let activeWheelSpeedFactor = 1.0;
let transitionStartGlobeOpacity = 1.0;
let transitionStartOrbitOpacity = 0.45;
let transitionStartCursiveOpacity = 0.0;

function getCylinderMiddleZ() {
  return 4 - cylinderParams.height / 2;
}

let cursivePlane = null;
let cursiveCanvas = null;
let cursiveTexture = null;
let lastWriteProgress = -1;
let lastUnwriteProgress = -1;

// Intro animation configuration parameters (editable in GUI)
const introParams = {
  writeDuration: 1.2,
  unwriteDuration: 1.0
};

// Camera intro transition targets
let isIntroTransitioning = false;
let introTransitionProgress = 0;
const introTransitionStartPos = new THREE.Vector3();
const introTransitionStartTarget = new THREE.Vector3();
const introTransitionStartUp = new THREE.Vector3();

function initCursivePlane() {
  cursiveCanvas = document.createElement('canvas');
  cursiveCanvas.width = 4096;
  cursiveCanvas.height = 2048;

  cursiveTexture = new THREE.CanvasTexture(cursiveCanvas);
  cursiveTexture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: cursiveTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false
  });

  const geometry = new THREE.PlaneGeometry(3.6, 1.8);
  cursivePlane = new THREE.Mesh(geometry, material);
  cursivePlane.position.set(0, 0, getCylinderMiddleZ());
  // Face Y = -1.8 direction
  cursivePlane.rotation.x = Math.PI / 2;
  cursivePlane.renderOrder = 999;
  scene.add(cursivePlane);
}

function drawCursiveName(writeProgress, unwriteProgress) {
  if (!cursiveCanvas) return;
  const ctx = cursiveCanvas.getContext('2d');
  ctx.clearRect(0, 0, cursiveCanvas.width, cursiveCanvas.height);

  const name1 = "advitiya";
  const name2 = "jadhav";

  // Use the Serif 420 font (Instrument Serif)
  ctx.font = '420px "Instrument Serif", Georgia, serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000000'; // Make writing black

  // Measure text to center them
  const w1 = ctx.measureText(name1).width;
  const w2 = ctx.measureText(name2).width;

  const startX1 = (4096 - w1) / 2;
  const startX2 = (4096 - w2) / 2;

  // Vertical placement — centered and larger
  const y1 = 480;
  const y2 = 1000;
  const rowHeight = 560;

  // --- Draw First Name ("advitiya") ---
  ctx.save();
  ctx.beginPath();
  if (unwriteProgress > 0) {
    // Unwrite left-to-right (beginning to end): clip X moves right
    const clipX = startX1 + unwriteProgress * w1;
    ctx.rect(clipX, y1, w1 * (1.0 - unwriteProgress), rowHeight);
  } else {
    // Write left-to-right (beginning to end): clip width increases
    ctx.rect(startX1, y1, w1 * writeProgress, rowHeight);
  }
  ctx.clip();
  ctx.fillText(name1, startX1, y1);
  ctx.restore();

  // --- Draw Last Name ("jadhav") ---
  ctx.save();
  ctx.beginPath();
  if (unwriteProgress > 0) {
    // Unwrite right-to-left (end to beginning): clip width decreases from the right
    ctx.rect(startX2, y2, w2 * (1.0 - unwriteProgress), rowHeight);
  } else {
    // Write left-to-right (beginning to end): clip width increases
    ctx.rect(startX2, y2, w2 * writeProgress, rowHeight);
  }
  ctx.clip();
  ctx.fillText(name2, startX2, y2);
  ctx.restore();

  cursiveTexture.needsUpdate = true;
}

function checkAllAssetsLoaded() {
  const pctEl = document.getElementById('loader-percent');
  if (loadedCount < 12) {
    if (pctEl) {
      const pct = Math.min(99, Math.round((loadedCount / 12) * 100));
      pctEl.innerText = pct + '%';
    }
  } else if (loadedCount === 12 && !allAssetsLoaded) {
    allAssetsLoaded = true;
    loaderFinishedTime = performance.now();
    if (pctEl) {
      pctEl.innerText = '100%';
    }
    console.log("All 12 assets loaded, starting incremental caching in background...");
  }
}

function setOpacity(obj, opacityVal) {
  if (!obj) return;
  if (opacityVal <= 0) {
    obj.visible = false;
    return;
  }
  obj.visible = true;
  obj.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        const origOpacity = mat.userData.originalOpacity !== undefined ? mat.userData.originalOpacity : 1.0;
        mat.opacity = origOpacity * opacityVal;
      });
    }
  });
}

buildCylinder();
initCursivePlane();

// --- Single shared GUI ---
const gui = new dat.GUI({ width: 300 });

// Cylinder folder
const cylFolder = gui.addFolder('Cylinder');
// Track distance controllers so we can update their max when radius changes
const distanceControllers = [];

cylFolder.add(cylinderParams, 'radius', 0.5, 40.0).step(0.01).name('Radius').onChange(() => {
  buildCylinder();
  motorcycleCache.clear();
  boatCache.clear();
  broncoCache.clear();
  car2Cache.clear();
  racecarCache.clear();
  motorcycleRadialOffset = null;
  boatRadialOffset = null;
  broncoRadialOffset = null;
  car2RadialOffset = null;

  // Update all distance slider max to 2× new radius
  const newMax = cylinderParams.radius * 2;
  distanceControllers.forEach(ctrl => {
    ctrl.__max = newMax;
    ctrl.updateDisplay();
  });
});
cylFolder.add(cylinderParams, 'height', 1.0, 30.0).step(0.1).name('Height').onChange(() => {
  buildCylinder();
  motorcycleCache.clear();
  boatCache.clear();
  broncoCache.clear();
  car2Cache.clear();
  racecarCache.clear();
});
cylFolder.add(cylinderParams, 'wallRatio', 0.5, 0.99).step(0.01).name('Thickness').onChange(() => {
  buildCylinder();
  motorcycleCache.clear();
  boatCache.clear();
  broncoCache.clear();
  car2Cache.clear();
  racecarCache.clear();
});
cylFolder.open();

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
dracoLoader.setDecoderConfig({ type: 'js' });
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/');
ktx2Loader.detectSupport(renderer);

// Separate raw loader for vehicle assets — no DRACO or Meshopt decoders
const rawLoader = new GLTFLoader();
rawLoader.setKTX2Loader(ktx2Loader);

loader.setKTX2Loader(ktx2Loader);

// propellerObject is now set when the standalone airplane.glb is loaded (see below)

function prepareMesh(child, isVehicle = false) {
  if (child.isMesh) {
    if (child.material) {
      // High metalness without environment maps renders pitch black in Three.js.
      // We cap metalness to 0.1 and raise roughness to at least 0.4 to make materials diffuse light.
      if (child.material.metalness !== undefined && child.material.metalness > 0.1) {
        child.material.metalness = 0.1;
      }
      if (child.material.roughness !== undefined && child.material.roughness < 0.4) {
        child.material.roughness = 0.4;
      }

      // Pre-initialize transparency for vehicles to prevent compilation lag during transitions
      if (isVehicle) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          mat.transparent = true;
          if (mat.userData.originalOpacity === undefined) {
            mat.userData.originalOpacity = mat.opacity !== undefined ? mat.opacity : 1.0;
          }
        });
      }
    }
  }
}

// Discretization step for snapping caches (in radians, ~1.15 degrees)
const STEP = 0.02;

// Caches for vehicle snapping raycasts (keyed by discrete angle index)
const motorcycleCache = new Map();
const boatCache = new Map();
const broncoCache = new Map();
const car2Cache = new Map();
const racecarCache = new Map();

// Flat mesh lists for optimized raycasting (avoiding recursive tree traversals inside the rendering loop)
const cityRoadMeshes = [];
const beachGroundMeshes = [];
const desertGroundMeshes = [];
const landscapeMeshes = [];
const cafeMeshes = [];

// --- Incremental Caching State ---
let cacheVehicleIdx = 0; // 0: motorcycle, 1: boat, 2: bronco, 3: car2, 4: racecar
let cacheAngleIdx = 0;
const cacheAngles = [];
const maxIndex = Math.ceil((Math.PI * 2) / STEP); // 315
for (let idx = 0; idx <= maxIndex; idx++) {
  cacheAngles.push(idx * STEP);
}

function getSnappedData(cache, raycastFn, angle) {
  // Normalize angle to [0, 2 * Math.PI)
  let normAngle = angle % (Math.PI * 2);
  if (normAngle < 0) {
    normAngle += Math.PI * 2;
  }

  const val = normAngle / STEP;
  const idx_low = Math.floor(val);
  const idx_high = Math.ceil(val);
  const t = val - idx_low;

  if (idx_low === idx_high) {
    if (!cache.has(idx_low)) {
      cache.set(idx_low, raycastFn(idx_low * STEP));
    }
    const cached = cache.get(idx_low);
    return { posRadius: cached.posRadius, localHitNormal: cached.localHitNormal ? cached.localHitNormal.clone() : null };
  }

  if (!cache.has(idx_low)) {
    cache.set(idx_low, raycastFn(idx_low * STEP));
  }
  if (!cache.has(idx_high)) {
    cache.set(idx_high, raycastFn(idx_high * STEP));
  }

  const data_low = cache.get(idx_low);
  const data_high = cache.get(idx_high);

  const posRadius = THREE.MathUtils.lerp(data_low.posRadius, data_high.posRadius, t);
  let localHitNormal = null;
  if (data_low.localHitNormal && data_high.localHitNormal) {
    localHitNormal = new THREE.Vector3().lerpVectors(data_low.localHitNormal, data_high.localHitNormal, t).normalize();
  } else if (data_low.localHitNormal) {
    localHitNormal = data_low.localHitNormal.clone();
  } else if (data_high.localHitNormal) {
    localHitNormal = data_high.localHitNormal.clone();
  }

  return { posRadius, localHitNormal };
}

// --- Textbox Helpers ---
function createTextBox(data) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const radius = 24;
  const x = 12;
  const y = 12;
  const width = canvas.width - 24;
  const height = canvas.height - 24;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  if (typeof data === 'string') {
    ctx.font = '44px "Instrument Serif", Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(data, canvas.width / 2, canvas.height / 2);
  } else {
    // 1. Draw Title
    ctx.font = 'bold 36px "Instrument Serif", Georgia, serif';
    ctx.textBaseline = 'top';
    ctx.fillText(data.title || '', canvas.width / 2, 42);

    // 2. Draw Subtitle
    ctx.fillStyle = '#3c3c3c';
    ctx.font = 'italic 25px "Instrument Serif", Georgia, serif';
    ctx.fillText(data.subtitle || '', canvas.width / 2, 94);

    // 3. Draw Badges/Tags at the bottom
    if (data.badges && data.badges.length > 0) {
      const badgeFontSize = 21;
      ctx.font = `bold ${badgeFontSize}px "Instrument Serif", Georgia, serif`;

      const spacing = 12;
      const paddingX = 14;
      const paddingY = 6;
      let totalWidth = 0;
      const badgeWidths = [];

      data.badges.forEach((badge) => {
        const textWidth = ctx.measureText(badge).width;
        const w = textWidth + paddingX * 2;
        badgeWidths.push(w);
        totalWidth += w;
      });
      totalWidth += spacing * (data.badges.length - 1);

      let currentX = (canvas.width - totalWidth) / 2;
      const badgeY = 158;

      data.badges.forEach((badge, idx) => {
        const w = badgeWidths[idx];
        const h = badgeFontSize + paddingY * 2;

        // Draw badge background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.beginPath();
        const r = 8;
        ctx.moveTo(currentX + r, badgeY);
        ctx.lineTo(currentX + w - r, badgeY);
        ctx.quadraticCurveTo(currentX + w, badgeY, currentX + w, badgeY + r);
        ctx.lineTo(currentX + w, badgeY + h - r);
        ctx.quadraticCurveTo(currentX + w, badgeY + h, currentX + w - r, badgeY + h);
        ctx.lineTo(currentX + r, badgeY + h);
        ctx.quadraticCurveTo(currentX, badgeY + h, currentX, badgeY + h - r);
        ctx.lineTo(currentX, badgeY + r);
        ctx.quadraticCurveTo(currentX, badgeY, currentX + r, badgeY);
        ctx.closePath();
        ctx.fill();

        // Draw badge text
        ctx.fillStyle = '#222222';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge, currentX + w / 2, badgeY + h / 2);

        currentX += w + spacing;
      });
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  material.userData.originalOpacity = 0.85;

  const geometry = new THREE.PlaneGeometry(2.0, 1.0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'textbox';

  return mesh;
}

function updateVehicleTextbox(group, params) {
  if (!group) return;
  const textbox = group.getObjectByName('textbox');
  if (!textbox) return;

  textbox.position.set(params.textboxOffsetX, params.textboxOffsetY, params.textboxOffsetZ);
  textbox.rotation.set(params.textboxRotX, params.textboxRotY, params.textboxRotZ);

  const s = (1.0 / Math.max(params.scale, 0.0001)) * params.textboxScale;
  textbox.scale.set(s, s, s);
}

function addTextboxGUI(folder, params, updateFn, minOffset = -10.0, maxOffset = 10.0) {
  const tbFolder = folder.addFolder('Textbox');
  tbFolder.add(params, 'textboxScale', 0.1, 5.0).step(0.01).name('Scale').onChange(updateFn);
  tbFolder.add(params, 'textboxOffsetX', minOffset, maxOffset).step(0.05).name('Offset X').onChange(updateFn);
  tbFolder.add(params, 'textboxOffsetY', minOffset, maxOffset).step(0.05).name('Offset Y').onChange(updateFn);
  tbFolder.add(params, 'textboxOffsetZ', minOffset, maxOffset).step(0.05).name('Offset Z').onChange(updateFn);
  tbFolder.add(params, 'textboxRotX', -Math.PI, Math.PI).step(0.01).name('Rot X').onChange(updateFn);
  tbFolder.add(params, 'textboxRotY', -Math.PI, Math.PI).step(0.01).name('Rot Y').onChange(updateFn);
  tbFolder.add(params, 'textboxRotZ', -Math.PI, Math.PI).step(0.01).name('Rot Z').onChange(updateFn);
}

// --- 3D Cylinder Nav Labels ---
const navLabelConfig = [
  { key: 'home', label: 'Resume', scene: 'City', angle: 1.73, color: '#f7c5c0', vehicleIdx: 0 },
  { key: 'school', label: 'School', scene: 'School', angle: 0.74, color: '#c7b8ea', vehicleIdx: 1 },
  { key: 'skills', label: 'Skills', scene: 'Landscape', angle: -0.06, color: '#fce8a3', vehicleIdx: 2 },
  { key: 'experience', label: 'Experience', scene: 'Beach', angle: -0.95, color: '#b8e6c8', vehicleIdx: 3 },
  { key: 'projects', label: 'Projects', scene: 'Desert', angle: -1.86, color: '#ffd8b1', vehicleIdx: 4 },
  { key: 'hobbies', label: 'Hobbies', scene: 'Cafe', angle: 3.1, color: '#a8d8ea', vehicleIdx: 5 },
];

// --- Nav Label GUI params (Projects label only) ---
const navLabelParams = {
  homeZOffset: 4.015,
  homeAngle: 1.73,
  schoolZOffset: 4.015,
  schoolAngle: 0.74,
  skillsZOffset: 4.015,
  skillsAngle: -0.1,
  experienceZOffset: 4.015,
  experienceAngle: -1.00,
  projectsZOffset: 4.03,
  projectsAngle: -2.1,
  hobbiesZOffset: 4.015,
  hobbiesAngle: 2.87
};

let navLabels = [];        // Array of { mesh, config, baseAngle, targetOpacity, targetScale }
let activeNavIndex = 0;    // Currently highlighted label index
let navLabelsVisible = false;
let hoverTimeoutTimer = 0; // Timer to automatically reset 3D sector highlighting and scene protrusion

// Pre-allocated vectors for nav label orientation math
const _navUp = new THREE.Vector3(0, 0, 1);
const _navOutward = new THREE.Vector3();
const _navTangent = new THREE.Vector3();
const _navRotMatrix = new THREE.Matrix4();

function createRingSectorGeometry(innerR, outerR, thetaLength, segments = 32) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const uvs = [];
  const indices = [];

  const halfTheta = thetaLength / 2;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = halfTheta * (1 - 2 * t); // Goes from +halfTheta to -halfTheta

    // Inner vertex
    const xInner = innerR * Math.cos(angle);
    const yInner = innerR * Math.sin(angle);
    vertices.push(xInner, yInner, 0);
    uvs.push(t, 0); // U = t, V = 0

    // Outer vertex
    const xOuter = outerR * Math.cos(angle);
    const yOuter = outerR * Math.sin(angle);
    vertices.push(xOuter, yOuter, 0);
    uvs.push(t, 1); // U = t, V = 1
  }

  for (let i = 0; i < segments; i++) {
    // Triangle 1: [2i, 2i+3, 2i+1]
    indices.push(2 * i, 2 * i + 3, 2 * i + 1);
    // Triangle 2: [2i, 2i+2, 2i+3]
    indices.push(2 * i, 2 * i + 2, 2 * i + 3);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function createNavLabel(text, pastelHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Parse pastel hex
  const r = parseInt(pastelHex.slice(1, 3), 16);
  const g = parseInt(pastelHex.slice(3, 5), 16);
  const b = parseInt(pastelHex.slice(5, 7), 16);

  // Fill canvas with translucent pastel background
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Thin border on canvas edges using darker, more opaque version
  ctx.strokeStyle = `rgba(${Math.round(r * 0.75)}, ${Math.round(g * 0.75)}, ${Math.round(b * 0.75)}, 0.9)`;
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Draw text in Instrumental Serif
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthTest: true
  });

  const innerR = cylinderParams.radius * cylinderParams.wallRatio;
  const outerR = cylinderParams.radius;
  
  // Use thetaLength = 0.8 radians
  const geometry = createRingSectorGeometry(innerR, outerR, 0.8, 32);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 999;

  return mesh;
}

function updateNavLabelCanvas(entry, isHovered) {
  const mesh = entry.mesh;
  if (!mesh || !mesh.material || !mesh.material.map) return;

  const canvas = mesh.material.map.image;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pastelHex = entry.config.color;
  const r = parseInt(pastelHex.slice(1, 3), 16);
  const g = parseInt(pastelHex.slice(3, 5), 16);
  const b = parseInt(pastelHex.slice(5, 7), 16);

  if (isHovered) {
    // Blend with white to make it lighter/brighter, and increase opacity to 0.95
    const rLight = Math.round(r + (255 - r) * 0.5);
    const gLight = Math.round(g + (255 - g) * 0.5);
    const bLight = Math.round(b + (255 - b) * 0.5);
    ctx.fillStyle = `rgba(${rLight}, ${gLight}, ${bLight}, 0.95)`;
  } else {
    // Original background
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Thin border using darker, more opaque version
  ctx.strokeStyle = `rgba(${Math.round(r * 0.75)}, ${Math.round(g * 0.75)}, ${Math.round(b * 0.75)}, 0.9)`;
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Draw text in Instrumental Serif
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.config.label, canvas.width / 2, canvas.height / 2);

  // Mark texture for GPU upload update
  mesh.material.map.needsUpdate = true;
}

function updateNavLabelPositions() {
  navLabels.forEach((entry) => {
    const key = entry.config.key;
    const zProp = key + 'ZOffset';
    const aProp = key + 'Angle';
    if (navLabelParams[zProp] !== undefined) {
      entry.mesh.position.set(0, 0, navLabelParams[zProp]);
      entry.mesh.rotation.set(0, 0, navLabelParams[aProp]);
    } else {
      entry.mesh.position.set(0, 0, 4.015);
      entry.mesh.rotation.set(0, 0, entry.baseAngle);
    }
  });
}

function initNavLabels() {
  // Remove any existing labels
  navLabels.forEach(({ mesh }) => scene.remove(mesh));
  navLabels = [];

  navLabelConfig.forEach((config) => {
    const mesh = createNavLabel(config.label, config.color);
    mesh.visible = false;
    scene.add(mesh);
    navLabels.push({
      mesh,
      config,
      baseAngle: config.angle,
      targetOpacity: 0.0,
      targetScale: 1.0
    });
  });

  updateNavLabelPositions();
  window.labelsInitialized = true;
}

function highlightNavLabel(activeIdx) {
  navLabels.forEach((entry, idx) => {
    const isCurrent = (idx === activeIdx);
    if (isCurrent) {
      entry.targetOpacity = 1.0;
      entry.targetScale = 1.25;
      if (hoverScenes[entry.config.scene]) {
        hoverScenes[entry.config.scene].target = 1.0;
      }
    } else {
      entry.targetOpacity = 0.75;
      entry.targetScale = 1.0;
      if (hoverScenes[entry.config.scene]) {
        hoverScenes[entry.config.scene].target = 0.0;
      }
    }
  });
}

// --- Nav Labels GUI (All labels) ---
const navLabelFolder = gui.addFolder('Nav Labels');
navLabelFolder.add(navLabelParams, 'homeZOffset', -10.0, 10.0).step(0.01).name('Home Z Offset').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'homeAngle', -Math.PI, Math.PI).step(0.01).name('Home Angle').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'schoolZOffset', -10.0, 10.0).step(0.01).name('School Z Offset').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'schoolAngle', -Math.PI, Math.PI).step(0.01).name('School Angle').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'skillsZOffset', -10.0, 10.0).step(0.01).name('Skills Z Offset').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'skillsAngle', -Math.PI, Math.PI).step(0.01).name('Skills Angle').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'experienceZOffset', -10.0, 10.0).step(0.01).name('Experience Z Offset').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'experienceAngle', -Math.PI, Math.PI).step(0.01).name('Experience Angle').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'projectsZOffset', -10.0, 10.0).step(0.01).name('Projects Z Offset').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'projectsAngle', -Math.PI, Math.PI).step(0.01).name('Projects Angle').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'hobbiesZOffset', -10.0, 10.0).step(0.01).name('Hobbies Z Offset').onChange(updateNavLabelPositions);
navLabelFolder.add(navLabelParams, 'hobbiesAngle', -Math.PI, Math.PI).step(0.01).name('Hobbies Angle').onChange(updateNavLabelPositions);
navLabelFolder.open();

// --- Boat raycasting state ---
let boatObject = null;
let boatRadialOffset = null;
const _boatRaycaster = new THREE.Raycaster();

const boatParams = {
  distance: 2.75,      // distance offset
  height: 3.0,      // height offset along Z axis
  angle: -0.94,        // base angle (aligns with beach)
  orbitDegrees: 20,    // orbit rotation
  scale: 1.5,         // scale
  rotX: -Math.PI / 2.0,          // rotation X
  rotY: 2.9,          // rotation Y
  rotZ: 1.55,         // rotation Z
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.333,
  textboxOffsetZ: 0.0,
  textboxRotX: Math.PI / 2.0,
  textboxRotY: -Math.PI / 2.0,
  textboxRotZ: 0.0
};

function runBoatRaycast(angle, skipUpdateMatrix = false) {
  let posRadius = boatParams.distance;
  const posZ = boatParams.height;
  let localHitNormal = null;

  try {
    if (beachGroundMeshes.length > 0) {
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      // Cast from outside using the parameterized distance offset
      const rayOrigin = radialDir.clone().multiplyScalar(boatParams.distance + 5.0);
      rayOrigin.z = posZ;
      const rayDir = radialDir.clone().negate();

      _boatRaycaster.set(rayOrigin, rayDir);
      _boatRaycaster.far = 10.0;
      _boatRaycaster.near = 0;

      const hits = _boatRaycaster.intersectObjects(beachGroundMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const mesh = hit.object;
        const face = hit.face;

        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        posRadius = hitRadius + (boatParams.distance - 3.8);

        if (mesh && face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
          localHitNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
      }
    }
  } catch (err) {
    console.warn("Error in runBoatRaycast:", err);
  }

  const minRadius = cylinderParams.radius + 0.05;
  if (posRadius < minRadius) {
    posRadius = minRadius;
  }

  return { posRadius, localHitNormal: localHitNormal ? localHitNormal.clone() : null };
}

function updateBoat() {
  if (!boatObject) return;

  const orbitRad = THREE.MathUtils.degToRad(boatParams.orbitDegrees);
  const currentAngle = boatParams.angle + orbitRad;
  const posZ = boatParams.height;

  const snapped = getSnappedData(boatCache, runBoatRaycast, currentAngle);
  const posRadius = snapped.posRadius;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  boatObject.position.set(x, y, posZ);

  // Rotation: match the base alignment & orbit path orientation
  const BOAT_REF_ANGLE = -0.94;
  const totalAngularDelta = (boatParams.angle - BOAT_REF_ANGLE) + orbitRad;
  const baseEuler = new THREE.Euler(boatParams.rotX, boatParams.rotY, boatParams.rotZ);
  const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
  const orbitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalAngularDelta);

  let finalQuat = new THREE.Quaternion().copy(orbitQuat).multiply(baseQuat);

  boatObject.quaternion.copy(finalQuat);
  boatObject.scale.setScalar(boatParams.scale);

  updateVehicleTextbox(boatObject, boatParams);
}

// Caches are declared at the top of the file

// --- Hover Protrusion Animation System ---
const hoverScenes = {
  'City': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'School': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Landscape': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Beach': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Desert': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Cafe': { target: 0.0, current: 0.0, maxProtrusion: 0.8 }
};
const loadedEnvironments = {};

// Pre-allocated variables to prevent GC allocations during hover animation
const _tempQuat1 = new THREE.Quaternion();
const _tempQuat2 = new THREE.Quaternion();
const _tempEuler = new THREE.Euler();
const _tempAxisZ = new THREE.Vector3(0, 0, 1);
const _tempAxisX = new THREE.Vector3(1, 0, 0);

function loadModelWithGUI(name, url, defaults) {
  const params = { ...defaults };
  let obj = null;

  function update() {
    if (!obj) return;
    const hoverData = hoverScenes[name];
    const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;
    const activeDistance = params.distance + hoverOffset;
    const x = activeDistance * Math.cos(params.angle);
    const y = activeDistance * Math.sin(params.angle);
    obj.position.set(x, y, params.posZ);

    if (params.cylinderAlign) {
      // Auto-align to cylinder surface, then apply small user adjustments without dynamic allocations.
      _tempQuat1.setFromAxisAngle(_tempAxisZ, params.angle);
      _tempQuat2.setFromAxisAngle(_tempAxisX, Math.PI / 2);
      _tempQuat1.multiply(_tempQuat2);

      _tempEuler.set(params.rotX, params.rotY, params.rotZ);
      _tempQuat2.setFromEuler(_tempEuler);

      obj.quaternion.copy(_tempQuat1).multiply(_tempQuat2);
    } else {
      if (params.rotOrder) obj.rotation.order = params.rotOrder;
      obj.rotation.set(params.rotX, params.rotY, params.rotZ);
    }

    obj.scale.setScalar(params.scale);

    // Update world matrices for raycasting targets when positions shift
    obj.updateMatrixWorld(true);

    // Invalidate snapping caches when the background terrain moves
    if (name === 'City') {
      motorcycleCache.clear();
      motorcycleRadialOffset = null;
    } else if (name === 'Desert') {
      broncoCache.clear();
      broncoRadialOffset = null;
    } else if (name === 'Beach') {
      boatCache.clear();
      boatRadialOffset = null;
    } else if (name === 'Landscape') {
      car2Cache.clear();
      car2RadialOffset = null;
    } else if (name === 'Cafe') {
      racecarCache.clear();
    }
  }

  loader.load(url, (gltf) => {
    const model = gltf.scene;

    if (name === 'City') cityRoadMeshes.length = 0;
    else if (name === 'Beach') beachGroundMeshes.length = 0;
    else if (name === 'Desert') desertGroundMeshes.length = 0;
    else if (name === 'Landscape') landscapeMeshes.length = 0;
    else if (name === 'Cafe') cafeMeshes.length = 0;

    model.traverse((child) => {
      const nameUpper = child.name.toUpperCase();
      if ((nameUpper.startsWith('YACHT') || nameUpper.startsWith('BOAT')) && child.name !== 'Boat_Object') {
        child.visible = false;
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        child.scale.set(0, 0, 0);
      }
      prepareMesh(child);

      // Collect target meshes for optimized raycasting
      if (child.isMesh) {
        if (name === 'City') {
          const meshName = child.name || '';
          const isRoadMesh = meshName.includes('Curve') || meshName.includes('curve');
          let isRoadMaterial = false;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            isRoadMaterial = mats.some(mat => {
              const matName = (mat && mat.name) ? mat.name.toLowerCase() : '';
              return matName.includes('road') || matName.includes('ground') || matName.includes('asphalt');
            });
          }
          if (isRoadMesh || isRoadMaterial) {
            cityRoadMeshes.push(child);
          }
        } else if (name === 'Beach') {
          let isGroundSurface = false;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            isGroundSurface = mats.some(mat => {
              const matName = (mat && mat.name) ? mat.name.toLowerCase() : '';
              return matName.includes('sand') || matName.includes('beach') || matName.includes('water') || matName.includes('ground') || matName.includes('terrain');
            });
          }
          if (isGroundSurface) {
            beachGroundMeshes.push(child);
          }
        } else if (name === 'Desert') {
          let isGroundSurface = false;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            isGroundSurface = mats.some(mat => {
              const matName = (mat && mat.name) ? mat.name.toLowerCase() : '';
              return matName === 'desert' || matName === 'road';
            });
          }
          if (isGroundSurface) {
            desertGroundMeshes.push(child);
          }
        } else if (name === 'Landscape') {
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const isRoadOrGround = mats.some(mat => {
              const matName = mat && mat.name ? mat.name : '';
              return matName === 'Material.005' || matName === 'Material.013' || matName === 'Material.001' || matName === 'Material.015';
            });
            if (isRoadOrGround) {
              landscapeMeshes.push(child);
            }
          }
        } else if (name === 'Cafe') {
          cafeMeshes.push(child);
        }
      }
    });

    // No longer extracting motorcycle from City model here as it is loaded separately.

    obj = model;
    model.name = name;  // Tag the model so we can find it by name at runtime
    loadedEnvironments[name] = { params: params, getObject: () => obj, update: update };
    if (typeof introActive !== 'undefined' && introActive) {
      model.visible = false;
    }
    update();
    scene.add(model);
    loadedCount++;
    checkAllAssetsLoaded();

    const f = gui.addFolder(name);
    const distCtrl = f.add(params, 'distance', 0.5, cylinderParams.radius * 2).step(0.01).name('Distance').onChange(update);
    distanceControllers.push(distCtrl);
    f.add(params, 'angle', -Math.PI, Math.PI).step(0.01).name('Angle').onChange(update);
    f.add(params, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(update);
    f.add(params, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(update);
    f.add(params, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(update);
    f.add(params, 'posZ', -50, 50).step(0.01).name('Z Offset').onChange(update);
    f.add(params, 'scale', 0.01, 15.0).step(0.01).name('Scale').onChange(update);

    console.log(`${name} loaded — use GUI to align.`);
  }, undefined, (error) => {
    console.error(`${name} load failed:`, error);
  });
}

// --- Motorcycle raycasting state ---
let motorcycleRadialOffset = null;  // calibration offset, computed once
const _motoRaycaster = new THREE.Raycaster();
// --- Standalone Motorcycle state & parameters ---
let motorcycleGroup = null;
let motorcycleWheelBL = null;
let motorcycleWheelFL = null;

const motorcycleParams = {
  distance: 2.57,      // distance from cylinder axis
  angle: 1.9,         // starting angle (aligns with city road)
  height: 3.8,         // height along cylinder (Z-axis offset)
  orbitDegrees: 20,    // orbit rotation in degrees
  scale: 0.32,         // scale of the motorcycle
  rotX: Math.PI / 2.0,          // rotation X (tilt for cylinder alignment)
  rotY: -3.05,          // rotation Y
  rotZ: -1.2,         // rotation Z
  wheelSpeed: 0.5,     // wheel spin speed
  speed: 8,            // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.0,
  textboxOffsetZ: 0.0,
  textboxRotX: Math.PI / 2.0,
  textboxRotY: Math.PI / 2.0,
  textboxRotZ: 0.0
};

// --- Motorcycle GUI ---
const motoFolder = gui.addFolder('Motorcycle');
motoFolder.add(motorcycleParams, 'distance', 0.5, 10.0).step(0.01).name('DistanceOffset').onChange(() => {
  motorcycleRadialOffset = null;
  motorcycleCache.clear();
  updateMotorcycle();
});
motoFolder.add(motorcycleParams, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(() => {
  motorcycleCache.clear();
  updateMotorcycle();
});
motoFolder.add(motorcycleParams, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(() => {
  motorcycleRadialOffset = null;
  motorcycleCache.clear();
  updateMotorcycle();
});
motoFolder.add(motorcycleParams, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(() => {
  motorcycleRadialOffset = null;
  motorcycleCache.clear();
  updateMotorcycle();
});
motoFolder.add(motorcycleParams, 'scale', 0.01, 2.0).step(0.01).name('Scale').onChange(updateMotorcycle);
motoFolder.add(motorcycleParams, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateMotorcycle);
motoFolder.add(motorcycleParams, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateMotorcycle);
motoFolder.add(motorcycleParams, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateMotorcycle);
motoFolder.add(motorcycleParams, 'wheelSpeed', 0, 0.5).step(0.01).name('Wheel Speed');
motoFolder.add(motorcycleParams, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateMotorcycle);
addTextboxGUI(motoFolder, motorcycleParams, updateMotorcycle);
motoFolder.open();

// --- All models with GUI (Static Backgrounds) ---
loadModelWithGUI('City', new URL('../assets/models/city_at_night_v4_meshopt.glb', import.meta.url).href, {
  distance: 2.45, angle: 1.73, rotX: Math.PI / 2.0, rotY: 1.73, rotZ: -Math.PI / 2.0, posZ: 2.57, scale: 0.35
});

loadModelWithGUI('School', new URL('../assets/models/school_v2_meshopt.glb', import.meta.url).href, {
  distance: 2.55, angle: 0.74, rotX: Math.PI / 2.0, rotY: -2.45, rotZ: Math.PI / 2, posZ: 2.83, scale: 0.12
});

loadModelWithGUI('Landscape', new URL('../assets/models/landscape_v5_meshopt.glb', import.meta.url).href, {
  distance: 2.88, angle: -0.06, rotX: Math.PI / 2.0, rotY: Math.PI, rotZ: 0, posZ: 3.21, scale: 0.038, cylinderAlign: true
});

loadModelWithGUI('Beach', new URL('../assets/models/beach_v2_meshopt.glb', import.meta.url).href, {
  distance: 2.8, angle: -0.95, rotX: Math.PI / 2.0, rotY: 0.62, rotZ: -Math.PI / 2.0, posZ: 2.49, scale: 1.53
});

// loadModelWithGUI('Desert', new URL('../assets/models/desert_meshopt.glb', import.meta.url).href, {
//   distance: 3.05, angle: -1.86, rotX: 1.58, rotY: -0.48, rotZ: 1.58, posZ: 2.42, scale: 0.15
// });

loadModelWithGUI('Desert', new URL('../assets/models/desert_v3_meshopt.glb', import.meta.url).href, {
  distance: 2.89, angle: -1.86, rotX: Math.PI / 2.0, rotY: -0.35, rotZ: Math.PI / 2.0, posZ: 2.23, scale: 0.17
});

// loadModelWithGUI('Cafe', new URL('../assets/models/cafe_meshopt.glb', import.meta.url).href, {
//   distance: 2.45, angle: -3.1, rotX: 0, rotY: 0, rotZ: -0.11, posZ: 2.2, scale: 0.028
// });

loadModelWithGUI('Cafe', new URL('../assets/models/cafe_meshopt.glb', import.meta.url).href, {
  distance: 2.44, angle: 3.1, rotX: 0, rotY: 0, rotZ: -0.2, posZ: 2.11, scale: 0.0265
});


// --- Resize ---
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCanvasRect();
}

// --- Motorcycle update ---
function runMotorcycleRaycast(angle, skipUpdateMatrix = false) {
  let posRadius = motorcycleParams.distance;
  const posZ = motorcycleParams.height;

  try {
    if (cityRoadMeshes.length > 0) {
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const rayOrigin = radialDir.clone().multiplyScalar(motorcycleParams.distance + 3.0);
      rayOrigin.z = posZ;
      const rayDir = radialDir.clone().negate();

      _motoRaycaster.set(rayOrigin, rayDir);
      _motoRaycaster.far = 6.0;
      _motoRaycaster.near = 0;

      const hits = _motoRaycaster.intersectObjects(cityRoadMeshes, false);

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        if (motorcycleRadialOffset === null) {
          motorcycleRadialOffset = motorcycleParams.distance - hitRadius;
          console.log('Motorcycle radial offset calibrated:', motorcycleRadialOffset);
        }
        posRadius = hitRadius + motorcycleRadialOffset;
        break;
      }
    }
  } catch (err) {
    console.warn("Error in runMotorcycleRaycast:", err);
  }

  const minRadius = cylinderParams.radius + 0.05;
  if (posRadius < minRadius) {
    posRadius = minRadius;
  }

  return { posRadius, localHitNormal: null };
}

function updateMotorcycle() {
  if (!motorcycleGroup) return;

  // Orbit angle (in radians) is base angle + orbitDegrees
  const orbitRad = THREE.MathUtils.degToRad(motorcycleParams.orbitDegrees);
  const currentAngle = motorcycleParams.angle + orbitRad;
  const posZ = motorcycleParams.height;

  const snapped = getSnappedData(motorcycleCache, runMotorcycleRaycast, currentAngle);
  const posRadius = snapped.posRadius;

  // Apply final position
  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  motorcycleGroup.position.set(x, y, posZ);

  // Rotation: apply base euler rotation, then compose with orbit rotation around Z axis.
  // Use total angular delta from reference angle so the motorcycle stays parallel to the road.
  const MOTO_REF_ANGLE = 1.74; // angle at which rotX/rotY/rotZ were calibrated
  const totalAngularDelta = (motorcycleParams.angle - MOTO_REF_ANGLE) + orbitRad;
  const baseEuler = new THREE.Euler(motorcycleParams.rotX, motorcycleParams.rotY, motorcycleParams.rotZ);
  const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
  const orbitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalAngularDelta);

  motorcycleGroup.quaternion.copy(orbitQuat).multiply(baseQuat);
  motorcycleGroup.scale.setScalar(motorcycleParams.scale);

  // Spin wheels
  if (motorcycleWheelBL) motorcycleWheelBL.rotation.x += motorcycleParams.wheelSpeed * activeWheelSpeedFactor;
  if (motorcycleWheelFL) motorcycleWheelFL.rotation.x += motorcycleParams.wheelSpeed * activeWheelSpeedFactor;

  updateVehicleTextbox(motorcycleGroup, motorcycleParams);
}

// --- Load Standalone Motorcycle ---
rawLoader.load(new URL('../assets/models/motorcycle.glb', import.meta.url).href, (gltf) => {
  const model = gltf.scene;

  model.traverse((child) => {
    prepareMesh(child, true);
  });

  // Get wheel references
  motorcycleWheelBL = model.getObjectByName('wheel_BL');
  motorcycleWheelFL = model.getObjectByName('wheel_FL');

  // Center wheel pivots for proper spinning
  [motorcycleWheelBL, motorcycleWheelFL].forEach((wheel) => {
    if (wheel && wheel.geometry) {
      wheel.geometry = wheel.geometry.clone();
      wheel.geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      wheel.geometry.boundingBox.getCenter(center);
      wheel.geometry.translate(-center.x, -center.y, -center.z);
      wheel.position.add(center);
    }
  });

  motorcycleGroup = model;
  const textbox = createTextBox({
    title: "backend systems",
    subtitle: "scalable apis & databases",
    badges: ["Go", "Python", "gRPC", "SQL"]
  });
  model.add(textbox);
  if (typeof introActive !== 'undefined' && introActive) {
    model.visible = false;
  }
  updateMotorcycle();
  scene.add(model);
  loadedCount++;
  checkAllAssetsLoaded();
}, undefined, (error) => {
  console.error('Motorcycle load failed:', error);
});

// --- Airplane raycasting state ---
let airplaneRadialOffset = null;  // calibration offset, computed once
const _planeRaycaster = new THREE.Raycaster();
// --- Standalone Airplane state & parameters ---
let airplaneGroup = null;
let propellerObject = null;

const airplaneParams = {
  distance: 4.5,     // distance from cylinder axis
  angle: 0.74,         // starting angle (aligns with school)
  height: 2.8,         // height along cylinder (Z-axis offset)
  orbitDegrees: 20,    // orbit rotation in degrees
  scale: 0.01,         // scale of the airplane
  rotX: -Math.PI / 2.0,         // rotation X
  rotY: 2.4,           // rotation Y
  rotZ: Math.PI / 2.0,          // rotation Z
  propellerSpeed: 0.3,   // propeller spin speed
  speed: 8,            // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.5,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
  textboxRotZ: 0.0
};

// --- Airplane GUI ---
const planeFolder = gui.addFolder('Airplane');
planeFolder.add(airplaneParams, 'distance', 3.0, 8.0).step(0.001).name('DistanceOffset').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'scale', 0.01, 2.0).step(0.01).name('Scale').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'propellerSpeed', 0, 1.0).step(0.01).name('Propeller Speed');
planeFolder.add(airplaneParams, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateAirplane);
addTextboxGUI(planeFolder, airplaneParams, updateAirplane, -30.0, 30.0);
planeFolder.open();

// --- Airplane update ---
function updateAirplane() {
  if (!airplaneGroup) return;

  // Orbit angle (in radians) is base angle + orbitDegrees
  const orbitRad = THREE.MathUtils.degToRad(airplaneParams.orbitDegrees);
  const currentAngle = airplaneParams.angle + orbitRad;

  // Airplanes fly at a constant radial distance relative to the cylinder axis, so we don't snap to terrain.
  const posRadius = airplaneParams.distance;
  const posZ = airplaneParams.height;

  // Apply final position
  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  airplaneGroup.position.set(x, y, posZ);

  // Rotation: apply base euler rotation, then compose with orbit rotation around Z axis.
  // Use total angular delta from reference angle so the airplane stays properly oriented.
  const PLANE_REF_ANGLE = 0.74; // angle at which rotX/rotY/rotZ were calibrated
  const totalAngularDelta = (airplaneParams.angle - PLANE_REF_ANGLE) + orbitRad;
  const baseEuler = new THREE.Euler(airplaneParams.rotX, airplaneParams.rotY, airplaneParams.rotZ);
  const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
  const orbitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalAngularDelta);

  airplaneGroup.quaternion.copy(orbitQuat).multiply(baseQuat);
  airplaneGroup.scale.setScalar(airplaneParams.scale);

  // Spin propeller
  if (propellerObject) propellerObject.rotation.z += airplaneParams.propellerSpeed;

  updateVehicleTextbox(airplaneGroup, airplaneParams);
}

// --- Load Standalone Airplane ---
rawLoader.load(new URL('../assets/models/airplane.glb', import.meta.url).href, (gltf) => {
  const model = gltf.scene;

  model.traverse((child) => {
    // Find and set up propeller pivot
    if (child.name === 'propeller') {
      propellerObject = child;
      if (child.geometry) {
        child.geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        child.geometry.boundingBox.getCenter(center);
        // Translate vertices to (0,0,0) to center pivot
        child.geometry.translate(-center.x, -center.y, -center.z);
        // Adjust mesh position to compensate
        child.position.add(center);
      }
    }
    prepareMesh(child, true);
  });

  airplaneGroup = model;
  const textbox = createTextBox({
    title: "cloud & infrastructure",
    subtitle: "distributed systems & cloud deployments",
    badges: ["AWS", "Docker", "Kubernetes", "Linux"]
  });
  model.add(textbox);
  if (typeof introActive !== 'undefined' && introActive) {
    model.visible = false;
  }
  updateAirplane();
  scene.add(model);
  loadedCount++;
  checkAllAssetsLoaded();
}, undefined, (error) => {
  console.error('Airplane load failed:', error);
});

// --- Bronco raycasting state ---
let broncoRadialOffset = null;  // calibration offset, computed once
const _broncoRaycaster = new THREE.Raycaster();
// --- Standalone Bronco state & parameters ---
let broncoGroup = null;
let broncoWheelFL = null;
let broncoWheelFR = null;
let broncoWheelsFront = null;
let broncoWheelsRear = null;

const broncoParams = {
  distance: 3,      // distance from cylinder axis (start near desert)
  angle: -1.86,        // starting angle (aligns with desert)
  height: 3.42,        // height along cylinder (Z-axis offset)
  orbitDegrees: 15,     // orbit rotation in degrees
  scale: 0.15,         // scale of the bronco
  rotX: Math.PI / 2.0,          // rotation X (tilt for cylinder alignment)
  rotY: 1.2,         // rotation Y
  rotZ: Math.PI / 2.0,          // rotation Z
  wheelSpeed: 0.05,    // wheel spin speed
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.5,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: Math.PI,
  textboxRotZ: 0.0
};

// --- Bronco GUI ---
const broncoFolder = gui.addFolder('Bronco');
broncoFolder.add(broncoParams, 'distance', 1.0, 8.0).step(0.001).name('DistanceOffset').onChange(() => {
  broncoRadialOffset = null; // force recalibration at the new distance
  broncoCache.clear();
  updateBronco();
});
broncoFolder.add(broncoParams, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(() => {
  broncoCache.clear();
  updateBronco();
});
broncoFolder.add(broncoParams, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(() => {
  broncoRadialOffset = null;
  broncoCache.clear();
  updateBronco();
});
broncoFolder.add(broncoParams, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(() => {
  broncoRadialOffset = null; // force recalibration at the new orbit position
  broncoCache.clear();
  updateBronco();
});
broncoFolder.add(broncoParams, 'scale', 0.01, 2.0).step(0.01).name('Scale').onChange(updateBronco);
broncoFolder.add(broncoParams, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateBronco);
broncoFolder.add(broncoParams, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateBronco);
broncoFolder.add(broncoParams, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateBronco);
broncoFolder.add(broncoParams, 'wheelSpeed', 0, 0.5).step(0.01).name('Wheel Speed');
broncoFolder.add(broncoParams, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateBronco);
addTextboxGUI(broncoFolder, broncoParams, updateBronco);
broncoFolder.open();

// --- Bronco update ---
function runBroncoRaycast(angle, skipUpdateMatrix = false) {
  let posRadius = broncoParams.distance;
  const posZ = broncoParams.height;
  let localHitNormal = null;

  try {
    if (desertGroundMeshes.length > 0) {
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const rayOrigin = radialDir.clone().multiplyScalar(broncoParams.distance + 5.0);
      rayOrigin.z = posZ;
      const rayDir = radialDir.clone().negate();

      _broncoRaycaster.set(rayOrigin, rayDir);
      _broncoRaycaster.far = 10.0;
      _broncoRaycaster.near = 0;

      const hits = _broncoRaycaster.intersectObjects(desertGroundMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const mesh = hit.object;
        const face = hit.face;

        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        posRadius = hitRadius + (broncoParams.distance - 2.86);

        if (mesh && face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
          localHitNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
      }
    }
  } catch (err) {
    console.warn("Error in runBroncoRaycast:", err);
  }

  const minRadius = cylinderParams.radius + 0.05;
  if (posRadius < minRadius) {
    posRadius = minRadius;
  }

  return { posRadius, localHitNormal: localHitNormal ? localHitNormal.clone() : null };
}

function updateBronco() {
  if (!broncoGroup) return;

  // Orbit angle (in radians) is base angle + orbitDegrees
  const orbitRad = THREE.MathUtils.degToRad(broncoParams.orbitDegrees);
  const currentAngle = broncoParams.angle + orbitRad;
  const posZ = broncoParams.height;

  const snapped = getSnappedData(broncoCache, runBroncoRaycast, currentAngle);
  const posRadius = snapped.posRadius;
  const localHitNormal = snapped.localHitNormal;

  // Apply final position
  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  broncoGroup.position.set(x, y, posZ);

  // Rotation: apply base euler rotation, then compose with orbit rotation around Z axis.
  const BRONCO_REF_ANGLE = -1.86; // angle at which rotX/rotY/rotZ were calibrated
  const totalAngularDelta = (broncoParams.angle - BRONCO_REF_ANGLE) + orbitRad;
  const baseEuler = new THREE.Euler(broncoParams.rotX, broncoParams.rotY, broncoParams.rotZ);
  const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
  const orbitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalAngularDelta);

  let finalQuat = new THREE.Quaternion().copy(orbitQuat).multiply(baseQuat);

  if (localHitNormal) {
    // Calculate the radial direction representing the default 'up' direction of the cylinder
    const cylinderNormal = new THREE.Vector3(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();
    // Compute the correction rotation between the cylinder normal and the actual terrain normal
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(cylinderNormal, localHitNormal);
    // Apply correction to the orientation
    finalQuat.copy(alignQuat).multiply(orbitQuat).multiply(baseQuat);
  }

  broncoGroup.quaternion.copy(finalQuat);
  broncoGroup.scale.setScalar(broncoParams.scale);

  // Spin wheels
  if (broncoWheelFL) broncoWheelFL.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;
  if (broncoWheelFR) broncoWheelFR.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;
  if (broncoWheelsFront) broncoWheelsFront.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;
  if (broncoWheelsRear) broncoWheelsRear.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;

  updateVehicleTextbox(broncoGroup, broncoParams);
}

// --- Load Standalone Bronco ---
rawLoader.load(new URL('../assets/models/bronco.glb', import.meta.url).href, (gltf) => {
  const model = gltf.scene;

  model.traverse((child) => {
    prepareMesh(child, true);
  });

  // Get wheel references
  broncoWheelFL = model.getObjectByName('wheel_FL');
  broncoWheelFR = model.getObjectByName('wheel_FR');
  broncoWheelsFront = model.getObjectByName('wheels_front');
  broncoWheelsRear = model.getObjectByName('wheels_rear');

  // Center wheel pivots for proper spinning
  [broncoWheelFL, broncoWheelFR, broncoWheelsFront, broncoWheelsRear].forEach((wheel) => {
    if (wheel && wheel.geometry) {
      wheel.geometry = wheel.geometry.clone();
      wheel.geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      wheel.geometry.boundingBox.getCenter(center);
      wheel.geometry.translate(-center.x, -center.y, -center.z);
      wheel.position.add(center);
    }
  });

  broncoGroup = model;
  const textbox = createTextBox({
    title: "devops engineering",
    subtitle: "resilient infrastructures & ci/cd",
    badges: ["Terraform", "GitHub Actions", "Docker", "AWS"]
  });
  model.add(textbox);
  if (typeof introActive !== 'undefined' && introActive) {
    model.visible = false;
  }
  updateBronco();
  scene.add(model);
  loadedCount++;
  checkAllAssetsLoaded();
}, undefined, (error) => {
  console.error('Bronco load failed:', error);
});

// --- Load Standalone Boat ---
rawLoader.load(new URL('../assets/models/boat.glb', import.meta.url).href, (gltf) => {
  const model = gltf.scene;

  // Compute bounding box of the whole model to find the center offset
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Offset children so that the model centers around (0,0,0) locally
  model.traverse((child) => {
    prepareMesh(child, true);
    if (child.isMesh && child.geometry) {
      child.geometry = child.geometry.clone();
      child.geometry.computeBoundingBox();
      // Translate the geometry vertices relative to the model's overall center
      child.geometry.translate(-center.x, -center.y, -center.z);
    }
  });

  boatObject = model;
  const textbox = createTextBox({
    title: "data pipelines",
    subtitle: "real-time streaming & analytics",
    badges: ["Kafka", "Flink", "PostgreSQL", "Python"]
  });
  model.add(textbox);
  if (typeof introActive !== 'undefined' && introActive) {
    model.visible = false;
  }
  updateBoat();
  scene.add(model);
  loadedCount++;
  checkAllAssetsLoaded();

  // Setup Boat GUI
  const boatFolder = gui.addFolder('Boat');
  boatFolder.add(boatParams, 'distance', 1.0, 8.0).step(0.001).name('DistanceOffset').onChange(() => {
    boatRadialOffset = null;
    boatCache.clear();
    updateBoat();
  });
  boatFolder.add(boatParams, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(() => {
    boatCache.clear();
    updateBoat();
  });
  boatFolder.add(boatParams, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(() => {
    boatRadialOffset = null;
    boatCache.clear();
    updateBoat();
  });
  boatFolder.add(boatParams, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(() => {
    boatRadialOffset = null;
    boatCache.clear();
    updateBoat();
  });
  boatFolder.add(boatParams, 'scale', 0.01, 5.0).step(0.01).name('Scale').onChange(updateBoat);
  boatFolder.add(boatParams, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateBoat);
  boatFolder.add(boatParams, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateBoat);
  boatFolder.add(boatParams, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateBoat);
  boatFolder.add(boatParams, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateBoat);
  addTextboxGUI(boatFolder, boatParams, updateBoat);
  boatFolder.open();
}, undefined, (error) => {
  console.error('Boat load failed:', error);
});

// --- Car V2 raycasting state ---
let car2Object = null;
let car2RadialOffset = null;
let car2WheelFL = null;
let car2WheelFR = null;
let car2WheelBL = null;
let car2WheelBR = null;
const _car2Raycaster = new THREE.Raycaster();

const car2Params = {
  distance: 2.725,      // distance offset
  height: 3.2,      // height offset along Z axis
  angle: -0.2,        // base angle (aligns with city road)
  orbitDegrees: 22,    // orbit rotation
  scale: 0.15,         // scale
  rotX: -Math.PI / 2.0,          // rotation X
  rotY: -3.0,          // rotation Y
  rotZ: Math.PI / 2.0,          // rotation Z
  wheelSpeed: 0.05,     // wheel speed
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.5,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
  textboxRotZ: 0.0
};

function runCar2Raycast(angle, skipUpdateMatrix = false) {
  let posRadius = car2Params.distance;
  const posZ = car2Params.height;
  let localHitNormal = null;

  try {
    if (landscapeMeshes.length > 0) {
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const rayOrigin = radialDir.clone().multiplyScalar(10.0);
      rayOrigin.z = posZ;
      const rayDir = radialDir.clone().negate();

      _car2Raycaster.set(rayOrigin, rayDir);
      _car2Raycaster.far = 15.0;
      _car2Raycaster.near = 0;

      const hits = _car2Raycaster.intersectObjects(landscapeMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const mesh = hit.object;
        const face = hit.face;

        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        posRadius = hitRadius + (car2Params.distance - cylinderParams.radius);

        if (mesh && face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
          localHitNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
      }
    }
  } catch (err) {
    console.warn("Error in runCar2Raycast:", err);
  }

  return { posRadius, localHitNormal: localHitNormal ? localHitNormal.clone() : null };
}

function updateCar2() {
  if (!car2Object) return;

  const orbitRad = THREE.MathUtils.degToRad(car2Params.orbitDegrees);
  const currentAngle = car2Params.angle + orbitRad;
  const posZ = car2Params.height;

  const snapped = getSnappedData(car2Cache, runCar2Raycast, currentAngle);
  const posRadius = snapped.posRadius;
  const localHitNormal = snapped.localHitNormal;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  car2Object.position.set(x, y, posZ);

  // Rotation: apply base euler rotation, then compose with orbit rotation around Z axis.
  const CAR2_REF_ANGLE = -0.12; // reference angle where rotX/rotY/rotZ were calibrated
  const totalAngularDelta = (car2Params.angle - CAR2_REF_ANGLE) + orbitRad;
  const baseEuler = new THREE.Euler(car2Params.rotX, car2Params.rotY, car2Params.rotZ);
  const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
  const orbitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalAngularDelta);

  let finalQuat = new THREE.Quaternion().copy(orbitQuat).multiply(baseQuat);

  if (localHitNormal) {
    const cylinderNormal = new THREE.Vector3(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(cylinderNormal, localHitNormal);

    // Calculate the road path tangent vector in world space
    const pathTangent = new THREE.Vector3(-Math.sin(currentAngle), Math.cos(currentAngle), 0).normalize();
    // Rotate path tangent by the raw alignment quaternion
    const tempTangent = pathTangent.clone().applyQuaternion(alignQuat);
    // Project the path tangent onto the surface normal plane
    const targetTangent = pathTangent.clone().projectOnPlane(localHitNormal).normalize();
    // Calculate the correction rotation around the normal to align the heading
    const correctionQuat = new THREE.Quaternion().setFromUnitVectors(tempTangent, targetTangent);

    const alignQuatCorrected = new THREE.Quaternion().multiplyQuaternions(correctionQuat, alignQuat);
    finalQuat.copy(alignQuatCorrected).multiply(orbitQuat).multiply(baseQuat);
  }

  car2Object.quaternion.copy(finalQuat);
  car2Object.scale.setScalar(car2Params.scale);

  // Spin wheels
  if (car2WheelFL) car2WheelFL.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;
  if (car2WheelFR) car2WheelFR.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;
  if (car2WheelBL) car2WheelBL.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;
  if (car2WheelBR) car2WheelBR.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;

  updateVehicleTextbox(car2Object, car2Params);
}

// --- Racecar state ---
let racecarObject = null;
let racecarWheelFL = null;
let racecarWheelFR = null;
let racecarWheelBL = null;
let racecarWheelBR = null;

const racecarParams = {
  distance: 2.51,      // distance offset (aligned near nascar track)
  height: 3.7,      // height offset along Z axis
  angle: -3.05,        // base angle (aligns with nascar_racetrack)
  orbitDegrees: 8,    // orbit rotation
  scale: 15.0,        // scale
  rotX: -Math.PI / 2.0,          // rotation X
  rotY: -0.03,        // rotation Y
  rotZ: Math.PI / 2.0,         // rotation Z
  wheelSpeed: 0.1,     // wheel spin speed
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.03,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
  textboxRotZ: 0.0
};

function runRacecarRaycast(angle, skipUpdateMatrix = false) {
  let posRadius = racecarParams.distance;
  const pathZ = racecarParams.height;
  let localHitNormal = null;

  try {
    if (cafeMeshes.length > 0) {
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const rayOrigin = radialDir.clone().multiplyScalar(10.0);
      rayOrigin.z = pathZ;
      const rayDir = radialDir.clone().negate();

      const _rc = new THREE.Raycaster();
      _rc.set(rayOrigin, rayDir);
      _rc.far = 15.0;
      _rc.near = 0;

      const hits = _rc.intersectObjects(cafeMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const mesh = hit.object;
        const face = hit.face;

        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        posRadius = hitRadius + (racecarParams.distance - cylinderParams.radius);

        if (mesh && face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
          localHitNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
      }
    }
  } catch (err) {
    console.warn("Error in runRacecarRaycast:", err);
  }

  return { posRadius, localHitNormal: localHitNormal ? localHitNormal.clone() : null };
}

function updateRacecar() {
  if (!racecarObject) return;

  const orbitRad = THREE.MathUtils.degToRad(racecarParams.orbitDegrees);
  const currentAngle = racecarParams.angle + orbitRad;
  const pathZ = racecarParams.height;

  const snapped = getSnappedData(racecarCache, runRacecarRaycast, currentAngle);
  const posRadius = snapped.posRadius;
  const localHitNormal = snapped.localHitNormal;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  racecarObject.position.set(x, y, pathZ);

  // Rotation: apply base euler rotation, then compose with orbit rotation around Z axis.
  const RACECAR_REF_ANGLE = -3.05; // reference angle where rotX/rotY/rotZ were calibrated
  const totalAngularDelta = (racecarParams.angle - RACECAR_REF_ANGLE) + orbitRad;

  const baseEuler = new THREE.Euler(racecarParams.rotX, racecarParams.rotY, racecarParams.rotZ);
  const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
  const orbitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalAngularDelta);

  let finalQuat = new THREE.Quaternion().copy(orbitQuat).multiply(baseQuat);

  // Align car to actual road surface normal (same technique as Bronco on desert)
  const cylinderNormal = new THREE.Vector3(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();

  if (localHitNormal) {
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(cylinderNormal, localHitNormal);

    // Calculate the road path tangent vector in world space
    const pathTangent = new THREE.Vector3(-Math.sin(currentAngle), Math.cos(currentAngle), 0).normalize();
    // Rotate path tangent by the raw alignment quaternion
    const tempTangent = pathTangent.clone().applyQuaternion(alignQuat);
    // Project the path tangent onto the surface normal plane
    const targetTangent = pathTangent.clone().projectOnPlane(localHitNormal).normalize();
    // Calculate the correction rotation around the normal to align the heading
    const correctionQuat = new THREE.Quaternion().setFromUnitVectors(tempTangent, targetTangent);

    const alignQuatCorrected = new THREE.Quaternion().multiplyQuaternions(correctionQuat, alignQuat);
    finalQuat.copy(alignQuatCorrected).multiply(orbitQuat).multiply(baseQuat);
  }

  racecarObject.quaternion.copy(finalQuat);
  racecarObject.scale.setScalar(racecarParams.scale);

  // Spin wheels (Mercedes wheels rotate on the X-axis)
  if (racecarWheelFL) racecarWheelFL.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;
  if (racecarWheelFR) racecarWheelFR.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;
  if (racecarWheelBL) racecarWheelBL.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;
  if (racecarWheelBR) racecarWheelBR.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;

  updateVehicleTextbox(racecarObject, racecarParams);
}

// --- Load Standalone Racecar ---
rawLoader.load(new URL('../assets/models/sls_amg_63_black_series.glb', import.meta.url).href, (gltf) => {
  const model = gltf.scene;

  // Center model pivot
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);

  model.traverse((child) => {
    prepareMesh(child, true);
    if (child.isMesh && child.geometry) {
      child.geometry = child.geometry.clone();
      child.geometry.computeBoundingBox();
      child.geometry.translate(-center.x, -center.y, -center.z);
    }
  });

  // Get wheel references
  racecarWheelFL = model.getObjectByName('wheel_FL');
  racecarWheelFR = model.getObjectByName('wheel_FR');
  racecarWheelBL = model.getObjectByName('wheel_BL');
  racecarWheelBR = model.getObjectByName('wheel_BR');

  // Center wheel pivots so they spin cleanly in place
  [racecarWheelFL, racecarWheelFR, racecarWheelBL, racecarWheelBR].forEach((wheel) => {
    if (wheel && wheel.geometry) {
      wheel.geometry = wheel.geometry.clone();
      wheel.geometry.computeBoundingBox();
      const wheelCenter = new THREE.Vector3();
      wheel.geometry.boundingBox.getCenter(wheelCenter);
      wheel.geometry.translate(-wheelCenter.x, -wheelCenter.y, -wheelCenter.z);
      wheel.position.add(wheelCenter);
    }
  });

  racecarObject = model;
  const textbox = createTextBox({
    title: "systems optimization",
    subtitle: "low-latency and performance profiling",
    badges: ["C++", "WebAssembly", "Rust", "Go"]
  });
  model.add(textbox);
  if (typeof introActive !== 'undefined' && introActive) {
    model.visible = false;
  }
  updateRacecar();
  scene.add(model);
  loadedCount++;
  checkAllAssetsLoaded();

  // Setup Racecar GUI
  const racecarFolder = gui.addFolder('Racecar');
  racecarFolder.add(racecarParams, 'distance', 1.0, 8.0).step(0.001).name('DistanceOffset').onChange(() => {
    racecarCache.clear();
    updateRacecar();
  });
  racecarFolder.add(racecarParams, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(() => {
    racecarCache.clear();
    updateRacecar();
  });
  racecarFolder.add(racecarParams, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(() => {
    racecarCache.clear();
    updateRacecar();
  });
  racecarFolder.add(racecarParams, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(() => {
    racecarCache.clear();
    updateRacecar();
  });
  racecarFolder.add(racecarParams, 'scale', 0.001, 15.0).step(0.001).name('Scale').onChange(updateRacecar);
  racecarFolder.add(racecarParams, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateRacecar);
  racecarFolder.add(racecarParams, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateRacecar);
  racecarFolder.add(racecarParams, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateRacecar);
  racecarFolder.add(racecarParams, 'wheelSpeed', 0, 0.5).step(0.01).name('Wheel Speed');
  racecarFolder.add(racecarParams, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateRacecar);
  addTextboxGUI(racecarFolder, racecarParams, updateRacecar);
  racecarFolder.open();
}, undefined, (error) => {
  console.error('Racecar load failed:', error);
});

// --- Load Standalone Car V2 ---
rawLoader.load(new URL('../assets/models/car_v2.glb', import.meta.url).href, (gltf) => {
  const model = gltf.scene;

  model.traverse((child) => {
    prepareMesh(child, true);
  });

  // Get wheel references
  car2WheelFL = model.getObjectByName('wheel_FL');
  car2WheelFR = model.getObjectByName('wheel_FR');
  car2WheelBL = model.getObjectByName('wheel_BL');
  car2WheelBR = model.getObjectByName('wheel_BR');

  // Center wheel pivots so they spin cleanly in place (same technique as motorcycle)
  [car2WheelFL, car2WheelFR, car2WheelBL, car2WheelBR].forEach((wheel) => {
    if (wheel && wheel.geometry) {
      wheel.geometry = wheel.geometry.clone();
      wheel.geometry.computeBoundingBox();
      const wheelCenter = new THREE.Vector3();
      wheel.geometry.boundingBox.getCenter(wheelCenter);
      wheel.geometry.translate(-wheelCenter.x, -wheelCenter.y, -wheelCenter.z);
      wheel.position.add(wheelCenter);
    }
  });

  car2Object = model;
  const textbox = createTextBox({
    title: "full stack development",
    subtitle: "crafting high-performance web apps",
    badges: ["React", "Three.js", "Vite", "CSS"]
  });
  model.add(textbox);
  if (typeof introActive !== 'undefined' && introActive) {
    model.visible = false;
  }
  updateCar2();
  scene.add(model);
  loadedCount++;
  checkAllAssetsLoaded();

  // Setup Car V2 GUI
  const car2Folder = gui.addFolder('Car V2');
  car2Folder.add(car2Params, 'distance', 1.0, 8.0).step(0.001).name('DistanceOffset').onChange(() => {
    car2RadialOffset = null;
    car2Cache.clear();
    updateCar2();
  });
  car2Folder.add(car2Params, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(() => {
    car2Cache.clear();
    updateCar2();
  });
  car2Folder.add(car2Params, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(() => {
    car2RadialOffset = null;
    car2Cache.clear();
    updateCar2();
  });
  car2Folder.add(car2Params, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(() => {
    car2RadialOffset = null;
    car2Cache.clear();
    updateCar2();
  });
  car2Folder.add(car2Params, 'scale', 0.001, 5.0).step(0.001).name('Scale').onChange(updateCar2);
  car2Folder.add(car2Params, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateCar2);
  car2Folder.add(car2Params, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateCar2);
  car2Folder.add(car2Params, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateCar2);
  car2Folder.add(car2Params, 'wheelSpeed', 0, 0.5).step(0.01).name('Wheel Speed');
  car2Folder.add(car2Params, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateCar2);
  addTextboxGUI(car2Folder, car2Params, updateCar2);
  car2Folder.open();
}, undefined, (error) => {
  console.error('Car V2 load failed:', error);
});

// --- Global Orbit Animation Sequence ---
// camOffset: X = radial outward from cylinder, Y = up along Z axis, Z = ahead of vehicle (along its facing direction)
// lookOffset: same coordinate frame, relative to vehicle position
const orbitSequence = [
  { name: 'Motorcycle', update: updateMotorcycle, params: motorcycleParams, start: 20, end: -30, getObject: () => motorcycleGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: 1.74 },
  { name: 'Airplane', update: updateAirplane, params: airplaneParams, start: 20, end: -15, getObject: () => airplaneGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: 0.74 },
  { name: 'Car V2', update: updateCar2, params: car2Params, start: 22, end: -12, getObject: () => car2Object, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -0.12 },
  { name: 'Boat', update: updateBoat, params: boatParams, start: 20, end: -23, getObject: () => boatObject, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -0.94 },
  { name: 'Bronco', update: updateBronco, params: broncoParams, start: 15, end: -40, getObject: () => broncoGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -1.86 },
  { name: 'Racecar', update: updateRacecar, params: racecarParams, start: 8, end: -40, getObject: () => racecarObject, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -3.05 }
];

let currentSeqIndex = 0;
let orbitDegreesPerSecond = 5; // Animation speed (degrees per second)
let lastTime = performance.now();
let isOrbitAnimating = true;

// --- Camera Follow State ---
let cameraFollowEnabled = true;
const defaultCamPos = new THREE.Vector3(7.5, 0.8, 1.2);
const defaultCamTarget = new THREE.Vector3(0, 0, 0);

// Transition state
let isTransitioning = false;
let transitionProgress = 0;
const transitionDuration = 1.2; // seconds for the smooth camera transition
let transitionStartPos = new THREE.Vector3();
let transitionEndPos = new THREE.Vector3();
let transitionStartTarget = new THREE.Vector3();
let transitionEndTarget = new THREE.Vector3();
let transitionStartUp = new THREE.Vector3();

// Current camera tracking targets (smoothed)
let currentCamPos = new THREE.Vector3().copy(defaultCamPos);
let currentCamTarget = new THREE.Vector3().copy(defaultCamTarget);

// --- Camera Follow GUI ---
const camGuiState = {
  camOffsetX: 0, camOffsetY: 0, camOffsetZ: 0,
  lookOffsetX: 0, lookOffsetY: 0, lookOffsetZ: 0,
  activeVehicle: 'Airplane'
};

function syncCamGuiFromSequence() {
  const seq = orbitSequence[currentSeqIndex];
  if (!seq) return;
  camGuiState.camOffsetX = seq.camOffset.x;
  camGuiState.camOffsetY = seq.camOffset.y;
  camGuiState.camOffsetZ = seq.camOffset.z;
  camGuiState.lookOffsetX = seq.lookOffset.x;
  camGuiState.lookOffsetY = seq.lookOffset.y;
  camGuiState.lookOffsetZ = seq.lookOffset.z;
  camGuiState.activeVehicle = seq.name;
  camGuiState.velocity = seq.params.speed;
}

function applyCamGuiToSequence() {
  const seq = orbitSequence[currentSeqIndex];
  if (!seq) return;
  seq.camOffset.set(camGuiState.camOffsetX, camGuiState.camOffsetY, camGuiState.camOffsetZ);
  seq.lookOffset.set(camGuiState.lookOffsetX, camGuiState.lookOffsetY, camGuiState.lookOffsetZ);
  seq.params.speed = camGuiState.velocity;
}

syncCamGuiFromSequence();

camGuiState.paused = false;
camGuiState.followCam = true;
camGuiState.fov = camera.fov;
camGuiState.speed = orbitDegreesPerSecond;

const camFolder = gui.addFolder('Camera Follow');
camFolder.add(camGuiState, 'paused').name('⏸ Pause').onChange((val) => {
  isOrbitAnimating = !val;
  if (val && cameraFollowEnabled) {
    // When pausing, set controls target to current vehicle's look target so rotation rotates around the vehicle.
    controls.target.copy(currentCamTarget);
    controls.update();
  }
}).listen();
camFolder.add(camGuiState, 'followCam').name('Follow Camera').onChange((val) => {
  cameraFollowEnabled = val;
  if (!val) {
    controls.enabled = true;
    camera.position.copy(currentCamPos);
    controls.target.copy(currentCamTarget);
    controls.update();
  }
}).listen();
camFolder.add(camGuiState, 'fov', 10, 120).step(1).name('FOV').onChange((val) => {
  camera.fov = val;
  camera.updateProjectionMatrix();
}).listen();
camFolder.add(camGuiState, 'speed', 1, 60).step(1).name('Orbit Speed').onChange((val) => {
  orbitDegreesPerSecond = val;
}).listen();
camFolder.add(camGuiState, 'velocity', 1, 60).step(1).name('Velocity').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'activeVehicle').name('Vehicle').listen();
camFolder.add(camGuiState, 'camOffsetX', -10, 10).step(0.1).name('Radial Out').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'camOffsetY', -10, 10).step(0.1).name('Height Up').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'camOffsetZ', -10, 10).step(0.1).name('Forward').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'lookOffsetX', -10, 10).step(0.1).name('Look Radial').onChange(applyCamGuiToSequence);
camFolder.add(camGuiState, 'lookOffsetY', -10, 10).step(0.1).name('Look Height').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'lookOffsetZ', -10, 10).step(0.1).name('Look Forward').onChange(applyCamGuiToSequence).listen();
camFolder.open();

const introFolder = gui.addFolder('Intro Animation');
introFolder.add(introParams, 'writeDuration', 0.5, 10.0).step(0.1).name('Write Time (s)');
introFolder.add(introParams, 'unwriteDuration', 0.5, 10.0).step(0.1).name('Unwrite Time (s)');
introFolder.open();

// Initialize starting positions
orbitSequence.forEach(seq => {
  if (seq.params) {
    seq.params.orbitDegrees = seq.start;
  }
});

/**
 * Compute world-space camera position and look-at target for a given vehicle.
 * Uses the vehicle's actual forward direction from its world quaternion:
 *   camOffset.x = radial outward from cylinder axis
 *   camOffset.y = height along Z axis (cylinder axis)
 *   camOffset.z = ahead of vehicle (along its facing direction)
 */
function getVehicleCameraTransform(seq) {
  const obj = seq.getObject();
  if (!obj) return null;

  // Get the vehicle's world position
  const vehiclePos = new THREE.Vector3();
  obj.getWorldPosition(vehiclePos);

  // Compute the current angle of the vehicle
  const orbitRad = THREE.MathUtils.degToRad(seq.params.orbitDegrees);
  const currentAngle = seq.params.angle + orbitRad;

  // Radial outward from cylinder axis (pure cylinder frame)
  const radialDir = new THREE.Vector3(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();
  // Height direction: along the cylinder Z axis
  const heightDir = new THREE.Vector3(0, 0, 1);
  // Tangent direction along the road (forward direction)
  const vehicleForward = new THREE.Vector3(-Math.sin(currentAngle), Math.cos(currentAngle), 0).normalize();

  // Camera position = vehicle position + offsets
  const worldCamPos = vehiclePos.clone()
    .addScaledVector(radialDir, seq.camOffset.x)
    .addScaledVector(heightDir, seq.camOffset.y)
    .addScaledVector(vehicleForward, seq.camOffset.z);

  // Look-at target = vehicle position + optional offsets
  const worldLookAt = vehiclePos.clone()
    .addScaledVector(radialDir, seq.lookOffset.x)
    .addScaledVector(heightDir, seq.lookOffset.y)
    .addScaledVector(vehicleForward, seq.lookOffset.z);

  return { position: worldCamPos, target: worldLookAt, up: radialDir.clone() };
}

/**
 * Smooth ease-in-out function for transitions
 */
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/**
 * Manual background segment visibility culling.
 * Disables rendering of distant segments that are not in focus and hidden behind the cylinder.
 */
function updateBackgroundVisibility() {
  const activeAngles = [];

  // Get active vehicle angles
  const currentSeq = orbitSequence[currentSeqIndex];
  if (currentSeq && currentSeq.params) {
    const orbitRad = THREE.MathUtils.degToRad(currentSeq.params.orbitDegrees);
    activeAngles.push(currentSeq.params.angle + orbitRad);
  }

  if (isTransitioning) {
    const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
    const prevSeq = orbitSequence[prevIndex];
    if (prevSeq && prevSeq.params) {
      const orbitRad = THREE.MathUtils.degToRad(prevSeq.params.orbitDegrees);
      activeAngles.push(prevSeq.params.angle + orbitRad);
    }
  }

  const bgNames = ['City', 'School', 'Landscape', 'Beach', 'Desert', 'Cafe'];

  bgNames.forEach(name => {
    const model = scene.getObjectByName(name);
    if (model) {
      // Calculate current angle based on model's position
      const bgAngle = Math.atan2(model.position.y, model.position.x);

      // Check if it is close to any active vehicle
      const isClose = activeAngles.some(activeAngle => {
        let diff = Math.abs(activeAngle - bgAngle) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff < 1.95; // ~112 degrees threshold
      });

      model.visible = isClose;
    }
  });
}

// --- Animate ---
function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const realDeltaTime = Math.min((currentTime - lastTime) / 1000, 1.0); // cap at 1s to prevent total break
  const deltaTime = Math.min(realDeltaTime, 0.05); // cap for physics/orbit
  lastTime = currentTime;

  // --- Update Hover Protrusion ---
  const hoverSpeed = 10.0;
  for (const name in hoverScenes) {
    const sceneData = hoverScenes[name];

    // Protrusion is strictly active in the post-sequence finale view
    if (!isPostSequence) {
      sceneData.target = 0.0;
    }

    const prevVal = sceneData.current;

    // Smooth interpolation towards target
    sceneData.current += (sceneData.target - sceneData.current) * hoverSpeed * realDeltaTime;

    // Clamp if extremely close to avoid endless updates
    if (Math.abs(sceneData.target - sceneData.current) < 0.001) {
      sceneData.current = sceneData.target;
    }

    if (sceneData.current !== prevVal) {
      const env = loadedEnvironments[name];
      if (env && env.update) {
        env.update();
      }
    }
  }


  const isPaused = camGuiState && camGuiState.paused;
  const isIntroState = introActive || isIntroTransitioning;

  if (isVehicleHeld) {
    activeWheelSpeedFactor = Math.max(0.0, activeWheelSpeedFactor - realDeltaTime * 4.0);
  } else {
    activeWheelSpeedFactor = Math.min(1.0, activeWheelSpeedFactor + realDeltaTime * 3.0);
  }

  // --- Incremental Pre-Caching ---
  if (allAssetsLoaded && !fullyOptimized) {
    try {
      const city = scene.getObjectByName('City');
      const beach = scene.getObjectByName('Beach');
      const desert = scene.getObjectByName('Desert');
      const landscape = scene.getObjectByName('Landscape');
      const cafe = scene.getObjectByName('Cafe');

      // Store visibilities
      const cityVis = city ? city.visible : false;
      const beachVis = beach ? beach.visible : false;
      const desertVis = desert ? desert.visible : false;
      const landscapeVis = landscape ? landscape.visible : false;
      const cafeVis = cafe ? cafe.visible : false;

      // Temporarily make visible for raycasting
      if (city) city.visible = true;
      if (beach) beach.visible = true;
      if (desert) desert.visible = true;
      if (landscape) landscape.visible = true;
      if (cafe) cafe.visible = true;

      // Update matrix once per frame for the target cached model
      if (cacheVehicleIdx === 0 && city) city.updateMatrixWorld(true);
      if (cacheVehicleIdx === 1 && beach) beach.updateMatrixWorld(true);
      if (cacheVehicleIdx === 2 && desert) desert.updateMatrixWorld(true);
      if (cacheVehicleIdx === 3 && landscape) landscape.updateMatrixWorld(true);
      if (cacheVehicleIdx === 4 && cafe) cafe.updateMatrixWorld(true);

      // Keep background pre-caching light (batchSize = 5) during text writing to maintain 60 FPS.
      // Boost batchSize to 35 once written so caching finishes as quickly as possible.
      const writeProgress = Math.min(introTimer / Math.max(introParams.writeDuration, 0.1), 1.0);
      const batchSize = (introActive && writeProgress < 1.0) ? 5 : 35;
      let processed = 0;

      while (processed < batchSize && cacheVehicleIdx < 5) {
        if (cacheAngleIdx === 0) {
          console.log("Pre-caching started for vehicle index: " + cacheVehicleIdx);
        }
        const a = cacheAngles[cacheAngleIdx];
        const idx = Math.round(a / STEP);

        if (cacheVehicleIdx === 0) {
          if (!motorcycleCache.has(idx)) {
            motorcycleCache.set(idx, runMotorcycleRaycast(a, true));
          }
        } else if (cacheVehicleIdx === 1) {
          if (!boatCache.has(idx)) {
            boatCache.set(idx, runBoatRaycast(a, true));
          }
        } else if (cacheVehicleIdx === 2) {
          if (!broncoCache.has(idx)) {
            broncoCache.set(idx, runBroncoRaycast(a, true));
          }
        } else if (cacheVehicleIdx === 3) {
          if (!car2Cache.has(idx)) {
            car2Cache.set(idx, runCar2Raycast(a, true));
          }
        } else if (cacheVehicleIdx === 4) {
          if (!racecarCache.has(idx)) {
            racecarCache.set(idx, runRacecarRaycast(a, true));
          }
        }

        processed++;
        cacheAngleIdx++;

        if (cacheAngleIdx >= cacheAngles.length) {
          cacheAngleIdx = 0;
          cacheVehicleIdx++;
        }
      }

      // Restore visibilities
      if (city) city.visible = cityVis;
      if (beach) beach.visible = beachVis;
      if (desert) desert.visible = desertVis;
      if (landscape) landscape.visible = landscapeVis;
      if (cafe) cafe.visible = cafeVis;

      if (cacheVehicleIdx >= 5) {
        fullyOptimized = true;
        console.log("All 12 assets loaded and fully optimized/cached!");
        // Temporarily show all backgrounds to pre-compile their shaders
        if (city) city.visible = true;
        if (beach) beach.visible = true;
        if (desert) desert.visible = true;
        if (landscape) landscape.visible = true;
        if (cafe) cafe.visible = true;
        // Also show the School model
        const school = scene.getObjectByName('School');
        if (school) school.visible = true;
        renderer.compile(scene, camera);
        console.log("Shader pre-compilation complete (all backgrounds).");
        // Restore — still intro, so backgrounds go back to hidden
        if (city) city.visible = false;
        if (beach) beach.visible = false;
        if (desert) desert.visible = false;
        if (landscape) landscape.visible = false;
        if (cafe) cafe.visible = false;
        if (school) school.visible = false;
      }
    } catch (err) {
      console.warn("Exception in background pre-caching loop:", err);
      // Fallback: force fullyOptimized = true so we don't block transition or freeze
      fullyOptimized = true;
    }
  }

  // --- Cursive Intro Animation ---
  const now = performance.now();
  const showWriting = allAssetsLoaded && (now - loaderFinishedTime >= 200);

  if (showWriting && !loaderOverlayHidden) {
    loaderOverlayHidden = true;
    const loaderOverlay = document.getElementById('loading-overlay');
    if (loaderOverlay) {
      loaderOverlay.classList.add('fade-out');
    }
  }

  if (introActive) {
    if (!isPaused && fullyOptimized && showWriting) {
      const targetWriteTime = Math.max(introParams.writeDuration, 0.1);
      if (introTimer < targetWriteTime) {
        introTimer += realDeltaTime;
      } else {
        introTimer = targetWriteTime;
        if (writePauseTimer < 0.3) {
          writePauseTimer += realDeltaTime;
        } else {
          const targetUnwriteTime = Math.max(introParams.unwriteDuration, 0.1);
          if (unwriteTimer < targetUnwriteTime) {
            unwriteTimer += realDeltaTime;
          } else {
            unwriteTimer = targetUnwriteTime;
            if (unwritePauseTimer < 0.3) {
              unwritePauseTimer += realDeltaTime;
            } else {
              // Trigger first finale (10s sequence complete transition)
              introActive = false;
              isPostSequence = true;
              introFinaleActive = true;
              introFinaleTimer = 0.0;
              postSeqTimer = 0.0;
              isOrbitAnimating = false;

              // Capture current camera state for smooth transition start (from intro cam position)
              transitionStartPos.copy(camera.position);
              transitionStartTarget.set(0, 0, getCylinderMiddleZ());
              transitionStartUp.copy(camera.up);
              // Restore cylinder/background visibilities
              globe.visible = true;
              orbitRing.visible = true;

              // Make sure all vehicles are visible (but with 0 opacity so they fade out/remain invisible)
              orbitSequence.forEach(seq => {
                const obj = seq.getObject();
                if (obj) {
                  obj.visible = true;
                  setOpacity(obj, 0.0);
                }
              });

              // Prepare cursive plane for post-sequence finale
              if (cursivePlane) {
                cursivePlane.visible = true;
                cursivePlane.rotation.set(0, 0, 0);
                cursivePlane.position.set(0, 0, getCylinderMiddleZ());
                cursivePlane.material.opacity = 0.0;
                drawCursiveName(1.0, 0.0);
              }
            }
          }
        }
      }
    }

    const writeProgress = (fullyOptimized && showWriting) ? Math.min(introTimer / Math.max(introParams.writeDuration, 0.1), 1.0) : 0.0;
    const unwriteProgress = (fullyOptimized && showWriting) ? Math.min(unwriteTimer / Math.max(introParams.unwriteDuration, 0.1), 1.0) : 0.0;

    // Only redraw the cursive canvas when progress actually changes (avoids GPU texture upload every frame)
    if (writeProgress !== lastWriteProgress || unwriteProgress !== lastUnwriteProgress) {
      drawCursiveName(writeProgress, unwriteProgress);
      lastWriteProgress = writeProgress;
      lastUnwriteProgress = unwriteProgress;
    }
  }

  // --- Orbit Animation ---
  if (isOrbitAnimating && !isIntroState && !isPaused) {
    // We animate BOTH the currently active vehicle and, if transitioning, the target vehicle.
    // However, to trigger the transition early, we check if the current vehicle is close to its end angle.
    const currentSeq = orbitSequence[currentSeqIndex];
    if (currentSeq && currentSeq.params) {
      const direction = currentSeq.end > currentSeq.start ? 1 : -1;

      // Update current vehicle position (only when not transitioning to prevent double-speed updates)
      if (!isTransitioning && !isVehicleHeld) {
        currentSeq.params.orbitDegrees += direction * currentSeq.params.speed * deltaTime;
      }

      // Check if we should trigger transition early (e.g. 5 degrees before end angle)
      const earlyTriggerAngle = 5; // degrees before end
      let shouldTriggerTransition = false;

      if (direction === 1) {
        if (currentSeq.params.orbitDegrees >= currentSeq.end) {
          currentSeq.params.orbitDegrees = currentSeq.end;
        }
        // If we aren't transitioning yet, check if we reached the early threshold
        if (!isTransitioning && currentSeq.params.orbitDegrees >= (currentSeq.end - earlyTriggerAngle)) {
          shouldTriggerTransition = true;
        }
      } else if (direction === -1) {
        if (currentSeq.params.orbitDegrees <= currentSeq.end) {
          currentSeq.params.orbitDegrees = currentSeq.end;
        }
        if (!isTransitioning && currentSeq.params.orbitDegrees <= (currentSeq.end + earlyTriggerAngle)) {
          shouldTriggerTransition = true;
        }
      }

      // If transition is triggered, switch focus to the next vehicle but keep both animating
      if (shouldTriggerTransition) {
        // Check if this is the last vehicle in the sequence (Racecar)
        if (currentSeqIndex === orbitSequence.length - 1 && !sequenceEverCompleted) {
          // Sequence complete — enter post-sequence state
          isPostSequence = true;
          isOrbitAnimating = false;
          sequenceEverCompleted = true;
          postSeqTimer = 0;
          currentSeq.params.orbitDegrees = currentSeq.end;

          // Capture current camera state for smooth transition start
          transitionStartPos.copy(camera.position);
          transitionStartTarget.copy(currentCamTarget);
          transitionStartUp.copy(camera.up);

          // Reorient cursive plane to face +Z for the ending view
          if (cursivePlane) {
            cursivePlane.visible = true;
            cursivePlane.rotation.set(0, 0, 0);
            cursivePlane.position.set(0, 0, getCylinderMiddleZ());
            cursivePlane.material.opacity = 0.0;
          }
          console.log("Orbit sequence complete — transitioning to portfolio view.");
        } else {
          const nextIndex = (currentSeqIndex + 1) % orbitSequence.length;
          const nextSeq = orbitSequence[nextIndex];
          if (nextSeq && nextSeq.params) {
            nextSeq.params.orbitDegrees = nextSeq.start;
          }

          currentSeqIndex = nextIndex;
          syncCamGuiFromSequence();

          if (cameraFollowEnabled) {
            isTransitioning = true;
            transitionProgress = 0;
            transitionStartPos.copy(camera.position);
            transitionStartTarget.copy(currentCamTarget);
            transitionStartUp.copy(camera.up);
          }
        }
      }
    }

    // If we are transitioning, we must also continue animating the vehicle we just transitioned FROM
    // so it doesn't freeze in place while the camera moves. We smoothly decelerate it (quadratic ease-out).
    if (isTransitioning) {
      const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
      const prevSeq = orbitSequence[prevIndex];
      if (prevSeq && prevSeq.params && !isVehicleHeld) {
        const prevDirection = prevSeq.end > prevSeq.start ? 1 : -1;
        // Smoothly decelerate it to a crawl speed (20% of top speed) as it transitions out
        const easeOut = 0.2 + 0.8 * ((1.0 - transitionProgress) * (1.0 - transitionProgress));
        prevSeq.params.orbitDegrees += prevDirection * (prevSeq.params.speed * easeOut) * deltaTime;
        if (prevDirection === 1 && prevSeq.params.orbitDegrees > prevSeq.end) {
          prevSeq.params.orbitDegrees = prevSeq.end;
        } else if (prevDirection === -1 && prevSeq.params.orbitDegrees < prevSeq.end) {
          prevSeq.params.orbitDegrees = prevSeq.end;
        }
      }
    }

    // Also, the currently active vehicle (which is the one we are transitioning TO) must animate too!
    // We smoothly accelerate it from a small crawl speed (20% of top speed) to its full speed (quadratic ease-in).
    if (isTransitioning) {
      const activeSeq = orbitSequence[currentSeqIndex];
      if (activeSeq && activeSeq.params && !isVehicleHeld) {
        const activeDirection = activeSeq.end > activeSeq.start ? 1 : -1;
        const easeIn = 0.2 + 0.8 * (transitionProgress * transitionProgress);
        activeSeq.params.orbitDegrees += activeDirection * (activeSeq.params.speed * easeIn) * deltaTime;
        if (activeDirection === 1 && activeSeq.params.orbitDegrees > activeSeq.end) {
          activeSeq.params.orbitDegrees = activeSeq.end;
        } else if (activeDirection === -1 && activeSeq.params.orbitDegrees < activeSeq.end) {
          activeSeq.params.orbitDegrees = activeSeq.end;
        }
      }
    }

    // Update GUI visually (only update the active folder to avoid traversing all folders every frame)
    if (typeof gui !== 'undefined' && gui.__folders) {
      const activeFolder = gui.__folders[orbitSequence[currentSeqIndex].name];
      if (activeFolder) {
        activeFolder.__controllers.forEach(c => c.updateDisplay());
      }
    }
  }

  // --- Update only active vehicles ---
  const activeIndices = new Set();
  activeIndices.add(currentSeqIndex);
  if (isTransitioning) {
    const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
    activeIndices.add(prevIndex);
  }

  if (!isIntroState) {
    activeIndices.forEach(idx => {
      const seq = orbitSequence[idx];
      if (seq && seq.update) {
        seq.update();
      }
    });
  }

  // --- Manual background visibility culling & Cursive Text Visibility ---
  if (!isIntroState) {
    updateBackgroundVisibility();
  } else {
    // Hide all backgrounds during intro so we have a transparent background for writing letters
    const bgNames = ['City', 'School', 'Landscape', 'Beach', 'Desert', 'Cafe'];
    bgNames.forEach(name => {
      const model = scene.getObjectByName(name);
      if (model) model.visible = false;
    });
  }

  if (cursivePlane) {
    const shouldShowCursive = introActive || isIntroTransitioning || isPostSequence;
    if (cursivePlane.visible !== shouldShowCursive) {
      cursivePlane.visible = shouldShowCursive;
    }
  }

  // --- Camera Follow Logic ---
  if (introActive) {
    camera.position.set(0, -1.8, 2.275);
    camera.lookAt(0, 0, 2.275);
    camera.up.set(0, 0, 1);
    controls.enabled = false;

    // Hide all vehicles during active intro so they do not block the viewport
    orbitSequence.forEach(seq => {
      const obj = seq.getObject();
      if (obj) {
        setOpacity(obj, 0.0);
      }
    });
  } else if (isIntroTransitioning) {
    if (!isPaused) {
      introTransitionProgress += realDeltaTime / 1.5; // 1.5 seconds camera pan
    }
    const t = smoothstep(Math.min(introTransitionProgress, 1.0));

    // Target follow camera position for the motorcycle
    const targetTransform = getVehicleCameraTransform(orbitSequence[0]);
    if (targetTransform) {
      camera.position.lerpVectors(introTransitionStartPos, targetTransform.position, t);
      const currentTarget = new THREE.Vector3().lerpVectors(introTransitionStartTarget, targetTransform.target, t);
      camera.lookAt(currentTarget);
      camera.up.lerpVectors(introTransitionStartUp, targetTransform.up, t).normalize();
    }

    // Fade cylinder, ring, and motorcycle in
    globeMaterial.opacity = THREE.MathUtils.lerp(transitionStartGlobeOpacity, 0.35, t);
    orbitMaterial.opacity = THREE.MathUtils.lerp(transitionStartOrbitOpacity, 0.45, t);
    setOpacity(motorcycleGroup, t);

    // Fade cursive text out
    if (cursivePlane) {
      cursivePlane.material.opacity = THREE.MathUtils.lerp(transitionStartCursiveOpacity, 0.0, t);
    }

    // Update motorcycle position so it is positioned correctly during the camera pan
    updateMotorcycle();

    if (introTransitionProgress >= 1.0) {
      isIntroTransitioning = false;

      // Sync camera follow system to prevent duplicate camera lerp
      currentCamPos.copy(camera.position);
      const finalTransform = getVehicleCameraTransform(orbitSequence[0]);
      if (finalTransform) {
        currentCamTarget.copy(finalTransform.target);
      }

      // Keep cursive plane alive, just hide it and restore full text for post-sequence view
      if (cursivePlane) {
        cursivePlane.visible = false;
        drawCursiveName(1.0, 0.0);
      }
      console.log("Intro transition complete. Cursive plane preserved for post-sequence.");
    }
    controls.enabled = false;
  } else if (isPostSequence) {
    // Post-sequence: smoothly lerp camera to (0, 0, 30) looking at (0, 0, 0)
    if (!isPaused) {
      postSeqTimer += realDeltaTime;
      const accelTime = 3.0; // 3 seconds acceleration
      const omegaMax = 0.4;  // max angular velocity (in rad/s)
      const currentOmega = omegaMax * Math.min(postSeqTimer / accelTime, 1.0);
      postSeqAngle += currentOmega * realDeltaTime;
    }
    const postSeqDuration = 3.0; // 3 seconds for the final camera sweep
    const t = smoothstep(Math.min(postSeqTimer / postSeqDuration, 1.0));

    const finalCamPos = new THREE.Vector3(0, 0, 15);
    const finalCamTarget = new THREE.Vector3(0, 0, 0);
    const finalUp = new THREE.Vector3(-Math.sin(postSeqAngle), Math.cos(postSeqAngle), 0).normalize();

    // Lerp camera position and target
    currentCamPos.lerpVectors(transitionStartPos, finalCamPos, t);
    currentCamTarget.lerpVectors(transitionStartTarget, finalCamTarget, t);
    camera.up.lerpVectors(transitionStartUp, finalUp, t).normalize();
    camera.position.copy(currentCamPos);
    camera.lookAt(currentCamTarget);

    // Fade in cursive text and cylinder
    globeMaterial.opacity = THREE.MathUtils.lerp(globeMaterial.opacity, 0.35, 0.02);
    orbitMaterial.opacity = THREE.MathUtils.lerp(orbitMaterial.opacity, 0.45, 0.02);

    // Fade in the cursive name and apply counter-rotation to keep it static/horizontal
    if (cursivePlane) {
      cursivePlane.material.opacity = THREE.MathUtils.lerp(cursivePlane.material.opacity, 0.9, 0.03);
      cursivePlane.rotation.z = postSeqAngle;
    }

    // Fade out all vehicles
    orbitSequence.forEach(seq => {
      const obj = seq.getObject();
      if (obj && obj.visible) {
        const currentOpacity = obj.children[0]?.material?.opacity || 1.0;
        setOpacity(obj, Math.max(0, currentOpacity - 0.02));
      }
    });

    // Show all backgrounds
    const bgNames = ['City', 'School', 'Landscape', 'Beach', 'Desert', 'Cafe'];
    bgNames.forEach(name => {
      const model = scene.getObjectByName(name);
      if (model) model.visible = true;
    });

    // Disable orbit controls to prevent overriding camera.up rotation
    controls.enabled = false;
    controls.autoRotate = false;

    if (introFinaleActive && !isPaused) {
      introFinaleTimer += realDeltaTime;
      if (introFinaleTimer >= 10.0) {
        isPostSequence = false;
        introFinaleActive = false;
        isIntroTransitioning = true;
        introTransitionProgress = 0;
        currentSeqIndex = 0;
        isOrbitAnimating = true;
        navLabelsVisible = true;
        isTransitioning = false;
        transitionProgress = 0;

        // Reset the first vehicle to its start position
        const targetSeq = orbitSequence[0];
        if (targetSeq && targetSeq.params) {
          targetSeq.params.orbitDegrees = targetSeq.start;
        }
        syncCamGuiFromSequence();

        // Capture camera state for transition out of the first finale
        introTransitionStartPos.copy(camera.position);
        introTransitionStartTarget.copy(currentCamTarget);
        introTransitionStartUp.copy(camera.up);

        // Capture starting opacities to prevent any visual pops/flashes during the fade-in of the road/motorcycle
        transitionStartGlobeOpacity = globeMaterial.opacity;
        transitionStartOrbitOpacity = orbitMaterial.opacity;
        transitionStartCursiveOpacity = cursivePlane ? cursivePlane.material.opacity : 0.0;
        console.log("10s first finale complete — transitioning to Motorcycle.");
      }
    }
  } else if (cameraFollowEnabled) {
    if (isTransitioning) {
      // Smooth transition between vehicles
      transitionProgress += deltaTime / transitionDuration;
      const t = smoothstep(Math.min(transitionProgress, 1.0));

      // Get the destination vehicle's current camera transform
      const nextSeq = orbitSequence[currentSeqIndex];
      const nextTransform = nextSeq ? getVehicleCameraTransform(nextSeq) : null;

      if (nextTransform) {
        transitionEndPos.copy(nextTransform.position);
        transitionEndTarget.copy(nextTransform.target);
      }

      // Interpolate position and target
      currentCamPos.lerpVectors(transitionStartPos, transitionEndPos, t);
      currentCamTarget.lerpVectors(transitionStartTarget, transitionEndTarget, t);

      // Smoothly interpolate camera up vector to prevent sudden roll jump
      if (nextTransform) {
        const transitionEndUp = nextTransform.up;
        camera.up.lerpVectors(transitionStartUp, transitionEndUp, t).normalize();
      }
      camera.position.copy(currentCamPos);
      camera.lookAt(currentCamTarget);

      // Fade out the previous vehicle, fade in the next vehicle
      const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
      const prevSeq = orbitSequence[prevIndex];

      const prevObj = prevSeq ? prevSeq.getObject() : null;
      const nextObj = nextSeq ? nextSeq.getObject() : null;

      setOpacity(prevObj, 1.0 - t);
      setOpacity(nextObj, t);

      if (transitionProgress >= 1.0) {
        isTransitioning = false;
        // Ensure perfect cleanup values at completion
        setOpacity(prevObj, 0.0);
        setOpacity(nextObj, 1.0);
      }
    } else if (isOrbitAnimating) {
      // Directly follow the current vehicle
      const currentSeq = orbitSequence[currentSeqIndex];
      const transform = currentSeq ? getVehicleCameraTransform(currentSeq) : null;

      // When not transitioning, ensure the active vehicle is visible and has original opacity restored
      orbitSequence.forEach((seq, idx) => {
        const obj = seq.getObject();
        if (obj) {
          const shouldBeVisible = (idx === currentSeqIndex);
          if (obj.visible !== shouldBeVisible) {
            obj.visible = shouldBeVisible;
            if (shouldBeVisible) {
              obj.traverse((child) => {
                if (child.isMesh && child.material) {
                  const materials = Array.isArray(child.material) ? child.material : [child.material];
                  materials.forEach((mat) => {
                    // Restore original opacity, leaving transparent=true for vehicle materials
                    const origOpacity = mat.userData.originalOpacity !== undefined ? mat.userData.originalOpacity : 1.0;
                    mat.opacity = origOpacity;
                  });
                }
              });
            }
          }
        }
      });

      if (transform) {
        // Rigid follow without lerp to prevent relative sloping/tilting and viewport drift
        currentCamPos.copy(transform.position);
        currentCamTarget.copy(transform.target);

        camera.up.copy(transform.up);
        camera.position.copy(currentCamPos);
        camera.lookAt(currentCamTarget);
      }
    }

    // Disable orbit controls during camera follow so they don't fight, but allow them when paused
    if (isOrbitAnimating || isTransitioning) {
      controls.enabled = false;
    } else {
      controls.enabled = true;
      controls.update();
    }
  }



  // --- Update 3D Nav Labels (runs in both post-sequence and orbit) ---
  // Nav label animation runs outside the camera if/else chain so it persists during orbit animation
  if (isPostSequence || navLabelsVisible) {
    // Position labels statically on the cylinder cap to rotate with the scene
    updateNavLabelPositions();

    // Fade in nav labels and apply active highlighting
    navLabels.forEach((entry, idx) => {
      entry.mesh.visible = true;

      // Set target opacity based on highlight state (initialize if first frame)
      if (!navLabelsVisible) {
        // Reset all background scenes to flat (no protrusion)
        for (const name in hoverScenes) {
          hoverScenes[name].target = 0.0;
        }
        // Set all nav labels to default opacity/scale at start of post-sequence
        navLabels.forEach((e) => {
          e.targetOpacity = 0.75;
          e.targetScale = 1.0;
        });
        navLabelsVisible = true;
        hoverTimeoutTimer = 0; // Reset hover timer on entry
      }

      // Smooth opacity interpolation
      const currentOpacity = entry.mesh.material.opacity;
      entry.mesh.material.opacity += (entry.targetOpacity - currentOpacity) * 6.0 * realDeltaTime;

      // Smooth scale interpolation
      const currentScaleY = Math.abs(entry.mesh.scale.y);
      const newScale = currentScaleY + (entry.targetScale - currentScaleY) * 6.0 * realDeltaTime;
      entry.mesh.scale.y = newScale;
      entry.mesh.scale.x = newScale;
      entry.mesh.scale.z = newScale;
    });

    // --- Decrement and Handle Hover Timeout ---
    if (hoverTimeoutTimer > 0 && !isPaused) {
      hoverTimeoutTimer -= realDeltaTime;
      if (hoverTimeoutTimer <= 0) {
        hoverTimeoutTimer = 0;
        // Reset all background scenes to flat (no protrusion)
        for (const name in hoverScenes) {
          hoverScenes[name].target = 0.0;
        }
        // Reset all nav labels to default opacity/scale
        navLabels.forEach((entry) => {
          entry.targetOpacity = 0.75;
          entry.targetScale = 1.0;
        });
      }
    }
  }

  renderer.render(scene, camera);
}

initNavLabels();
animate();

// --- Navigation Tab Click Handlers ---


// --- 3D Nav Label Keyboard Controls ---

function getSectorIndexFromVehicleIndex(vehicleIdx) {
  if (vehicleIdx >= 0 && vehicleIdx <= 5) return vehicleIdx;
  return -1;
}

function returnToFinale() {
  if (isPostSequence) return; // already there

  introActive = false;
  isIntroTransitioning = false;
  introFinaleActive = false;
  isPostSequence = true;
  isOrbitAnimating = false;
  isTransitioning = false;
  sequenceEverCompleted = true;
  postSeqTimer = 0;

  // Sync active nav sector highlighting to the vehicle we just exited
  let sectorIdx = getSectorIndexFromVehicleIndex(currentSeqIndex);
  if (sectorIdx !== -1) {
    activeNavIndex = sectorIdx;
  }
  
  // Ensure all background scenes are flat (not hovering/protruding) upon returning to the finale
  for (const name in hoverScenes) {
    hoverScenes[name].target = 0.0;
  }
  // Reset all nav labels to default opacity/scale
  navLabels.forEach((entry) => {
    entry.targetOpacity = 0.75;
    entry.targetScale = 1.0;
  });
  hoverTimeoutTimer = 0; // Reset hover timer on entry

  // Capture current camera state for smooth transition start
  transitionStartPos.copy(camera.position);
  transitionStartTarget.copy(currentCamTarget);
  transitionStartUp.copy(camera.up);

  // Prepare cursive plane
  if (cursivePlane) {
    cursivePlane.visible = true;
    cursivePlane.rotation.set(0, 0, 0);
    cursivePlane.position.set(0, 0, getCylinderMiddleZ());
    cursivePlane.material.opacity = 0.0;
  }

  console.log("Returning to post-sequence finale via keyboard.");
}

function triggerNavigation(navIdx) {
  if (navIdx < 0 || navIdx >= navLabelConfig.length) return;

  const config = navLabelConfig[navIdx];
  const targetIndex = config.vehicleIdx;
  if (targetIndex === undefined || targetIndex >= orbitSequence.length) return;

  // Cancel intro animations
  introActive = false;
  isIntroTransitioning = false;
  introFinaleActive = false;

  const wasPostSequence = isPostSequence;

  // Exit post-sequence state
  if (isPostSequence) {
    isPostSequence = false;
    isOrbitAnimating = true;
    controls.autoRotate = false;
    globeMaterial.opacity = 0.35;
    orbitMaterial.opacity = 0.45;
    if (cursivePlane) {
      cursivePlane.visible = false;
    }
    if (isResumeHovered) {
      document.body.style.cursor = 'default';
      const resumeEntry = navLabels.find(entry => entry.config.label === 'Resume');
      if (resumeEntry) {
        updateNavLabelCanvas(resumeEntry, false);
      }
      isResumeHovered = false;
    }
    // Reset all nav label targets to their default, non-highlighted state
    navLabels.forEach((entry) => {
      entry.targetOpacity = 0.75;
      entry.targetScale = 1.0;
    });
  }
  sequenceEverCompleted = false;

  // Switch to the target vehicle
  const targetSeq = orbitSequence[targetIndex];
  if (targetSeq && targetSeq.params) {
    targetSeq.params.orbitDegrees = targetSeq.start;

    // Trigger camera transition
    transitionStartPos.copy(camera.position);
    transitionStartTarget.copy(currentCamTarget);
    transitionStartUp.copy(camera.up);

    currentSeqIndex = targetIndex;
    syncCamGuiFromSequence();

    isTransitioning = true;
    transitionProgress = 0;
    isOrbitAnimating = true;

    // Ensure the target vehicle is visible
    const nextObj = targetSeq.getObject();
    if (nextObj) {
      setOpacity(nextObj, 1.0);
    }

    if (targetSeq.update) {
      targetSeq.update();
    }
  }

  console.log(`Navigating to ${config.label} (vehicle index ${targetIndex}) via keyboard.`);
}

// Keyboard event handlers
window.addEventListener('keydown', (e) => {
  // Escape — return to post-sequence finale from any state
  if (e.key === 'Escape') {
    returnToFinale();
    return;
  }

  // Space — toggle pause
  if (e.key === ' ') {
    e.preventDefault();
    camGuiState.paused = !camGuiState.paused;
    isOrbitAnimating = !camGuiState.paused;
    if (camGuiState.paused && cameraFollowEnabled) {
      controls.target.copy(currentCamTarget);
      controls.update();
    }
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (isPostSequence) {
      activeNavIndex = (activeNavIndex + 1) % navLabelConfig.length;
      highlightNavLabel(activeNavIndex);
      hoverTimeoutTimer = 5.0; // Reset hover timer to 5s on arrow key activity
    } else {
      let sectorIdx = getSectorIndexFromVehicleIndex(currentSeqIndex);
      if (sectorIdx === -1) sectorIdx = 0;
      const nextSectorIdx = (sectorIdx + 1) % navLabelConfig.length;
      activeNavIndex = nextSectorIdx;
      highlightNavLabel(activeNavIndex);
      triggerNavigation(nextSectorIdx);
    }
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (isPostSequence) {
      activeNavIndex = (activeNavIndex - 1 + navLabelConfig.length) % navLabelConfig.length;
      highlightNavLabel(activeNavIndex);
      hoverTimeoutTimer = 5.0; // Reset hover timer to 5s on arrow key activity
    } else {
      let sectorIdx = getSectorIndexFromVehicleIndex(currentSeqIndex);
      if (sectorIdx === -1) sectorIdx = 0;
      const prevSectorIdx = (sectorIdx - 1 + navLabelConfig.length) % navLabelConfig.length;
      activeNavIndex = prevSectorIdx;
      highlightNavLabel(prevSectorIdx);
      triggerNavigation(prevSectorIdx);
    }
  } else if (e.key === 'Enter') {
    if (isPostSequence) {
      e.preventDefault();
      triggerNavigation(activeNavIndex);
    }
  }
});

// --- Audio Toggle Handling ---
const audio = document.getElementById('bg-audio');
const audioToggle = document.getElementById('audio-toggle');
const songNameEl = document.getElementById('song-name');

const songMap = {
  '/suis_mois.mp3': 'suis mois - camille, hans zimmer',
  '/windmills.mp3': 'windmills of your mind - sting',
  '/ciao.mp3': "l'amore dice ciao - armando trovajoli",
  '/bean-sabine.mp3': 'bean sabine ost - howard goodall',
  '/imagination.mp3': 'pure imagination - walter scharf',
  '/dreamers.mp3': 'sea dreamers - shankar, kale, sting',
  '/fly.mp3': 'fly by day - anri'
};

if (audio) {
  const songKeys = Object.keys(songMap);
  const randomSong = songKeys[Math.floor(Math.random() * songKeys.length)];
  audio.src = randomSong;
  if (songNameEl) {
    songNameEl.textContent = songMap[randomSong];
  }
  console.log("Selected background music:", randomSong);
}

if (audio && audioToggle) {
  audioToggle.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().then(() => {
        if (songNameEl) songNameEl.classList.add('playing');
      }).catch(err => {
        console.error("Audio playback failed:", err);
      });
    } else {
      audio.pause();
      if (songNameEl) songNameEl.classList.remove('playing');
    }
  });
}

// --- Raycast Click on Cylinder (Globe) ---
const _globeRaycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _hoverRaycaster = new THREE.Raycaster();
const _hoverMouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
  // Ignore clicks on HTML UI elements (tabs, buttons, text, dat.GUI etc.)
  if (event.target.tagName === 'BUTTON' ||
    event.target.closest('.dg') ||
    event.target.id === 'audio-toggle' ||
    event.target.closest('#audio-toggle')) {
    return;
  }

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  _mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Set the raycaster from the camera
  _globeRaycaster.setFromCamera(_mouse, camera);

  // 1. Raycast against 3D navigation labels if in the post-sequence finale view
  if (isPostSequence) {
    const labelMeshes = navLabels.map(entry => entry.mesh);
    const intersectsLabels = _globeRaycaster.intersectObjects(labelMeshes);
    if (intersectsLabels.length > 0) {
      const clickedMesh = intersectsLabels[0].object;
      const clickedEntry = navLabels.find(entry => entry.mesh === clickedMesh);
      if (clickedEntry && clickedEntry.config.label === 'Resume') {
        console.log("3D Resume Nav Label clicked. Opening /resume_v1.pdf");
        window.open('/resume_v1.pdf', '_blank');
        return;
      }
    }
  }

  // 2. Raycast against the globe cylinder to transition to the finale view
  if (globe) {
    const intersects = _globeRaycaster.intersectObject(globe);
    if (intersects.length > 0) {
      // User clicked the empty beige background of the cylinder!
      // Immediately transition to the final camera view (isPostSequence)
      if (!isPostSequence) {
        introActive = false;
        isIntroTransitioning = false;
        introFinaleActive = false;
        isPostSequence = true;
        isOrbitAnimating = false;
        isTransitioning = false;
        sequenceEverCompleted = true;
        postSeqTimer = 0;

        // Capture current camera state for smooth transition start
        transitionStartPos.copy(camera.position);
        transitionStartTarget.copy(currentCamTarget);
        transitionStartUp.copy(camera.up);

        // Prepare cursive plane
        if (cursivePlane) {
          cursivePlane.visible = true;
          cursivePlane.rotation.set(0, 0, 0);
          cursivePlane.position.set(0, 0, getCylinderMiddleZ());
          cursivePlane.material.opacity = 0.0;
        }

        console.log("Cylinder background clicked — transitioning to post-sequence final view.");
      }
    }
  }
});

// --- Raycast Click-and-Hold on Active Vehicle ---
window.addEventListener('pointerdown', (event) => {
  // Ignore pointerdown on HTML UI elements (tabs, buttons, text, dat.GUI etc.)
  if (event.target.tagName === 'BUTTON' ||
    event.target.closest('.dg') ||
    event.target.id === 'audio-toggle' ||
    event.target.closest('#audio-toggle')) {
    return;
  }

  // Only run hold logic if orbit animation is active
  if (!isOrbitAnimating || introActive || isIntroTransitioning || isPostSequence) {
    return;
  }

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  _mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  _globeRaycaster.setFromCamera(_mouse, camera);

  const currentSeq = orbitSequence[currentSeqIndex];
  if (currentSeq) {
    const activeObj = currentSeq.getObject();
    if (activeObj) {
      // Raycast recursively against the active vehicle group
      const intersects = _globeRaycaster.intersectObject(activeObj, true);
      if (intersects.length > 0) {
        isVehicleHeld = true;
        console.log(`Vehicle ${currentSeq.name} is now held down.`);
      }
    }
  }
});

const releaseVehicleHold = () => {
  if (isVehicleHeld) {
    isVehicleHeld = false;
    console.log("Vehicle hold released.");
  }
};

window.addEventListener('pointerup', releaseVehicleHold);
window.addEventListener('pointercancel', releaseVehicleHold);
window.addEventListener('mouseleave', releaseVehicleHold);

let isResumeHovered = false;

window.addEventListener('pointermove', (event) => {
  // Only handle hover logic in the post-sequence finale view
  if (!isPostSequence) {
    if (isResumeHovered) {
      document.body.style.cursor = 'default';
      const resumeEntry = navLabels.find(entry => entry.config.label === 'Resume');
      if (resumeEntry) {
        updateNavLabelCanvas(resumeEntry, false);
      }
      isResumeHovered = false;
    }
    return;
  }

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  _mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  _globeRaycaster.setFromCamera(_mouse, camera);

  const resumeEntry = navLabels.find(entry => entry.config.label === 'Resume');
  if (resumeEntry) {
    const intersects = _globeRaycaster.intersectObject(resumeEntry.mesh);
    if (intersects.length > 0) {
      if (!isResumeHovered) {
        document.body.style.cursor = 'pointer';
        updateNavLabelCanvas(resumeEntry, true);
        isResumeHovered = true;
      }
    } else {
      if (isResumeHovered) {
        document.body.style.cursor = 'default';
        updateNavLabelCanvas(resumeEntry, false);
        isResumeHovered = false;
      }
    }
  }
});

