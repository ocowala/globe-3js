import * as THREE from 'three';
import { scene, _tempEuler, _tempQuat1, _tempQuat2, _tempQuat3, _tempQuat4, _tempAxisZ, _tempV3_1 } from '../core/context.js';
import { cylinderParams } from '../core/constants.js';
import { getSnappedData } from '../utils/geometry.js';
import { rawLoader, prepareMesh, incrementLoadedCount, hoverScenes } from '../utils/loaders.js';

export let broncoGroup = null;
export let broncoWheelFL = null;
export let broncoWheelFR = null;
export let broncoWheelsFront = null;
export let broncoWheelsRear = null;
export let broncoRadialOffset = null;
export function setBroncoRadialOffset(val) { broncoRadialOffset = val; }

export const _broncoRaycaster = new THREE.Raycaster();
export const broncoCache = new Map();
export const desertGroundMeshes = [];

export const broncoParams = {
  distance: 3,
  angle: -1.86,
  height: 3.42,
  orbitDegrees: 15,
  scale: 0.15,
  rotX: Math.PI / 2.0,
  rotY: 1.2,
  rotZ: Math.PI / 2.0,
  wheelSpeed: 0.05,
  speed: 7,
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.0,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: Math.PI,
  textboxRotZ: 0.0
};

export function runBroncoRaycast(angle) {
  let posRadius = broncoParams.distance;
  const posZ = broncoParams.height;
  let localHitNormal = null;
  let valid = false;

  try {
    if (desertGroundMeshes.length > 0) {
      valid = true;
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

  return { posRadius, localHitNormal: localHitNormal ? localHitNormal.clone() : null, valid };
}

export function updateBronco(activeWheelSpeedFactor = 1.0, onUpdateSceneTextboxes = null) {
  if (!broncoGroup) return;

  const orbitRad = THREE.MathUtils.degToRad(broncoParams.orbitDegrees);
  const currentAngle = broncoParams.angle + orbitRad;
  const posZ = broncoParams.height;

  const snapped = getSnappedData(broncoCache, runBroncoRaycast, currentAngle);
  const hoverData = hoverScenes['Desert'];
  const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;
  const posRadius = snapped.posRadius + hoverOffset;
  const localHitNormal = snapped.localHitNormal;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  broncoGroup.position.set(x, y, posZ);

  const BRONCO_REF_ANGLE = -1.86;
  const totalAngularDelta = (broncoParams.angle - BRONCO_REF_ANGLE) + orbitRad;
  _tempEuler.set(broncoParams.rotX, broncoParams.rotY, broncoParams.rotZ);
  _tempQuat1.setFromEuler(_tempEuler);
  _tempQuat2.setFromAxisAngle(_tempAxisZ, totalAngularDelta);

  _tempQuat3.copy(_tempQuat2).multiply(_tempQuat1);

  if (localHitNormal) {
    const cylinderNormal = _tempV3_1.set(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();
    const alignQuat = _tempQuat4.setFromUnitVectors(cylinderNormal, localHitNormal);
    _tempQuat3.copy(alignQuat).multiply(_tempQuat2).multiply(_tempQuat1);
  }

  broncoGroup.quaternion.copy(_tempQuat3);
  broncoGroup.scale.setScalar(broncoParams.scale);

  if (broncoWheelFL) broncoWheelFL.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;
  if (broncoWheelFR) broncoWheelFR.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;
  if (broncoWheelsFront) broncoWheelsFront.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;
  if (broncoWheelsRear) broncoWheelsRear.rotation.x += broncoParams.wheelSpeed * activeWheelSpeedFactor;

  if (onUpdateSceneTextboxes) {
    onUpdateSceneTextboxes('Desert', broncoParams.angle, broncoParams.height, broncoCache, runBroncoRaycast, hoverOffset, broncoParams);
  }
}

export function loadBronco(introActive = true) {
  rawLoader.load(new URL('../../assets/models/bronco.glb', import.meta.url).href, (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      prepareMesh(child, true);
    });

    broncoWheelFL = model.getObjectByName('wheel_FL');
    broncoWheelFR = model.getObjectByName('wheel_FR');
    broncoWheelsFront = model.getObjectByName('wheels_front');
    broncoWheelsRear = model.getObjectByName('wheels_rear');

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
    if (introActive) {
      model.visible = false;
    }
    updateBronco();
    scene.add(model);
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error('Bronco load failed:', error);
  });
}
