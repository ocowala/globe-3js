import * as THREE from 'three';
import { scene } from '../core/context.js';

export let starsMaterial = null;
export let starsPoints = null;

export function initStarfield() {
  const starCount = 160;
  const positions = new Float32Array(starCount * 3);
  const radius = 120; // sphere shell outside the globe

  for (let i = 0; i < starCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }

  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.0,
    sizeAttenuation: false
  });

  starsPoints = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starsPoints);
}

export function updateStarfield(targetOpacity, transitionSpeed, currentTime) {
  if (starsMaterial) {
    const twinkle = 0.5 + 0.3 * Math.sin(currentTime * 0.003);
    starsMaterial.opacity = targetOpacity * twinkle;
  }
}
