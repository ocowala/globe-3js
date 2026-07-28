import { scene, renderer, camera } from '../core/context.js';
import { STEP } from '../utils/geometry.js';
import { loadModelWithGUI, loadedCount, setAllAssetsLoaded, hoverScenes } from '../utils/loaders.js';

import { motorcycleCache, runMotorcycleRaycast, cityRoadMeshes, updateMotorcycle, loadMotorcycle } from './motorcycle.js';
import { boatCache, runBoatRaycast, beachGroundMeshes, updateBoat, loadBoat } from './boat.js';
import { broncoCache, runBroncoRaycast, desertGroundMeshes, updateBronco, loadBronco } from './bronco.js';
import { car2Cache, runCar2Raycast, landscapeMeshes, updateCar2, loadCar2, racecarCache, runRacecarRaycast, cafeMeshes, updateRacecar, loadRacecar } from './car.js';
import { updateAirplane, loadAirplane } from './airplane.js';

export let cacheVehicleIdx = 0;
export let cacheAngleIdx = 0;
export let fullyOptimized = false;
export let loaderFinishedTime = 0;

const cacheAngles = [];
const maxIndex = Math.ceil((Math.PI * 2) / STEP);
for (let idx = 0; idx <= maxIndex; idx++) {
  cacheAngles.push(idx * STEP);
}

export function loadAllVehicles(introActive = true) {
  loadMotorcycle(introActive);
  loadAirplane(introActive);
  loadBronco(introActive);
  loadBoat(introActive);
  loadCar2(introActive);
  loadRacecar(introActive);
}

export function loadAllEnvironments() {
  loadModelWithGUI('City', new URL('../../assets/models/city_at_night_v4_meshopt.glb', import.meta.url).href, {
    distance: 2.45, angle: 1.73, rotX: Math.PI / 2.0, rotY: 1.73, rotZ: -Math.PI / 2.0, posZ: 2.57, scale: 0.35
  });

  loadModelWithGUI('School', new URL('../../assets/models/school_v2_meshopt.glb', import.meta.url).href, {
    distance: 2.55, angle: 0.74, rotX: Math.PI / 2.0, rotY: -2.45, rotZ: Math.PI / 2, posZ: 2.83, scale: 0.12
  });

  loadModelWithGUI('Landscape', new URL('../../assets/models/landscape_v5_meshopt.glb', import.meta.url).href, {
    distance: 2.88, angle: -0.06, rotX: Math.PI / 2.0, rotY: Math.PI, rotZ: 0, posZ: 3.21, scale: 0.038, cylinderAlign: true
  });

  loadModelWithGUI('Beach', new URL('../../assets/models/beach_v2_meshopt.glb', import.meta.url).href, {
    distance: 2.8, angle: -0.95, rotX: Math.PI / 2.0, rotY: 0.62, rotZ: -Math.PI / 2.0, posZ: 2.49, scale: 1.53
  });

  loadModelWithGUI('Desert', new URL('../../assets/models/desert_v3_meshopt.glb', import.meta.url).href, {
    distance: 2.89, angle: -1.86, rotX: Math.PI / 2.0, rotY: -0.35, rotZ: Math.PI / 2.0, posZ: 2.23, scale: 0.17
  });

  loadModelWithGUI('Cafe', new URL('../../assets/models/cafe_meshopt.glb', import.meta.url).href, {
    distance: 2.44, angle: 3.1, rotX: 0, rotY: 0, rotZ: -0.2, posZ: 2.11, scale: 0.0265
  });
}

export function updateIncrementalCaching(introTimer, introParams, allAssetsLoaded, introActive) {
  if (loadedCount === 12 && !fullyOptimized) {
    try {
      const city = scene.getObjectByName('City');
      const beach = scene.getObjectByName('Beach');
      const desert = scene.getObjectByName('Desert');
      const landscape = scene.getObjectByName('Landscape');
      const cafe = scene.getObjectByName('Cafe');

      const cityVis = city ? city.visible : false;
      const beachVis = beach ? beach.visible : false;
      const desertVis = desert ? desert.visible : false;
      const landscapeVis = landscape ? landscape.visible : false;
      const cafeVis = cafe ? cafe.visible : false;

      if (city) city.visible = true;
      if (beach) beach.visible = true;
      if (desert) desert.visible = true;
      if (landscape) landscape.visible = true;
      if (cafe) cafe.visible = true;

      if (cacheAngleIdx === 0) {
        if (cacheVehicleIdx === 0 && city) city.updateMatrixWorld(true);
        if (cacheVehicleIdx === 1 && beach) beach.updateMatrixWorld(true);
        if (cacheVehicleIdx === 2 && desert) desert.updateMatrixWorld(true);
        if (cacheVehicleIdx === 3 && landscape) landscape.updateMatrixWorld(true);
        if (cacheVehicleIdx === 4 && cafe) cafe.updateMatrixWorld(true);
      }

      const writeProgress = Math.min(introTimer / Math.max(introParams.writeTime || 1.4, 0.1), 1.0);
      const batchSize = (!allAssetsLoaded) ? 120 : ((introActive && writeProgress < 1.0) ? 5 : 35);
      let processed = 0;

      while (processed < batchSize && cacheVehicleIdx < 5) {
        const a = cacheAngles[cacheAngleIdx];
        const idx = Math.round(a / STEP);

        if (cacheVehicleIdx === 0) {
          if (!motorcycleCache.has(idx)) motorcycleCache.set(idx, runMotorcycleRaycast(a, true));
        } else if (cacheVehicleIdx === 1) {
          if (!boatCache.has(idx)) boatCache.set(idx, runBoatRaycast(a, true));
        } else if (cacheVehicleIdx === 2) {
          if (!broncoCache.has(idx)) broncoCache.set(idx, runBroncoRaycast(a, true));
        } else if (cacheVehicleIdx === 3) {
          if (!car2Cache.has(idx)) car2Cache.set(idx, runCar2Raycast(a, true));
        } else if (cacheVehicleIdx === 4) {
          if (!racecarCache.has(idx)) racecarCache.set(idx, runRacecarRaycast(a, true));
        }

        processed++;
        cacheAngleIdx++;

        if (cacheAngleIdx >= cacheAngles.length) {
          cacheAngleIdx = 0;
          cacheVehicleIdx++;
        }
      }

      if (!allAssetsLoaded) {
        const totalCached = cacheVehicleIdx * cacheAngles.length + cacheAngleIdx;
        const totalToCache = 5 * cacheAngles.length;
        const cachingPct = (totalCached / totalToCache) * 20;
        const totalPct = Math.min(99, Math.round(80 + cachingPct));
        const pctEl = document.getElementById('loader-percent');
        if (pctEl) {
          pctEl.innerText = totalPct + '%';
        }
      }

      if (city) city.visible = cityVis;
      if (beach) beach.visible = beachVis;
      if (desert) desert.visible = desertVis;
      if (landscape) landscape.visible = landscapeVis;
      if (cafe) cafe.visible = cafeVis;

      if (cacheVehicleIdx >= 5) {
        fullyOptimized = true;
        if (city) city.visible = true;
        if (beach) beach.visible = true;
        if (desert) desert.visible = true;
        if (landscape) landscape.visible = true;
        if (cafe) cafe.visible = true;

        const school = scene.getObjectByName('School');
        if (school) school.visible = true;
        renderer.compile(scene, camera);

        if (city) city.visible = false;
        if (beach) beach.visible = false;
        if (desert) desert.visible = false;
        if (landscape) landscape.visible = false;
        if (cafe) cafe.visible = false;
        if (school) school.visible = false;

        setAllAssetsLoaded(true);
        loaderFinishedTime = performance.now();
        const pctEl = document.getElementById('loader-percent');
        if (pctEl) {
          pctEl.innerText = '100%';
        }
      }
    } catch (err) {
      console.warn("Exception in background pre-caching loop:", err);
      fullyOptimized = true;
      setAllAssetsLoaded(true);
      loaderFinishedTime = performance.now();
    }
  }
}

export function updateVehicles(activeWheelSpeedFactor = 1.0, onUpdateSceneTextboxes = null) {
  updateMotorcycle(activeWheelSpeedFactor, onUpdateSceneTextboxes);
  updateBoat(onUpdateSceneTextboxes);
  updateAirplane(onUpdateSceneTextboxes);
  updateBronco(activeWheelSpeedFactor, onUpdateSceneTextboxes);
  updateCar2(activeWheelSpeedFactor, onUpdateSceneTextboxes);
  updateRacecar(activeWheelSpeedFactor, onUpdateSceneTextboxes);
}
