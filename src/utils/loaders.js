import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { scene, renderer, _tempQuat1, _tempQuat2, _tempEuler, _tempAxisZ, _tempAxisX } from '../core/context.js';

export const loader = new GLTFLoader();
export const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

export const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/');
ktx2Loader.detectSupport(renderer);

export const rawLoader = new GLTFLoader();
rawLoader.setKTX2Loader(ktx2Loader);

loader.setKTX2Loader(ktx2Loader);

export let loadedCount = 0;
export let allAssetsLoaded = false;

export function incrementLoadedCount() {
  loadedCount++;
  checkAllAssetsLoaded();
}

export function setAllAssetsLoaded(val) {
  allAssetsLoaded = val;
}

export function checkAllAssetsLoaded() {
  const pctEl = document.getElementById('loader-percent');
  if (loadedCount < 12) {
    if (pctEl) {
      const pct = Math.round((loadedCount / 12) * 80);
      pctEl.innerText = pct + '%';
    }
  } else if (loadedCount === 12 && !allAssetsLoaded) {
    if (pctEl) {
      pctEl.innerText = '80%';
    }
    console.log("All 12 assets loaded, starting incremental caching during loading screen...");
  }
}

export function setOpacity(obj, opacityVal) {
  if (!obj) return;
  if (opacityVal <= 0) {
    obj.visible = false;
    return;
  }
  obj.visible = true;
  obj.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        const origOpacity = mat.userData.originalOpacity !== undefined ? mat.userData.originalOpacity : 1.0;
        mat.opacity = origOpacity * opacityVal;
      });
    }
  });
}

export function prepareMesh(child, isVehicle = false) {
  if (child.isMesh) {
    if (!isVehicle) {
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }
    if (child.material) {
      if (child.material.metalness !== undefined && child.material.metalness > 0.1) {
        child.material.metalness = 0.1;
      }
      if (child.material.roughness !== undefined && child.material.roughness < 0.4) {
        child.material.roughness = 0.4;
      }

      if (isVehicle) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          mat.transparent = true;
          if (mat.userData.originalOpacity === undefined) {
            mat.userData.originalOpacity = mat.opacity !== undefined ? mat.opacity : 1.0;
          }
        });
      }
    }
  }
}

export function loadModelWithGUI(name, url, defaults) {
  const params = { ...defaults };
  let obj = null;

  let lastDistance = defaults.distance;
  let lastAngle = defaults.angle;
  let lastPosZ = defaults.posZ;
  let lastScale = defaults.scale;
  let lastRotX = defaults.rotX;
  let lastRotY = defaults.rotY;
  let lastRotZ = defaults.rotZ;

  function update() {
    if (!obj) return;
    const hoverData = hoverScenes[name];
    const hoverOffset = hoverData ? (hoverData.current * hoverData.maxProtrusion) : 0.0;
    const activeDistance = params.distance + hoverOffset;
    const x = activeDistance * Math.cos(params.angle);
    const y = activeDistance * Math.sin(params.angle);
    obj.position.set(x, y, params.posZ);

    if (params.cylinderAlign) {
      _tempQuat1.setFromAxisAngle(_tempAxisZ, params.angle);
      _tempQuat2.setFromAxisAngle(_tempAxisX, Math.PI / 2);
      _tempQuat1.multiply(_tempQuat2);

      _tempEuler.set(params.rotX, params.rotY, params.rotZ);
      _tempQuat2.setFromEuler(_tempEuler);

      obj.quaternion.copy(_tempQuat1).multiply(_tempQuat2);
    } else {
      if (params.rotOrder) obj.rotation.order = params.rotOrder;
      obj.rotation.set(params.rotX, params.rotY, params.rotZ);
    }

    obj.scale.setScalar(params.scale);
    obj.updateMatrixWorld(true);

    const baseParamsChanged = (
      params.distance !== lastDistance ||
      params.angle !== lastAngle ||
      params.posZ !== lastPosZ ||
      params.scale !== lastScale ||
      params.rotX !== lastRotX ||
      params.rotY !== lastRotY ||
      params.rotZ !== lastRotZ
    );

    if (baseParamsChanged) {
      lastDistance = params.distance;
      lastAngle = params.angle;
      lastPosZ = params.posZ;
      lastScale = params.scale;
      lastRotX = params.rotX;
      lastRotY = params.rotY;
      lastRotZ = params.rotZ;
    }
  }

  loader.load(url, (gltf) => {
    const model = gltf.scene;
    model.name = name;

    model.traverse((child) => {
      prepareMesh(child, false);
    });

    obj = model;
    update();
    scene.add(model);
    loadedEnvironments[name] = { model, update, params };
    incrementLoadedCount();
  }, undefined, (error) => {
    console.error(`${name} load failed:`, error);
  });
}

export const hoverScenes = {
  'City': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'School': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Landscape': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Beach': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Desert': { target: 0.0, current: 0.0, maxProtrusion: 0.8 },
  'Cafe': { target: 0.0, current: 0.0, maxProtrusion: 0.8 }
};
export const loadedEnvironments = {};
