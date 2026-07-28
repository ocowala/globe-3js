import * as THREE from 'three';
import { camera, controls, _camTransformResult, _camTransformResultPosition, _camTransformResultTarget, _camTransformResultUp, _tempV3_1, _tempV3_2, _tempV3_3, _tempV3_4 } from '../core/context.js';

import { motorcycleGroup, motorcycleParams, updateMotorcycle } from '../vehicles/motorcycle.js';
import { boatObject, boatParams, updateBoat } from '../vehicles/boat.js';
import { broncoGroup, broncoParams, updateBronco } from '../vehicles/bronco.js';
import { car2Object, car2Params, updateCar2, racecarObject, racecarParams, updateRacecar } from '../vehicles/car.js';
import { airplaneGroup, airplaneParams, updateAirplane } from '../vehicles/airplane.js';

export const orbitSequence = [
  { name: 'Motorcycle', update: (speed, cb) => updateMotorcycle(speed, cb), params: motorcycleParams, start: 20, end: -30, getObject: () => motorcycleGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: 1.74 },
  { name: 'Airplane', update: (speed, cb) => updateAirplane(cb), params: airplaneParams, start: 20, end: -15, getObject: () => airplaneGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: 0.74 },
  { name: 'Car V2', update: (speed, cb) => updateCar2(speed, cb), params: car2Params, start: 22, end: -12, getObject: () => car2Object, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -0.12 },
  { name: 'Boat', update: (speed, cb) => updateBoat(cb), params: boatParams, start: 20, end: -23, getObject: () => boatObject, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -0.94 },
  { name: 'Bronco', update: (speed, cb) => updateBronco(speed, cb), params: broncoParams, start: 15, end: -40, getObject: () => broncoGroup, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -1.86 },
  { name: 'Racecar', update: (speed, cb) => updateRacecar(speed, cb), params: racecarParams, start: 8, end: -40, getObject: () => racecarObject, camOffset: new THREE.Vector3(2.5, 3.1, -1.8), lookOffset: new THREE.Vector3(0, 0, 0), refAngle: -3.05 }
];

export let currentSeqIndex = 0;
export function setCurrentSeqIndex(idx) { currentSeqIndex = idx; }

export let orbitDegreesPerSecond = 5;
export let isOrbitAnimating = true;
export function setIsOrbitAnimating(val) { isOrbitAnimating = val; }

export let cameraFollowEnabled = true;
export function setCameraFollowEnabled(val) { cameraFollowEnabled = val; }

export const defaultCamPos = new THREE.Vector3(7.5, 0.8, 1.2);
export const defaultCamTarget = new THREE.Vector3(0, 0, 0);

export let isTransitioning = false;
export function setIsTransitioning(val) { isTransitioning = val; }

export let transitionProgress = 0;
export function setTransitionProgress(val) { transitionProgress = val; }

export const transitionDuration = 1.2;
export const transitionStartPos = new THREE.Vector3();
export const transitionEndPos = new THREE.Vector3();
export const transitionStartTarget = new THREE.Vector3();
export const transitionEndTarget = new THREE.Vector3();
export const transitionStartUp = new THREE.Vector3();
export let transitionStartFOV = 38;

export const currentCamPos = new THREE.Vector3().copy(defaultCamPos);
export const currentCamTarget = new THREE.Vector3().copy(defaultCamTarget);

export const camGuiState = {
  camOffsetX: 0, camOffsetY: 0, camOffsetZ: 0,
  lookOffsetX: 0, lookOffsetY: 0, lookOffsetZ: 0,
  activeVehicle: 'Airplane',
  paused: false,
  followCam: true,
  fov: 38,
  speed: 5
};

export function syncCamGuiFromSequence() {
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

export function applyCamGuiToSequence() {
  const seq = orbitSequence[currentSeqIndex];
  if (!seq) return;
  seq.camOffset.set(camGuiState.camOffsetX, camGuiState.camOffsetY, camGuiState.camOffsetZ);
  seq.lookOffset.set(camGuiState.lookOffsetX, camGuiState.lookOffsetY, camGuiState.lookOffsetZ);
  seq.params.speed = camGuiState.velocity;
}

orbitSequence.forEach(seq => {
  if (seq.params) {
    seq.params.orbitDegrees = seq.start;
  }
});

syncCamGuiFromSequence();

export function getVehicleCameraTransform(seq) {
  const obj = seq.getObject();
  if (!obj) return null;

  const vehiclePos = _tempV3_1;
  obj.getWorldPosition(vehiclePos);

  const orbitRad = THREE.MathUtils.degToRad(seq.params.orbitDegrees);
  const currentAngle = seq.params.angle + orbitRad;

  const radialDir = _tempV3_2.set(Math.cos(currentAngle), Math.sin(currentAngle), 0).normalize();
  const heightDir = _tempV3_3.set(0, 0, 1);
  const vehicleForward = _tempV3_4.set(-Math.sin(currentAngle), Math.cos(currentAngle), 0).normalize();

  _camTransformResultPosition.copy(vehiclePos)
    .addScaledVector(radialDir, seq.camOffset.x)
    .addScaledVector(heightDir, seq.camOffset.y)
    .addScaledVector(vehicleForward, seq.camOffset.z);

  _camTransformResultTarget.copy(vehiclePos)
    .addScaledVector(radialDir, seq.lookOffset.x)
    .addScaledVector(heightDir, seq.lookOffset.y)
    .addScaledVector(vehicleForward, seq.lookOffset.z);

  _camTransformResultUp.copy(radialDir);

  return _camTransformResult;
}

import { gui } from '../core/gui.js';

export const cameraRecordedState = {
  fov: 38,
  posX: 0.0,
  posY: 0.0,
  posZ: 0.0,
  rotX: 0.0,
  rotY: 0.0,
  rotZ: 0.0,
  lookX: 0.0,
  lookY: 0.0,
  lookZ: 0.0
};

let isUpdatingFromGUI = false;

export function updateCameraFromGUI() {
  if (isUpdatingFromGUI) return;
  isUpdatingFromGUI = true;

  camera.fov = cameraRecordedState.fov;
  camera.updateProjectionMatrix();

  camera.position.set(cameraRecordedState.posX, cameraRecordedState.posY, cameraRecordedState.posZ);
  controls.target.set(cameraRecordedState.lookX, cameraRecordedState.lookY, cameraRecordedState.lookZ);
  controls.update();

  isUpdatingFromGUI = false;
}

export function syncGUIFromCamera() {
  if (isUpdatingFromGUI) return;
  isUpdatingFromGUI = true;

  cameraRecordedState.fov = Math.round(camera.fov * 100) / 100;
  cameraRecordedState.posX = Math.round(camera.position.x * 100) / 100;
  cameraRecordedState.posY = Math.round(camera.position.y * 100) / 100;
  cameraRecordedState.posZ = Math.round(camera.position.z * 100) / 100;

  cameraRecordedState.rotX = Math.round(camera.rotation.x * 100) / 100;
  cameraRecordedState.rotY = Math.round(camera.rotation.y * 100) / 100;
  cameraRecordedState.rotZ = Math.round(camera.rotation.z * 100) / 100;

  cameraRecordedState.lookX = Math.round(controls.target.x * 100) / 100;
  cameraRecordedState.lookY = Math.round(controls.target.y * 100) / 100;
  cameraRecordedState.lookZ = Math.round(controls.target.z * 100) / 100;

  isUpdatingFromGUI = false;
}

const camFolder = gui.addFolder('Camera Follow');
camFolder.add(camGuiState, 'paused').name('⏸ Pause').onChange((val) => {
  isOrbitAnimating = !val;
});
camFolder.add(camGuiState, 'followCam').name('Follow Camera').onChange((val) => {
  cameraFollowEnabled = val;
});
camFolder.add(camGuiState, 'fov', 10, 120).step(1).name('FOV').onChange((val) => {
  camera.fov = val;
  camera.updateProjectionMatrix();
});
camFolder.add(camGuiState, 'speed', 1, 60).step(1).name('Orbit Speed').onChange((val) => {
  orbitDegreesPerSecond = val;
});
camFolder.add(camGuiState, 'velocity', 1, 60).step(1).name('Velocity').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'activeVehicle').name('Vehicle').listen();
camFolder.add(camGuiState, 'camOffsetX', -10, 10).step(0.1).name('Radial Out').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'camOffsetY', -10, 10).step(0.1).name('Height Up').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'camOffsetZ', -10, 10).step(0.1).name('Forward').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'lookOffsetX', -10, 10).step(0.1).name('Look Radial').onChange(applyCamGuiToSequence);
camFolder.add(camGuiState, 'lookOffsetY', -10, 10).step(0.1).name('Look Height').onChange(applyCamGuiToSequence).listen();
camFolder.add(camGuiState, 'lookOffsetZ', -10, 10).step(0.1).name('Look Forward').onChange(applyCamGuiToSequence).listen();
camFolder.open();

const recordedFolder = camFolder.addFolder('Recorded Transform');
recordedFolder.add(cameraRecordedState, 'posX').step(0.01).name('Pos X').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'posY').step(0.01).name('Pos Y').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'posZ').step(0.01).name('Pos Z').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'rotX').step(0.01).name('Rot X').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'rotY').step(0.01).name('Rot Y').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'rotZ').step(0.01).name('Rot Z').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'lookX').step(0.01).name('Look At X').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'lookY').step(0.01).name('Look At Y').onChange(updateCameraFromGUI).listen();
recordedFolder.add(cameraRecordedState, 'lookZ').step(0.01).name('Look At Z').onChange(updateCameraFromGUI).listen();
recordedFolder.open();
