import * as THREE from 'three';
import { scene, _tempEuler, _tempQuat1, _tempQuat2, _tempQuat3, _tempAxisZ, _tempV3_1, _tempV3_2, _tempV3_3, _tempV3_4 } from '../core/context.js';
import { cylinderParams } from '../core/constants.js';
import { getSnappedData } from '../utils/geometry.js';
import { rawLoader, prepareMesh, incrementLoadedCount, hoverScenes } from '../utils/loaders.js';

export let car2Object = null;
export let car2WheelFL = null;
export let car2WheelFR = null;
export let car2WheelBL = null;
export let car2WheelBR = null;
export const car2Cache = new Map();
export const landscapeMeshes = [];

export const car2Params = {
  distance: 2.725,
  height: 3.2,
  angle: -0.2,
  orbitDegrees: 22,
  scale: 0.15,
  rotX: -Math.PI / 2.0,
  rotY: -3.0,
  rotZ: Math.PI / 2.0,
  wheelSpeed: 0.05,
  speed: 7,
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.0,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
  textboxRotZ: 0.0
};

export function runCar2Raycast(angle) {
  let posRadius = car2Params.distance;
  const pathZ = car2Params.height;
  let valid = false;

  try {
    if (landscapeMeshes.length > 0) {
      valid = true;
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const rayOrigin = new THREE.Vector3(0, 0, pathZ);
      const rayDir = radialDir.clone().normalize();

      const _rc = new THREE.Raycaster();
      _rc.set(rayOrigin, rayDir);
      _rc.far = 15.0;
      _rc.near = 0;

      const hits = _rc.intersectObjects(landscapeMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        posRadius = hitRadius + (car2Params.distance - cylinderParams.radius);
      }
    }
  } catch (err) {
    console.warn("Error in runCar2Raycast:", err);
  }

  const minRadius = cylinderParams.radius + 0.05;
  if (posRadius < minRadius) {
    posRadius = minRadius;
  }

  return { posRadius, localHitNormal: null, valid };
}

export function updateCar2(activeWheelSpeedFactor = 1.0, onUpdateSceneTextboxes = null) {
  if (!car2Object) return;

  const orbitRad = THREE.MathUtils.degToRad(car2Params.orbitDegrees);
  const currentAngle = car2Params.angle + orbitRad;
  const pathZ = car2Params.height;

  const hoverData = hoverScenes['Landscape'];
  const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;

  const deltaAngle = 0.06;
  const frontAngle = currentAngle + deltaAngle;
  const rearAngle = currentAngle - deltaAngle;

  const frontSnapped = getSnappedData(car2Cache, runCar2Raycast, frontAngle);
  const rearSnapped = getSnappedData(car2Cache, runCar2Raycast, rearAngle);

  const frontRadius = frontSnapped.posRadius + hoverOffset;
  const rearRadius = rearSnapped.posRadius + hoverOffset;

  const frontPos = _tempV3_1.set(frontRadius * Math.cos(frontAngle), frontRadius * Math.sin(frontAngle), pathZ);
  const rearPos = _tempV3_2.set(rearRadius * Math.cos(rearAngle), rearRadius * Math.sin(rearAngle), pathZ);

  const centerPos = _tempV3_3.addVectors(frontPos, rearPos).multiplyScalar(0.5);
  car2Object.position.copy(centerPos);

  const forward = _tempV3_4.subVectors(frontPos, rearPos).normalize();
  const roadAngle = Math.atan2(forward.y, forward.x) - Math.PI / 2;

  const CAR2_REF_ANGLE = -0.12;
  const totalAngularDelta = (roadAngle - car2Params.angle) + (car2Params.angle - CAR2_REF_ANGLE);

  _tempEuler.set(car2Params.rotX, car2Params.rotY, car2Params.rotZ);
  _tempQuat1.setFromEuler(_tempEuler);
  _tempQuat2.setFromAxisAngle(_tempAxisZ, totalAngularDelta);

  _tempQuat3.copy(_tempQuat2).multiply(_tempQuat1);

  car2Object.quaternion.copy(_tempQuat3);
  car2Object.scale.setScalar(car2Params.scale);

  if (car2WheelFL) car2WheelFL.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;
  if (car2WheelFR) car2WheelFR.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;
  if (car2WheelBL) car2WheelBL.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;
  if (car2WheelBR) car2WheelBR.rotation.x += car2Params.wheelSpeed * activeWheelSpeedFactor;

  if (onUpdateSceneTextboxes) {
    onUpdateSceneTextboxes('Landscape', car2Params.angle, car2Params.height, car2Cache, runCar2Raycast, hoverOffset, car2Params);
  }
}

export function loadCar2(introActive = true) {
  rawLoader.load(new URL('../../assets/models/car_v2.glb', import.meta.url).href, (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      prepareMesh(child, true);
    });

    car2WheelFL = model.getObjectByName('wheel_FL');
    car2WheelFR = model.getObjectByName('wheel_FR');
    car2WheelBL = model.getObjectByName('wheel_BL');
    car2WheelBR = model.getObjectByName('wheel_BR');

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
    if (introActive) {
      model.visible = false;
    }
    updateCar2();
    scene.add(model);
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error('Car V2 load failed:', error);
  });
}

// --- Racecar (SLS AMG) ---
export let racecarObject = null;
export let racecarWheelFL = null;
export let racecarWheelFR = null;
export let racecarWheelBL = null;
export let racecarWheelBR = null;
export const racecarCache = new Map();
export const cafeMeshes = [];

export const racecarParams = {
  distance: 2.51,
  height: 3.7,
  angle: -3.05,
  orbitDegrees: 8,
  scale: 15.0,
  rotX: -Math.PI / 2.0,
  rotY: -0.03,
  rotZ: Math.PI / 2.0,
  wheelSpeed: 0.1,
  speed: 7,
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 0.03,
  textboxOffsetZ: 0.0,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
  textboxRotZ: 0.0
};

export function runRacecarRaycast(angle) {
  let posRadius = racecarParams.distance;
  const pathZ = racecarParams.height;
  let valid = false;

  try {
    if (cafeMeshes.length > 0) {
      valid = true;
      const radialDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const rayOrigin = new THREE.Vector3(0, 0, pathZ);
      const rayDir = radialDir.clone().normalize();

      const _rc = new THREE.Raycaster();
      _rc.set(rayOrigin, rayDir);
      _rc.far = 15.0;
      _rc.near = 0;

      const hits = _rc.intersectObjects(cafeMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const hitRadius = Math.sqrt(hit.point.x * hit.point.x + hit.point.y * hit.point.y);
        posRadius = hitRadius + (racecarParams.distance - cylinderParams.radius);
      }
    }
  } catch (err) {
    console.warn("Error in runRacecarRaycast:", err);
  }

  const minRadius = cylinderParams.radius + 0.05;
  if (posRadius < minRadius) {
    posRadius = minRadius;
  }

  return { posRadius, localHitNormal: null, valid };
}

export function updateRacecar(activeWheelSpeedFactor = 1.0, onUpdateSceneTextboxes = null) {
  if (!racecarObject) return;

  const orbitRad = THREE.MathUtils.degToRad(racecarParams.orbitDegrees);
  const currentAngle = racecarParams.angle + orbitRad;
  const pathZ = racecarParams.height;

  const hoverData = hoverScenes['Cafe'];
  const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;

  const deltaAngle = 0.07;
  const frontAngle = currentAngle + deltaAngle;
  const rearAngle = currentAngle - deltaAngle;

  const frontSnapped = getSnappedData(racecarCache, runRacecarRaycast, frontAngle);
  const rearSnapped = getSnappedData(racecarCache, runRacecarRaycast, rearAngle);

  const frontRadius = frontSnapped.posRadius + hoverOffset;
  const rearRadius = rearSnapped.posRadius + hoverOffset;

  const frontPos = _tempV3_1.set(frontRadius * Math.cos(frontAngle), frontRadius * Math.sin(frontAngle), pathZ);
  const rearPos = _tempV3_2.set(rearRadius * Math.cos(rearAngle), rearRadius * Math.sin(rearAngle), pathZ);

  const centerPos = _tempV3_3.addVectors(frontPos, rearPos).multiplyScalar(0.5);
  racecarObject.position.copy(centerPos);

  const forward = _tempV3_4.subVectors(frontPos, rearPos).normalize();
  const roadAngle = Math.atan2(forward.y, forward.x) - Math.PI / 2;

  const RACECAR_REF_ANGLE = -3.05;
  const totalAngularDelta = (roadAngle - racecarParams.angle) + (racecarParams.angle - RACECAR_REF_ANGLE);

  _tempEuler.set(racecarParams.rotX, racecarParams.rotY, racecarParams.rotZ);
  _tempQuat1.setFromEuler(_tempEuler);
  _tempQuat2.setFromAxisAngle(_tempAxisZ, totalAngularDelta);

  _tempQuat3.copy(_tempQuat2).multiply(_tempQuat1);

  racecarObject.quaternion.copy(_tempQuat3);
  racecarObject.scale.setScalar(racecarParams.scale);

  if (racecarWheelFL) racecarWheelFL.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;
  if (racecarWheelFR) racecarWheelFR.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;
  if (racecarWheelBL) racecarWheelBL.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;
  if (racecarWheelBR) racecarWheelBR.rotation.x += racecarParams.wheelSpeed * activeWheelSpeedFactor;

  if (onUpdateSceneTextboxes) {
    onUpdateSceneTextboxes('Cafe', racecarParams.angle, racecarParams.height, racecarCache, runRacecarRaycast, hoverOffset, racecarParams);
  }
}

export function loadRacecar(introActive = true) {
  rawLoader.load(new URL('../../assets/models/sls_amg_63_black_series.glb', import.meta.url).href, (gltf) => {
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

    racecarWheelFL = model.getObjectByName('wheel_FL');
    racecarWheelFR = model.getObjectByName('wheel_FR');
    racecarWheelBL = model.getObjectByName('wheel_BL');
    racecarWheelBR = model.getObjectByName('wheel_BR');

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
    if (introActive) {
      model.visible = false;
    }
    updateRacecar();
    scene.add(model);
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error('Racecar load failed:', error);
  });
}
