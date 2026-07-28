import * as THREE from 'three';
import { scene, _tempEuler, _tempQuat1, _tempQuat2, _tempAxisZ } from '../core/context.js';
import { cylinderParams } from '../core/constants.js';
import { getSnappedData } from '../utils/geometry.js';
import { rawLoader, prepareMesh, incrementLoadedCount, hoverScenes } from '../utils/loaders.js';

export let boatObject = null;
export let boatRadialOffset = null;
export function setBoatRadialOffset(val) { boatRadialOffset = val; }

export const _boatRaycaster = new THREE.Raycaster();
export const boatCache = new Map();
export const beachGroundMeshes = [];

export const boatParams = {
  distance: 2.75,
  height: 3.0,
  angle: -0.94,
  orbitDegrees: 20,
  scale: 1.5,
  rotX: -Math.PI / 2.0,
  rotY: 2.9,
  rotZ: 1.55,
  speed: 7,
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.0,
  textboxOffsetZ: 0.0,
  textboxRotX: Math.PI / 2.0,
  textboxRotY: -Math.PI / 2.0,
  textboxRotZ: 0.0
};

export function runBoatRaycast(angle) {
  let posRadius = boatParams.distance;
  const posZ = boatParams.height;
  let localHitNormal = null;
  let valid = false;

  try {
    if (beachGroundMeshes.length > 0) {
      valid = true;
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
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

  return { posRadius, localHitNormal: localHitNormal ? localHitNormal.clone() : null, valid };
}

export function updateBoat(onUpdateSceneTextboxes = null) {
  if (!boatObject) return;

  const orbitRad = THREE.MathUtils.degToRad(boatParams.orbitDegrees);
  const currentAngle = boatParams.angle + orbitRad;
  const posZ = boatParams.height;

  const snapped = getSnappedData(boatCache, runBoatRaycast, currentAngle);
  const hoverData = hoverScenes['Beach'];
  const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;
  const posRadius = snapped.posRadius + hoverOffset;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  boatObject.position.set(x, y, posZ);

  const BOAT_REF_ANGLE = -0.94;
  const totalAngularDelta = (boatParams.angle - BOAT_REF_ANGLE) + orbitRad;
  _tempEuler.set(boatParams.rotX, boatParams.rotY, boatParams.rotZ);
  _tempQuat1.setFromEuler(_tempEuler);
  _tempQuat2.setFromAxisAngle(_tempAxisZ, totalAngularDelta);

  boatObject.quaternion.copy(_tempQuat2).multiply(_tempQuat1);
  boatObject.scale.setScalar(boatParams.scale);

  if (onUpdateSceneTextboxes) {
    onUpdateSceneTextboxes('Beach', boatParams.angle, boatParams.height, boatCache, runBoatRaycast, hoverOffset, boatParams);
  }
}

export function loadBoat(introActive = true) {
  rawLoader.load(new URL('../../assets/models/boat.glb', import.meta.url).href, (gltf) => {
    const model = gltf.scene;
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

    boatObject = model;
    if (introActive) {
      model.visible = false;
    }
    updateBoat();
    scene.add(model);
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error('Boat load failed:', error);
  });
}
