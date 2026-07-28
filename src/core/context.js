import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const container = document.getElementById('canvas-container');
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });

export const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
export const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isHandheldDevice = isMobile || isIOSDevice;

// Radial nav hiding logic on non-handheld devices
const radialNavOnLoad = document.getElementById('radial-nav');
if (!isHandheldDevice && radialNavOnLoad) {
  radialNavOnLoad.style.display = 'none';
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2.0));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
if (container) {
  container.appendChild(renderer.domElement);
}

export let canvasRect = null;
export function updateCanvasRect() {
  if (renderer && renderer.domElement) {
    canvasRect = renderer.domElement.getBoundingClientRect();
  }
}
updateCanvasRect();

document.body.classList.remove('dark');
document.body.style.background = '';

// Pre-allocated variables to prevent GC allocations during animations/renders
export const _tempQuat1 = new THREE.Quaternion();
export const _tempQuat2 = new THREE.Quaternion();
export const _tempQuat3 = new THREE.Quaternion();
export const _tempQuat4 = new THREE.Quaternion();
export const _tempEuler = new THREE.Euler();
export const _tempAxisZ = new THREE.Vector3(0, 0, 1);
export const _tempAxisX = new THREE.Vector3(1, 0, 0);
export const _tempV3_1 = new THREE.Vector3();
export const _tempV3_2 = new THREE.Vector3();
export const _tempV3_3 = new THREE.Vector3();
export const _tempV3_4 = new THREE.Vector3();
export const _tempV3_5 = new THREE.Vector3();
export const _tempV3_6 = new THREE.Vector3();
export const _tempV3_7 = new THREE.Vector3();
export const _tempV3_8 = new THREE.Vector3();
export const _tempMatrix = new THREE.Matrix4();

export const _camTransformResultPosition = new THREE.Vector3();
export const _camTransformResultTarget = new THREE.Vector3();
export const _camTransformResultUp = new THREE.Vector3();
export const _camTransformResult = {
  position: _camTransformResultPosition,
  target: _camTransformResultTarget,
  up: _camTransformResultUp
};

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(7.5, 0.8, 1.2);
camera.lookAt(0, 0, 0);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.minDistance = 2;
controls.maxDistance = 100;
controls.autoRotate = false;
controls.enableRotate = true;
controls.rotateSpeed = 0.4;

export const ambientLight = new THREE.AmbientLight(0xfff6ea, 0.8);
scene.add(ambientLight);

export const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

export const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemiLight);
