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
let sequenceEverCompleted = false;

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
  cursiveCanvas.width = 1024;
  cursiveCanvas.height = 512;
  
  cursiveTexture = new THREE.CanvasTexture(cursiveCanvas);
  cursiveTexture.minFilter = THREE.LinearFilter;
  
  const material = new THREE.MeshBasicMaterial({
    map: cursiveTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false
  });
  
  const geometry = new THREE.PlaneGeometry(1.2, 0.6);
  cursivePlane = new THREE.Mesh(geometry, material);
  cursivePlane.position.set(0, 0, 2.275);
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

  // Use the Serif 420 font
  ctx.font = '55px "Instrument Serif", Georgia, serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000000'; // Make writing black

  // Measure text to center them
  const w1 = ctx.measureText(name1).width;
  const w2 = ctx.measureText(name2).width;

  const startX1 = (1024 - w1) / 2;
  const startX2 = (1024 - w2) / 2;

  // Vertical placement — closer together
  const y1 = 185;
  const y2 = 270;
  const rowHeight = 85;

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
  if (loadedCount === 12) {
    allAssetsLoaded = true;
    // Hide loading overlay with fade-out
    const loaderOverlay = document.getElementById('loading-overlay');
    if (loaderOverlay) {
      loaderOverlay.classList.add('fade-out');
    }
    console.log("All 12 assets loaded, starting incremental caching in background...");
  }
  // Update loading percentage
  const pctEl = document.getElementById('loader-percent');
  if (pctEl) {
    pctEl.innerText = Math.round((loadedCount / 12) * 100) + '%';
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
loader.setKTX2Loader(ktx2Loader);

// propellerObject is now set when the standalone airplane.glb is loaded (see below)

function prepareMesh(child, isVehicle = false) {
  if (child.isMesh) {
    if (child.material) {
      // High metalness without environment maps renders pitch black in Three.js.
      // We cap metalness to 0.1 and raise roughness to at least 0.4 to make materials diffuse light.
      if (child.material.metalness !== undefined   && child.material.metalness > 0.1) {
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
function createTextBox(text) {
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

  ctx.fillStyle = '#1e293b'; // Slate 800
  ctx.font = 'bold 44px "Outfit", "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

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
  rotX: -1.6,          // rotation X
  rotY: 2.9,          // rotation Y
  rotZ: 1.55,         // rotation Z
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.0,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
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

function loadModelWithGUI(name, url, defaults) {
  const params = { ...defaults };
  let obj = null;

  function update() {
    if (!obj) return;
    const x = params.distance * Math.cos(params.angle);
    const y = params.distance * Math.sin(params.angle);
    obj.position.set(x, y, params.posZ);

    if (params.cylinderAlign) {
      // Auto-align to cylinder surface, then apply small user adjustments.
      // This avoids gimbal lock because rotX/rotY/rotZ stay near 0.
      const alignQuat = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), params.angle)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      const adjustQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(params.rotX, params.rotY, params.rotZ)
      );
      obj.quaternion.copy(alignQuat).multiply(adjustQuat);
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
          landscapeMeshes.push(child);
        } else if (name === 'Cafe') {
          cafeMeshes.push(child);
        }
      }
    });

    // No longer extracting motorcycle from City model here as it is loaded separately.

    obj = model;
    model.name = name;  // Tag the model so we can find it by name at runtime
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
  rotX: 1.6,          // rotation X (tilt for cylinder alignment)
  rotY: -3.05,          // rotation Y
  rotZ: -1.2,         // rotation Z
  wheelSpeed: 0.5,     // wheel spin speed
  speed: 8,            // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.2,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
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
  distance: 2.45, angle: 1.73, rotX: 1.58, rotY: 1.73, rotZ: -1.58, posZ: 2.57, scale: 0.35
});

loadModelWithGUI('School', new URL('../assets/models/school_v2_meshopt.glb', import.meta.url).href, {
  distance: 2.55, angle: 0.74, rotX: 1.6, rotY: -2.45, rotZ: 1.6, posZ: 2.8, scale: 0.12
});

loadModelWithGUI('Landscape', new URL('../assets/models/landscape_v5_meshopt.glb', import.meta.url).href, {
  distance: 2.88, angle: -0.06, rotX: 1.58, rotY: 3.14, rotZ: 0, posZ: 3.2, scale: 0.038, cylinderAlign: true
});

loadModelWithGUI('Beach', new URL('../assets/models/beach_v2_meshopt.glb', import.meta.url).href, {
  distance: 2.8, angle: -0.95, rotX: 1.58, rotY: 0.62, rotZ: -1.58, posZ: 2.49, scale: 1.53
});

loadModelWithGUI('Desert', new URL('../assets/models/desert_meshopt.glb', import.meta.url).href, {
  distance: 3.05, angle: -1.86, rotX: 1.58, rotY: -0.48, rotZ: 1.58, posZ: 2.42, scale: 0.15
});

loadModelWithGUI('Cafe', new URL('../assets/models/cafe_meshopt.glb', import.meta.url).href, {
  distance: 2.45, angle: -3.1, rotX: 0, rotY: 0, rotZ: -0.11, posZ: 2.2, scale: 0.025
});


// --- Resize ---
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  if (motorcycleWheelBL) motorcycleWheelBL.rotation.x += motorcycleParams.wheelSpeed;
  if (motorcycleWheelFL) motorcycleWheelFL.rotation.x += motorcycleParams.wheelSpeed;

  updateVehicleTextbox(motorcycleGroup, motorcycleParams);
}

// --- Load Standalone Motorcycle ---
loader.load(new URL('../assets/models/motorcycle.glb', import.meta.url).href, (gltf) => {
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
  const textbox = createTextBox("hello world");
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
  rotX: -1.58,         // rotation X
  rotY: 2.4,           // rotation Y
  rotZ: 1.58,          // rotation Z
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
loader.load(new URL('../assets/models/airplane.glb', import.meta.url).href, (gltf) => {
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
  const textbox = createTextBox("hello world");
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
  rotX: 1.58,          // rotation X (tilt for cylinder alignment)
  rotY: 1.2,         // rotation Y
  rotZ: 1.58,          // rotation Z
  wheelSpeed: 0.05,    // wheel spin speed
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.5,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
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
  if (broncoWheelFL) broncoWheelFL.rotation.x += broncoParams.wheelSpeed;
  if (broncoWheelFR) broncoWheelFR.rotation.x += broncoParams.wheelSpeed;
  if (broncoWheelsFront) broncoWheelsFront.rotation.x += broncoParams.wheelSpeed;
  if (broncoWheelsRear) broncoWheelsRear.rotation.x += broncoParams.wheelSpeed;

  updateVehicleTextbox(broncoGroup, broncoParams);
}

// --- Load Standalone Bronco ---
loader.load(new URL('../assets/models/bronco.glb', import.meta.url).href, (gltf) => {
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
  const textbox = createTextBox("hello world");
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
loader.load(new URL('../assets/models/boat.glb', import.meta.url).href, (gltf) => {
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
  const textbox = createTextBox("hello world");
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
  distance: 2.48,      // distance offset
  height: 3.2,      // height offset along Z axis
  angle: -0.2,        // base angle (aligns with city road)
  orbitDegrees: 22,    // orbit rotation
  scale: 0.15,         // scale
  rotX: -1.58,          // rotation X
  rotY: -3.0,          // rotation Y
  rotZ: -1.58,          // rotation Z
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
  if (car2WheelFL) car2WheelFL.rotation.x += car2Params.wheelSpeed;
  if (car2WheelFR) car2WheelFR.rotation.x += car2Params.wheelSpeed;
  if (car2WheelBL) car2WheelBL.rotation.x += car2Params.wheelSpeed;
  if (car2WheelBR) car2WheelBR.rotation.x += car2Params.wheelSpeed;

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
  rotX: -1.58,          // rotation X
  rotY: -0.03,        // rotation Y
  rotZ: 1.58,         // rotation Z
  wheelSpeed: 0.1,     // wheel spin speed
  speed: 7,             // orbit speed
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.5,
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
  if (racecarWheelFL) racecarWheelFL.rotation.x += racecarParams.wheelSpeed;
  if (racecarWheelFR) racecarWheelFR.rotation.x += racecarParams.wheelSpeed;
  if (racecarWheelBL) racecarWheelBL.rotation.x += racecarParams.wheelSpeed;
  if (racecarWheelBR) racecarWheelBR.rotation.x += racecarParams.wheelSpeed;

  updateVehicleTextbox(racecarObject, racecarParams);
}

// --- Load Standalone Racecar ---
loader.load(new URL('../assets/models/sls_amg_63_black_series.glb', import.meta.url).href, (gltf) => {
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
  const textbox = createTextBox("hello world");
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
loader.load(new URL('../assets/models/car_v2.glb', import.meta.url).href, (gltf) => {
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
  const textbox = createTextBox("hello world");
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
  { name: 'Motorcycle', update: updateMotorcycle, params: motorcycleParams, start: 20, end: -30, getObject: () => motorcycleGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0) },
  { name: 'Airplane',  update: updateAirplane,   params: airplaneParams, start: 20, end: -15, getObject: () => airplaneGroup,  camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0) },
  { name: 'Car V2',    update: updateCar2,       params: car2Params,     start: 22, end: -12, getObject: () => car2Object,     camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0) },
  { name: 'Boat',      update: updateBoat,       params: boatParams,     start: 20, end: -23, getObject: () => boatObject,     camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0) },
  { name: 'Bronco',    update: updateBronco,     params: broncoParams,   start: 15, end: -40, getObject: () => broncoGroup,    camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0) },
  { name: 'Racecar',   update: updateRacecar,    params: racecarParams,  start: 8,  end: -40, getObject: () => racecarObject,  camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0) }
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

  // Radial outward from cylinder axis
  const radialDir = new THREE.Vector3(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();
  // Height direction: along the cylinder Z axis
  const heightDir = new THREE.Vector3(0, 0, 1);

  // Road rear vector: points towards the BACK of the vehicle along the road direction
  // Since all vehicles travel towards decreasing angle, the rear is in the direction of increasing angle.
  const vehicleForward = new THREE.Vector3(-Math.sin(currentAngle), Math.cos(currentAngle), 0).normalize();

  // Side direction (perpendicular to both radial direction and vehicle forward direction, i.e., along the cylinder axis)
  // Wait, let's use the cylinder Z axis (heightDir) as the lateral axis of the cylinder, or rather:
  // For a vehicle moving along the cylinder circumference, the local frame coordinates are:
  // - Radial (outward): radialDir
  // - Lateral/Left-Right (along cylinder height Z): heightDir
  // - Forward (along circumference): vehicleForward
  // Therefore, camOffset.y is heightDir, which is already the left/right offset relative to the vehicle direction!
  // If a vehicle is traveling along the road, 'left' means moving along the cylinder axis (Z-axis / heightDir).
  // Let's check: vehicle position is on a cylinder. Circumferential tangent is vehicleForward. Radial is radialDir.
  // The cross product is heightDir. So shift left/right corresponds to shifting along heightDir.
  // In the sequence offsets: camOffset.x = radial, camOffset.y = heightDir (which is lateral/side), camOffset.z = forward.
  // If we want to move the camera to the left, we can adjust the camOffset.y (height/side offset) in the sequence.


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

  const isPaused = camGuiState && camGuiState.paused;
  const isIntroState = introActive || isIntroTransitioning;

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
  if (introActive) {
    if (!isPaused) {
      introTimer += realDeltaTime;
    }
    
    const writeProgress = Math.min(introTimer / Math.max(introParams.writeDuration, 0.1), 1.0);
    let unwriteProgress = 0.0;
    
    if (writeProgress >= 1.0 && fullyOptimized) {
      if (!isPaused) {
        unwriteTimer += realDeltaTime;
      }
      unwriteProgress = Math.min(unwriteTimer / Math.max(introParams.unwriteDuration, 0.1), 1.0);
      
      if (unwriteProgress >= 1.0) {
        // Trigger camera transition
        isIntroTransitioning = true;
        introActive = false;
        introTransitionProgress = 0;
        introTransitionStartPos.set(0, -1.8, 2.275);
        introTransitionStartTarget.set(0, 0, 2.275);
        introTransitionStartUp.set(0, 0, 1);
        
        // Restore cylinder/background visibilities
        globe.visible = true;
        orbitRing.visible = true;
        updateBackgroundVisibility();
      }
    }
    
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
      if (!isTransitioning) {
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
            cursivePlane.position.set(0, 0, 0);
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
      if (prevSeq && prevSeq.params) {
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
      if (activeSeq && activeSeq.params) {
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

  // --- Manual background visibility culling ---
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
    globeMaterial.opacity = t;
    orbitMaterial.opacity = 0.45 * t;
    setOpacity(motorcycleGroup, t);

    // Fade cursive text out
    if (cursivePlane) {
      cursivePlane.material.opacity = 0.85 * (1.0 - t);
    }

    // Update motorcycle position so it is positioned correctly during the camera pan
    updateMotorcycle();

    if (introTransitionProgress >= 1.0) {
      isIntroTransitioning = false;
      
      // Keep cursive plane alive, just hide it and restore full text for post-sequence view
      if (cursivePlane) {
        cursivePlane.visible = false;
        drawCursiveName(1.0, 0.0);
      }
      console.log("Intro transition complete. Cursive plane preserved for post-sequence.");
    }
    controls.enabled = false;
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
        // Smooth follow with lerp for buttery movement
        const followSmoothing = 1.0 - Math.pow(0.001, deltaTime);
        currentCamPos.lerp(transform.position, followSmoothing);
        currentCamTarget.lerp(transform.target, followSmoothing);

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
  } else if (isPostSequence) {
    // Post-sequence: smoothly lerp camera to (0, 0, 25) looking at (0, 0, 0)
    if (!isPaused) {
      postSeqTimer += realDeltaTime;
    }
    const postSeqDuration = 3.0; // 3 seconds for the final camera sweep
    const t = smoothstep(Math.min(postSeqTimer / postSeqDuration, 1.0));
    
    const finalCamPos = new THREE.Vector3(0, 0, 25);
    const finalCamTarget = new THREE.Vector3(0, 0, 0);
    const finalUp = new THREE.Vector3(0, 1, 0);
    
    // Lerp camera position and target
    currentCamPos.lerpVectors(transitionStartPos, finalCamPos, t);
    currentCamTarget.lerpVectors(transitionStartTarget, finalCamTarget, t);
    camera.up.lerpVectors(transitionStartUp, finalUp, t).normalize();
    camera.position.copy(currentCamPos);
    camera.lookAt(currentCamTarget);
    
    // Fade in cursive text and cylinder
    globeMaterial.opacity = THREE.MathUtils.lerp(globeMaterial.opacity, 0.35, 0.02);
    orbitMaterial.opacity = THREE.MathUtils.lerp(orbitMaterial.opacity, 0.45, 0.02);
    
    // Fade in the cursive name
    if (cursivePlane) {
      cursivePlane.material.opacity = THREE.MathUtils.lerp(cursivePlane.material.opacity, 0.9, 0.03);
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
    
    // Enable orbit controls once camera reaches final position
    if (t >= 0.95) {
      controls.enabled = true;
      controls.target.copy(finalCamTarget);
      controls.update();
    } else {
      controls.enabled = false;
    }
  } else {
    controls.enabled = true;
    controls.update();
  }

  renderer.render(scene, camera);
}

animate();

// --- Navigation Tab Click Handlers ---
// Tab-to-vehicle mapping: home→motorcycle(0), school→airplane(1), experience→car_v2(2), projects→boat(3), skills→racecar(5)
const tabToVehicleIndex = {
  'home': 0,
  'school': 1,
  'experience': 2,
  'projects': 3,
  'skills': 5
};

const navTabs = document.querySelectorAll('.nav-tab');
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabClass = [...tab.classList].find(c => tabToVehicleIndex[c] !== undefined);
    
    if (tab.classList.contains('resume')) {
      // Resume tab — open link (placeholder for now)
      window.open('http://localhost', '_blank');
      return;
    }
    
    if (tabClass === undefined) return;
    
    const targetIndex = tabToVehicleIndex[tabClass];
    if (targetIndex === undefined || targetIndex >= orbitSequence.length) return;
    
    // Exit post-sequence state if active
    if (isPostSequence) {
      isPostSequence = false;
      isOrbitAnimating = true;
    }
    
    // Update active tab styling
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Switch to the target vehicle
    const targetSeq = orbitSequence[targetIndex];
    if (targetSeq && targetSeq.params) {
      // Skip if already on this vehicle and not in post-sequence
      if (currentSeqIndex === targetIndex && !isPostSequence) return;
      
      // Reset the target vehicle to its start position
      targetSeq.params.orbitDegrees = targetSeq.start;
      
      // If we're already following a vehicle, trigger a smooth camera transition
      if (currentSeqIndex !== targetIndex) {
        const prevSeq = orbitSequence[currentSeqIndex];
        
        // Capture current camera state for transition
        transitionStartPos.copy(camera.position);
        transitionStartTarget.copy(currentCamTarget);
        transitionStartUp.copy(camera.up);
        
        currentSeqIndex = targetIndex;
        syncCamGuiFromSequence();
        
        // Trigger camera transition
        isTransitioning = true;
        transitionProgress = 0;
        
        // Ensure previous vehicle is visible for fade-out (transition handles actual fade)
        const prevObj = prevSeq ? prevSeq.getObject() : null;
        const nextObj = targetSeq.getObject();
        if (prevObj) prevObj.visible = true;
        if (nextObj) {
          setOpacity(nextObj, 1.0);
        }
        
        // Re-enable orbit animation so the vehicle moves
        isOrbitAnimating = true;
      }
      
      // Update the target vehicle
      if (targetSeq.update) {
        targetSeq.update();
      }
    }
  });
});

// Set initial active tab
const homeTab = document.querySelector('.nav-tab.home');
if (homeTab) homeTab.classList.add('active');

