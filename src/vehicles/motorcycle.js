import * as THREE from 'three';
import { scene, _tempEuler, _tempQuat1, _tempQuat2, _tempAxisZ } from '../core/context.js';
import { cylinderParams } from '../core/constants.js';
import { getSnappedData } from '../utils/geometry.js';
import { rawLoader, prepareMesh, incrementLoadedCount, hoverScenes } from '../utils/loaders.js';

export let motorcycleGroup = null;
export let motorcycleWheelBL = null;
export let motorcycleWheelFL = null;
export let motorcycleRadialOffset = null;
export function setMotorcycleRadialOffset(val) { motorcycleRadialOffset = val; }

export const _motoRaycaster = new THREE.Raycaster();
export const motorcycleCache = new Map();
export const cityRoadMeshes = [];

export const motorcycleParams = {
  distance: 2.57,
  angle: 1.9,
  height: 3.8,
  orbitDegrees: 20,
  scale: 0.32,
  rotX: Math.PI / 2.0,
  rotY: -3.05,
  rotZ: -1.2,
  wheelSpeed: 0.5,
  speed: 8,
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.0,
  textboxOffsetZ: 0.0,
  textboxRotX: Math.PI / 2.0,
  textboxRotY: Math.PI / 2.0,
  textboxRotZ: 0.0
};

export function runMotorcycleRaycast(angle) {
  let posRadius = motorcycleParams.distance;
  const posZ = motorcycleParams.height;
  let valid = false;

  try {
    if (cityRoadMeshes.length > 0) {
      valid = true;
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

  return { posRadius, localHitNormal: null, valid };
}

export function updateMotorcycle(activeWheelSpeedFactor = 1.0, onUpdateSceneTextboxes = null) {
  if (!motorcycleGroup) return;

  const orbitRad = THREE.MathUtils.degToRad(motorcycleParams.orbitDegrees);
  const currentAngle = motorcycleParams.angle + orbitRad;
  const posZ = motorcycleParams.height;

  const snapped = getSnappedData(motorcycleCache, runMotorcycleRaycast, currentAngle);
  const hoverData = hoverScenes['City'];
  const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;
  const posRadius = snapped.posRadius + hoverOffset;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  motorcycleGroup.position.set(x, y, posZ);

  const MOTO_REF_ANGLE = 1.74;
  const totalAngularDelta = (motorcycleParams.angle - MOTO_REF_ANGLE) + orbitRad;
  _tempEuler.set(motorcycleParams.rotX, motorcycleParams.rotY, motorcycleParams.rotZ);
  _tempQuat1.setFromEuler(_tempEuler);
  _tempQuat2.setFromAxisAngle(_tempAxisZ, totalAngularDelta);

  motorcycleGroup.quaternion.copy(_tempQuat2).multiply(_tempQuat1);
  motorcycleGroup.scale.setScalar(motorcycleParams.scale);

  if (motorcycleWheelBL) motorcycleWheelBL.rotation.x += motorcycleParams.wheelSpeed * activeWheelSpeedFactor;
  if (motorcycleWheelFL) motorcycleWheelFL.rotation.x += motorcycleParams.wheelSpeed * activeWheelSpeedFactor;

  if (onUpdateSceneTextboxes) {
    onUpdateSceneTextboxes('City', motorcycleParams.angle, motorcycleParams.height, motorcycleCache, runMotorcycleRaycast, hoverOffset, motorcycleParams);
  }
}

export function loadMotorcycle(introActive = true) {
  rawLoader.load(new URL('../../assets/models/motorcycle.glb', import.meta.url).href, (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      prepareMesh(child, true);
    });

    motorcycleWheelBL = model.getObjectByName('wheel_BL');
    motorcycleWheelFL = model.getObjectByName('wheel_FL');

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
    if (introActive) {
      model.visible = false;
    }
    updateMotorcycle();
    scene.add(model);
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error('Motorcycle load failed:', error);
  });
}
