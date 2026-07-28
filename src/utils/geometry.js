import * as THREE from 'three';
import { scene, _tempV3_7 } from '../core/context.js';
import { cylinderParams } from '../core/constants.js';

export let globe = null;
export let orbitRing = null;

export const globeMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8d9c4,
  roughness: 0.85,
  metalness: 0.05,
  transparent: true,
  opacity: 0.0,
  emissive: 0x271d1a,
  emissiveIntensity: 0.02
});

export const orbitMaterial = new THREE.MeshBasicMaterial({
  color: 0xf3e3d6,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide
});

export function createThickCylinderGeometry(innerRadius, outerRadius, height) {
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

  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

export function buildCylinder(introActive = false, onBuildCallback = null) {
  const outerR = cylinderParams.radius;
  const innerR = outerR * cylinderParams.wallRatio;
  const height = cylinderParams.height;

  if (globe) scene.remove(globe);
  if (orbitRing) scene.remove(orbitRing);

  const globeGeometry = createThickCylinderGeometry(innerR, outerR, height);
  globeGeometry.translate(0, 0, 4 - height);
  globe = new THREE.Mesh(globeGeometry, globeMaterial);
  globe.matrixAutoUpdate = false;
  globe.updateMatrix();
  scene.add(globe);

  const orbitHeight = height - 0.02;
  const orbitGeometry = createThickCylinderGeometry(innerR * 0.985, outerR * 1.005, orbitHeight);
  orbitGeometry.translate(0, 0, 4 - height + 0.01);
  orbitRing = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbitRing.matrixAutoUpdate = false;
  orbitRing.updateMatrix();
  scene.add(orbitRing);

  if (introActive) {
    globe.visible = false;
    orbitRing.visible = false;
  }

  if (onBuildCallback) {
    onBuildCallback();
  }
}

import { gui } from '../core/gui.js';

const cylFolder = gui.addFolder('Cylinder Background');
cylFolder.add(cylinderParams, 'radius', 1.0, 10.0).step(0.05).name('Outer Radius').onChange(() => buildCylinder(false));
cylFolder.add(cylinderParams, 'wallRatio', 0.1, 0.99).step(0.01).name('Wall Ratio').onChange(() => buildCylinder(false));
cylFolder.add(cylinderParams, 'height', 0.1, 10.0).step(0.05).name('Height').onChange(() => buildCylinder(false));
cylFolder.open();

export function createRingSectorGeometry(innerR, outerR, thetaLength, segments = 32) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const uvs = [];
  const indices = [];

  const halfTheta = thetaLength / 2;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = halfTheta * (1 - 2 * t);

    // Inner vertex
    const xInner = innerR * Math.cos(angle);
    const yInner = innerR * Math.sin(angle);
    vertices.push(xInner, yInner, 0);
    uvs.push(t, 0);

    // Outer vertex
    const xOuter = outerR * Math.cos(angle);
    const yOuter = outerR * Math.sin(angle);
    vertices.push(xOuter, yOuter, 0);
    uvs.push(t, 1);
  }

  for (let i = 0; i < segments; i++) {
    const vi = i * 2;
    indices.push(vi, vi + 1, vi + 2);
    indices.push(vi + 1, vi + 3, vi + 2);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export const STEP = 0.02;

export function getSnappedData(cache, raycastFn, angle) {
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
      const res = raycastFn(idx_low * STEP);
      if (res.valid) {
        cache.set(idx_low, res);
      } else {
        return { posRadius: res.posRadius, localHitNormal: res.localHitNormal };
      }
    }
    const cached = cache.get(idx_low);
    return { posRadius: cached.posRadius, localHitNormal: cached.localHitNormal };
  }

  let data_low;
  if (!cache.has(idx_low)) {
    const res = raycastFn(idx_low * STEP);
    if (res.valid) {
      cache.set(idx_low, res);
      data_low = res;
    } else {
      data_low = res;
    }
  } else {
    data_low = cache.get(idx_low);
  }

  let data_high;
  if (!cache.has(idx_high)) {
    const res = raycastFn(idx_high * STEP);
    if (res.valid) {
      cache.set(idx_high, res);
      data_high = res;
    } else {
      data_high = res;
    }
  } else {
    data_high = cache.get(idx_high);
  }

  const posRadius = THREE.MathUtils.lerp(data_low.posRadius, data_high.posRadius, t);
  let localHitNormal = null;
  if (data_low.localHitNormal && data_high.localHitNormal) {
    localHitNormal = _tempV3_7.lerpVectors(data_low.localHitNormal, data_high.localHitNormal, t).normalize();
  } else if (data_low.localHitNormal) {
    localHitNormal = data_low.localHitNormal;
  } else if (data_high.localHitNormal) {
    localHitNormal = data_high.localHitNormal;
  }

  return { posRadius, localHitNormal };
}
