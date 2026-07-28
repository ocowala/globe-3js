import * as THREE from 'three';
import { scene, _tempEuler, _tempQuat1, _tempQuat2, _tempAxisZ } from '../core/context.js';
import { rawLoader, prepareMesh, incrementLoadedCount, hoverScenes } from '../utils/loaders.js';

export let airplaneGroup = null;
export let propellerObject = null;

export const airplaneParams = {
  distance: 4.5,
  angle: 0.74,
  height: 2.8,
  orbitDegrees: 20,
  scale: 0.01,
  rotX: -Math.PI / 2.0,
  rotY: 2.4,
  rotZ: Math.PI / 2.0,
  propellerSpeed: 0.3,
  speed: 8,
  textboxScale: 0.5,
  textboxOffsetX: 0.0,
  textboxOffsetY: 2.0,
  textboxOffsetZ: -0.5,
  textboxRotX: 0.0,
  textboxRotY: 0.0,
  textboxRotZ: 0.0
};

export function updateAirplane(onUpdateSceneTextboxes = null) {
  if (!airplaneGroup) return;

  const orbitRad = THREE.MathUtils.degToRad(airplaneParams.orbitDegrees);
  const currentAngle = airplaneParams.angle + orbitRad;

  const hoverData = hoverScenes['School'];
  const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;
  const posRadius = airplaneParams.distance + hoverOffset;
  const posZ = airplaneParams.height;

  const x = posRadius * Math.cos(currentAngle);
  const y = posRadius * Math.sin(currentAngle);
  airplaneGroup.position.set(x, y, posZ);

  const PLANE_REF_ANGLE = 0.74;
  const totalAngularDelta = (airplaneParams.angle - PLANE_REF_ANGLE) + orbitRad;

  _tempEuler.set(airplaneParams.rotX, airplaneParams.rotY, airplaneParams.rotZ);
  _tempQuat1.setFromEuler(_tempEuler);
  _tempQuat2.setFromAxisAngle(_tempAxisZ, totalAngularDelta);

  airplaneGroup.quaternion.copy(_tempQuat2).multiply(_tempQuat1);
  airplaneGroup.scale.setScalar(airplaneParams.scale);

  if (propellerObject) propellerObject.rotation.z += airplaneParams.propellerSpeed;

  if (onUpdateSceneTextboxes) {
    onUpdateSceneTextboxes('School', airplaneParams.angle, airplaneParams.height, null, null, hoverOffset, airplaneParams);
  }
}

export function loadAirplane(introActive = true) {
  rawLoader.load(new URL('../../assets/models/airplane.glb', import.meta.url).href, (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.name === 'propeller') {
        propellerObject = child;
        if (child.geometry) {
          child.geometry.computeBoundingBox();
          const center = new THREE.Vector3();
          child.geometry.boundingBox.getCenter(center);
          child.geometry.translate(-center.x, -center.y, -center.z);
          child.position.add(center);
        }
      }
      prepareMesh(child, true);
    });

    airplaneGroup = model;
    if (introActive) {
      model.visible = false;
    }
    updateAirplane();
    scene.add(model);
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error('Airplane load failed:', error);
  });
}

import { gui } from '../core/gui.js';
import { addTextboxGUI } from '../ui/textboxManager.js';

const planeFolder = gui.addFolder('Airplane');
planeFolder.add(airplaneParams, 'distance', 1.0, 8.0).step(0.001).name('DistanceOffset').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'height', -10.0, 10.0).step(0.01).name('HeightOffset').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'angle', -Math.PI, Math.PI).step(0.01).name('Base Angle').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'orbitDegrees', -360, 360).step(1).name('Orbit (°)').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'scale', 0.001, 1.0).step(0.001).name('Scale').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rotation X').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rotation Y').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rotation Z').onChange(updateAirplane);
planeFolder.add(airplaneParams, 'propellerSpeed', 0, 1.0).step(0.01).name('Propeller Speed');
planeFolder.add(airplaneParams, 'speed', 1.0, 30.0).step(0.1).name('Speed').onChange(updateAirplane);
addTextboxGUI(planeFolder, airplaneParams, updateAirplane, 'School');
planeFolder.open();
