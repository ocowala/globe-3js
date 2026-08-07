import * as THREE from 'three';
import { AsciiRenderer } from './ascii.js';
import { buildWorldRing } from './ring.js';
import { VIEW_R } from './terrain.js';

const ROTATION_SPEED = 0.12; // rad/s, counter-clockwise

const canvasEl = document.getElementById('world-canvas');
const worldLink = document.getElementById('world-link');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// World-fixed lights (not children of the rotating ring) so shading sweeps across the
// terrain and props as the ring turns, rather than staying static relative to the ring.
const ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(4, 6, 8);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.55);
fillLight.position.set(-5, -3, 5);
scene.add(fillLight);

const { group: ringGroup, update: updateRing } = buildWorldRing();
scene.add(ringGroup);

// Dev-time safety net: AsciiRenderer's ID pass reads userData.idMaterial off every mesh to
// know its exact biome family. A mesh built without going through palette.js's
// makeBiomeMesh/ringIdMaterial would silently keep showing its lit material during that
// pass instead — this catches that at the source rather than as a rendering artifact.
if (import.meta.env.DEV) {
  let untagged = 0;
  ringGroup.traverse((obj) => {
    if (obj.isMesh && !obj.userData.idMaterial) untagged++;
  });
  if (untagged > 0) {
    console.warn(`[ascii-world] ${untagged} mesh(es) in the ring have no idMaterial and will misreport their family in the ASCII colour pass.`);
  }
}

const camera = new THREE.OrthographicCamera(-VIEW_R, VIEW_R, VIEW_R, -VIEW_R, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const asciiRenderer = new AsciiRenderer();
canvasEl.appendChild(asciiRenderer.domElement);

function resize() {
  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  if (w === 0 || h === 0) return;

  asciiRenderer.setSize(w, h);

  // Frustum derived from the renderer's actual character-cell grid (not raw canvas
  // pixels) so a circle renders as a circle regardless of the (non-square) cell aspect.
  const aspect = asciiRenderer.gridAspect;
  let halfW = VIEW_R * aspect;
  let halfH = VIEW_R;
  if (halfW < VIEW_R) {
    halfW = VIEW_R;
    halfH = VIEW_R / aspect;
  }
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvasEl);
resize();

canvasEl.addEventListener('mouseenter', () => worldLink.classList.add('is-visible'));
canvasEl.addEventListener('mouseleave', () => worldLink.classList.remove('is-visible'));

let lastTime = performance.now();
let elapsed = 0;
let hasRenderedOnce = false;

function animate() {
  requestAnimationFrame(animate);

  if (document.hidden) {
    lastTime = performance.now();
    return;
  }

  if (reduceMotion && hasRenderedOnce) {
    lastTime = performance.now();
    return;
  }

  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += deltaTime;

  if (!reduceMotion) {
    ringGroup.rotation.z += ROTATION_SPEED * deltaTime;
  }
  updateRing(elapsed);

  asciiRenderer.render(scene, camera, elapsed);
  hasRenderedOnce = true;
}

animate();
