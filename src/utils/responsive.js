import { camera, renderer, updateCanvasRect } from '../core/context.js';
import { cylinderParams } from '../core/constants.js';

export function getResponsiveFOV() {
  const aspect = window.innerWidth / window.innerHeight;
  if (aspect < 1.0) {
    return 38 + (1.0 - aspect) * 45;
  }
  return 38;
}

export function getFocusFOV() {
  const aspect = window.innerWidth / window.innerHeight;
  if (aspect < 1.0) {
    return 22 + (1.0 - aspect) * 60;
  }
  return 22;
}

export function getCylinderMiddleZ() {
  return 4 - cylinderParams.height / 2;
}

export function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = getResponsiveFOV();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCanvasRect();
}
