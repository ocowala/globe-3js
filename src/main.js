import * as THREE from 'three';
import { scene, camera, renderer, controls, ambientLight, directionalLight, isHandheldDevice } from './core/context.js';
import { dat, DummyGUI } from './core/gui.js';
import { cylinderParams } from './core/constants.js';
import { buildCylinder, globeMaterial, orbitMaterial, globe, orbitRing, smoothstep } from './utils/geometry.js';
import { loadedCount, allAssetsLoaded, setOpacity, loadModelWithGUI, hoverScenes, loadedEnvironments } from './utils/loaders.js';
import { getResponsiveFOV, getFocusFOV, getCylinderMiddleZ, onWindowResize } from './utils/responsive.js';
import { starsMaterial, initStarfield, updateStarfield } from './environment/starfield.js';
import { activeBackdropMode, updateDayNightCycle } from './environment/dayNight.js';
import { cursivePlane, initCursivePlane, drawCursiveName, introParams } from './environment/cursiveIntro.js';
import { motorcycleGroup, motorcycleParams, updateMotorcycle } from './vehicles/motorcycle.js';
import { boatObject, boatParams, updateBoat } from './vehicles/boat.js';
import { broncoGroup, broncoParams, updateBronco } from './vehicles/bronco.js';
import { car2Object, car2Params, updateCar2, racecarObject, racecarParams, updateRacecar } from './vehicles/car.js';
import { airplaneGroup, airplaneParams, updateAirplane } from './vehicles/airplane.js';
import {
  loadAllVehicles, loadAllEnvironments, updateIncrementalCaching, updateVehicles,
  fullyOptimized, loaderFinishedTime
} from './vehicles/vehicleManager.js';
import {
  sceneTextboxes, selectedTextbox, selectTextbox, deselectTextbox,
  initStaticTextboxes, updateSceneTextboxes, navLabelConfig,
  textboxFocusState, textboxFocusTimer, setTextboxFocusTimer, setTextboxFocusState,
  TEXTBOX_FOCUS_DURATION, textboxFocusTargetPos, textboxFocusTargetLookAt, textboxFocusTargetUp,
  textboxFocusLerpStartPos, textboxFocusLerpStartTarget, textboxFocusLerpStartUp,
  textboxFocusLerpStartFOV, textboxFocusPrePos, textboxFocusPreTarget, textboxFocusPreUp,
  textboxFocusPreFOV
} from './ui/textboxManager.js';
import {
  navLabels, activeNavIndex, setActiveNavIndex, initNavLabels,
  updateNavLabelPositions, updateNavLabelCanvas, highlightNavLabel
} from './ui/navLabels.js';
import { bindRadialNavButtons } from './ui/radialNav.js';
import { initInfoTooltipDeviceSpecific } from './ui/tooltip.js';
import {
  orbitSequence, currentSeqIndex, setCurrentSeqIndex,
  orbitDegreesPerSecond, isOrbitAnimating, setIsOrbitAnimating,
  cameraFollowEnabled, isTransitioning, setIsTransitioning,
  transitionProgress, setTransitionProgress, transitionDuration,
  transitionStartPos, transitionEndPos, transitionStartTarget, transitionEndTarget,
  transitionStartUp, transitionStartFOV, currentCamPos, currentCamTarget,
  getVehicleCameraTransform, syncCamGuiFromSequence, camGuiState
} from './camera/cameraManager.js';
import { initAudioController } from './media/audioController.js';
import {
  isMovieTransitionActive, movieTransitionState, movieTransitionTimer,
  setMovieTransitionTimer, setMovieTransitionState, setIsMovieTransitionActive,
  movieTransitionStartPos, movieTransitionStartTarget, movieTransitionStartUp,
  movieTransitionStartQuat, movieTransitionEndQuat, exitMovieView, wasBgAudioPlaying
} from './media/moviePlayer.js';
import {
  initInputHandlers, updatePostSeqNavRotation, isVehicleHeld, isDraggingMobileNav,
  dragStartPointerX, dragStartAngle, mobileNavSelectionTimeout,
  dragOmegaSpeed, mobileNavDragHoldTimer, mobileNavResumeDelayTimer,
  orbitSwipeStartPointerY, orbitSwipeStartPointerX, isTrackingOrbitSwipe,
  isResumeHovered, isTextboxHovered
} from './events/inputHandler.js';

// --- State Variables ---
let introActive = true;
let introTimer = 0;
let unwriteTimer = 0;
let isPostSequence = false;
let postSeqTimer = 0;
let postSeqAngle = 0;
let sequenceEverCompleted = false;
let loaderOverlayHidden = false;

let writePauseTimer = 0;
let unwritePauseTimer = 0;
let introFinaleActive = false;
let introFinaleTimer = 0;
let activeWheelSpeedFactor = 1.0;
let transitionStartGlobeOpacity = 1.0;
let transitionStartOrbitOpacity = 0.45;
let transitionStartCursiveOpacity = 0.0;

let introTransitionProgress = 0;
let isIntroTransitioning = false;
const introTransitionStartPos = new THREE.Vector3();
const introTransitionStartTarget = new THREE.Vector3();
const introTransitionStartUp = new THREE.Vector3();

let lastWriteProgress = -1;
let lastUnwriteProgress = -1;
let navLabelsVisible = false;
let hoverTimeoutTimer = 0;
let lastTime = performance.now();

const vehicleSceneMap = {
  'Motorcycle': 'City',
  'Airplane': 'School',
  'Car V2': 'Landscape',
  'Boat': 'Beach',
  'Bronco': 'Desert',
  'Racecar': 'Cafe'
};

// Setup initial scene objects & components
initStarfield();
buildCylinder(introActive);
initCursivePlane();
loadAllEnvironments();
loadAllVehicles(introActive);
initStaticTextboxes();
initNavLabels();

initAudioController();
initInfoTooltipDeviceSpecific();

// Helper Functions
function getSectorIndexFromVehicleIndex(vehicleIdx) {
  if (vehicleIdx >= 0 && vehicleIdx <= 5) return vehicleIdx;
  return -1;
}

function updateBackgroundVisibility() {
  const activeAngles = [];
  const currentSeq = orbitSequence[currentSeqIndex];
  if (currentSeq && currentSeq.params) {
    const orbitRad = THREE.MathUtils.degToRad(currentSeq.params.orbitDegrees);
    activeAngles.push(currentSeq.params.angle + orbitRad);
  }

  if (isTransitioning) {
    const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
    const prevSeq = orbitSequence[prevIndex];
    if (prevSeq && prevSeq.params) {
      const orbitRad = THREE.MathUtils.degToRad(prevSeq.params.orbitDegrees);
      activeAngles.push(prevSeq.params.angle + orbitRad);
    }
  }

  let focusedBgName = null;
  if (selectedTextbox) {
    for (const name in sceneTextboxes) {
      const found = sceneTextboxes[name].some(tb => tb === selectedTextbox);
      if (found) {
        focusedBgName = name;
        break;
      }
    }
  }

  const bgNames = ['City', 'School', 'Landscape', 'Beach', 'Desert', 'Cafe'];
  bgNames.forEach(name => {
    const model = scene.getObjectByName(name);
    if (model) {
      const bgAngle = Math.atan2(model.position.y, model.position.x);
      const isClose = activeAngles.some(activeAngle => {
        let diff = Math.abs(activeAngle - bgAngle) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff < 1.95;
      });

      if (focusedBgName && name === focusedBgName) {
        model.visible = true;
      } else {
        model.visible = isClose;
      }

      const textboxes = sceneTextboxes[name];
      if (textboxes) {
        textboxes.forEach((tb) => {
          const isSelected = (tb === selectedTextbox);
          tb.mesh.visible = ((model.visible || isClose) && !introActive && (isOrbitAnimating || isSelected));
        });
      }
    }
  });
}

function returnToFinale() {
  if (isPostSequence) return;
  introActive = false;
  isIntroTransitioning = false;
  introFinaleActive = false;
  isPostSequence = true;
  setIsOrbitAnimating(false);
  setIsTransitioning(false);
  sequenceEverCompleted = true;
  postSeqTimer = 0;

  if (globe) globe.visible = true;
  if (orbitRing) orbitRing.visible = true;

  transitionStartPos.copy(camera.position);
  transitionStartTarget.copy(currentCamTarget);
  transitionStartUp.copy(camera.up);

  if (cursivePlane) {
    cursivePlane.visible = true;
    cursivePlane.rotation.set(0, 0, 0);
    cursivePlane.position.set(0, 0, getCylinderMiddleZ());
    cursivePlane.material.opacity = 0.0;
    drawCursiveName(1.0, 0.0);
  }
}

function triggerNavigation(navIdx) {
  if (navIdx < 0 || navIdx >= navLabelConfig.length) return;

  if (selectedTextbox) {
    deselectTextbox();
  }

  const config = navLabelConfig[navIdx];
  const targetIndex = config.vehicleIdx;
  if (targetIndex === undefined || targetIndex >= orbitSequence.length) return;

  introActive = false;
  isIntroTransitioning = false;
  introFinaleActive = false;

  if (isPostSequence) {
    isPostSequence = false;
    setIsOrbitAnimating(true);
    controls.autoRotate = false;
    globeMaterial.opacity = 0.35;
    orbitMaterial.opacity = 0.45;
    if (cursivePlane) {
      cursivePlane.visible = false;
    }
  }

  navLabels.forEach((entry) => {
    entry.targetOpacity = 0.75;
    entry.targetScale = 1.0;
  });

  for (const name in hoverScenes) {
    hoverScenes[name].target = 0.0;
  }

  sequenceEverCompleted = false;

  const targetSeq = orbitSequence[targetIndex];
  if (targetSeq && targetSeq.params) {
    targetSeq.params.orbitDegrees = targetSeq.start;

    transitionStartPos.copy(camera.position);
    transitionStartTarget.copy(currentCamTarget);
    transitionStartUp.copy(camera.up);

    setCurrentSeqIndex(targetIndex);
    syncCamGuiFromSequence();

    setIsTransitioning(true);
    setTransitionProgress(0);
    setIsOrbitAnimating(true);

    const nextObj = targetSeq.getObject();
    if (nextObj) {
      setOpacity(nextObj, 1.0);
    }
    if (targetSeq.update) {
      targetSeq.update();
    }
  }
}

// Bind Events & UI Callbacks
bindRadialNavButtons((idx) => triggerNavigation(idx));
initInputHandlers({
  get introActive() { return introActive; },
  get isIntroTransitioning() { return isIntroTransitioning; },
  get isPostSequence() { return isPostSequence; },
  get postSeqAngle() { return postSeqAngle; },
  set postSeqAngle(v) { postSeqAngle = v; },
  get introFinaleActive() { return introFinaleActive; },
  set introFinaleActive(v) { introFinaleActive = v; },
  get introFinaleTimer() { return introFinaleTimer; },
  set introFinaleTimer(v) { introFinaleTimer = v; },
  get activeNavIndex() { return activeNavIndex; },
  set activeNavIndex(v) { setActiveNavIndex(v); },
  get hoverTimeoutTimer() { return hoverTimeoutTimer; },
  set hoverTimeoutTimer(v) { hoverTimeoutTimer = v; },
  cameraFollowEnabled
}, {
  triggerNavigation,
  returnToFinale,
  getSectorIndexFromVehicleIndex,
  togglePause: () => {
    camGuiState.paused = !camGuiState.paused;
    setIsOrbitAnimating(!camGuiState.paused);
  }
});

// --- Main Frame Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const realDeltaTime = Math.min((currentTime - lastTime) / 1000, 1.0);
  const deltaTime = Math.min(realDeltaTime, 0.05);
  lastTime = currentTime;

  updateDayNightCycle(currentTime, realDeltaTime, {
    allAssetsLoaded,
    introActive,
    isIntroTransitioning,
    isOrbitAnimating,
    selectedTextbox,
    currentSeqIndex,
    activeNavIndex,
    orbitSequence
  }, (color) => {
    drawCursiveName(1.0, 0.0, color);
  });

  if (globeMaterial) {
    const targets = { dark: document.body.classList.contains('dark') };
    const targetCylinderColor = targets.dark ? new THREE.Color(0x141c24) : new THREE.Color(0xe8d9c4);
    const targetEmissiveColor = targets.dark ? new THREE.Color(0x05080c) : new THREE.Color(0x271d1a);
    const transitionSpeed = Math.min(2.0 * realDeltaTime, 1.0);
    globeMaterial.color.lerp(targetCylinderColor, transitionSpeed);
    globeMaterial.emissive.lerp(targetEmissiveColor, transitionSpeed);
  }

  const radialNav = document.getElementById('radial-nav');
  if (radialNav) {
    const shouldShow = isHandheldDevice && isPostSequence && !introActive && !isIntroTransitioning && !selectedTextbox;
    if (shouldShow) {
      radialNav.classList.add('show');
      const wheel = radialNav.querySelector('.radial-wheel');
      if (wheel) {
        wheel.style.transform = `rotate(${-activeNavIndex * 60}deg)`;
      }
      const nodes = radialNav.querySelectorAll('.radial-node');
      nodes.forEach((node, idx) => {
        if (idx === activeNavIndex) {
          node.classList.add('active');
        } else {
          node.classList.remove('active');
        }
      });
    } else {
      radialNav.classList.remove('show');
    }
  }

  const hoverSpeed = 10.0;
  for (const name in hoverScenes) {
    const sceneData = hoverScenes[name];
    if (!isPostSequence) {
      sceneData.target = 0.0;
    }
    const prevVal = sceneData.current;
    sceneData.current += (sceneData.target - sceneData.current) * hoverSpeed * realDeltaTime;
    if (Math.abs(sceneData.target - sceneData.current) < 0.001) {
      sceneData.current = sceneData.target;
    }
    if (sceneData.current !== prevVal) {
      const env = loadedEnvironments[name];
      if (env && env.update) {
        env.update();
      }
    }
  }

  const isPaused = camGuiState && camGuiState.paused;
  const isIntroState = introActive || isIntroTransitioning;

  if (isVehicleHeld) {
    activeWheelSpeedFactor = Math.max(0.0, activeWheelSpeedFactor - realDeltaTime * 4.0);
  } else {
    activeWheelSpeedFactor = Math.min(1.0, activeWheelSpeedFactor + realDeltaTime * 3.0);
  }

  updateIncrementalCaching(introTimer, introParams, allAssetsLoaded, introActive);

  const now = performance.now();
  const showWriting = allAssetsLoaded && (now - loaderFinishedTime >= 200);

  if (showWriting && !loaderOverlayHidden) {
    loaderOverlayHidden = true;
    const loaderOverlay = document.getElementById('loading-overlay');
    if (loaderOverlay) {
      loaderOverlay.classList.add('fade-out');
    }
  }

  if (introActive) {
    if (!isPaused && fullyOptimized && showWriting) {
      const targetWriteTime = Math.max(introParams.writeTime || 1.4, 0.1);
      if (introTimer < targetWriteTime) {
        introTimer += realDeltaTime;
      } else {
        introTimer = targetWriteTime;
        if (writePauseTimer < 0.3) {
          writePauseTimer += realDeltaTime;
        } else {
          const targetUnwriteTime = Math.max(introParams.unwriteTime || 1.4, 0.1);
          if (unwriteTimer < targetUnwriteTime) {
            unwriteTimer += realDeltaTime;
          } else {
            unwriteTimer = targetUnwriteTime;
            if (unwritePauseTimer < 0.3) {
              unwritePauseTimer += realDeltaTime;
            } else {
              introActive = false;
              isPostSequence = true;
              introFinaleActive = true;
              introFinaleTimer = 0.0;
              postSeqTimer = 0.0;
              setIsOrbitAnimating(false);

              const infoHint = document.getElementById('info-hint');
              if (infoHint) {
                infoHint.classList.add('show');
                setTimeout(() => {
                  infoHint.classList.remove('show');
                }, 2000);
              }

              transitionStartPos.copy(camera.position);
              transitionStartTarget.set(0, 0, getCylinderMiddleZ());
              transitionStartUp.copy(camera.up);
              if (globe) globe.visible = true;
              if (orbitRing) orbitRing.visible = true;

              orbitSequence.forEach(seq => {
                const obj = seq.getObject();
                if (obj) {
                  obj.visible = true;
                  setOpacity(obj, 0.0);
                }
              });

              if (cursivePlane) {
                cursivePlane.visible = true;
                cursivePlane.rotation.set(0, 0, 0);
                cursivePlane.position.set(0, 0, getCylinderMiddleZ());
                cursivePlane.material.opacity = 0.0;
                drawCursiveName(1.0, 0.0);
              }
            }
          }
        }
      }
    }

    const writeProgress = (fullyOptimized && showWriting) ? Math.min(introTimer / Math.max(introParams.writeTime || 1.4, 0.1), 1.0) : 0.0;
    const unwriteProgress = (fullyOptimized && showWriting) ? Math.min(unwriteTimer / Math.max(introParams.unwriteTime || 1.4, 0.1), 1.0) : 0.0;

    if (writeProgress !== lastWriteProgress || unwriteProgress !== lastUnwriteProgress) {
      drawCursiveName(writeProgress, unwriteProgress);
      lastWriteProgress = writeProgress;
      lastUnwriteProgress = unwriteProgress;
    }
  }

  if (isOrbitAnimating && !isIntroState && !isPaused) {
    const currentSeq = orbitSequence[currentSeqIndex];
    if (currentSeq && currentSeq.params) {
      const direction = currentSeq.end > currentSeq.start ? 1 : -1;
      if (!isTransitioning && !isVehicleHeld) {
        currentSeq.params.orbitDegrees += direction * currentSeq.params.speed * deltaTime;
      }

      const earlyTriggerAngle = 5;
      let shouldTriggerTransition = false;

      if (direction === 1) {
        if (currentSeq.params.orbitDegrees >= currentSeq.end) {
          currentSeq.params.orbitDegrees = currentSeq.end;
        }
        if (!isTransitioning && currentSeq.params.orbitDegrees >= (currentSeq.end - earlyTriggerAngle)) {
          shouldTriggerTransition = true;
        }
      } else if (direction === -1) {
        if (currentSeq.params.orbitDegrees <= currentSeq.end) {
          currentSeq.params.orbitDegrees = currentSeq.end;
        }
        if (!isTransitioning && currentSeq.params.orbitDegrees <= (currentSeq.end + earlyTriggerAngle)) {
          shouldTriggerTransition = true;
        }
      }

      if (shouldTriggerTransition) {
        if (currentSeqIndex === orbitSequence.length - 1 && !sequenceEverCompleted) {
          isPostSequence = true;
          setIsOrbitAnimating(false);
          sequenceEverCompleted = true;
          postSeqTimer = 0;
          currentSeq.params.orbitDegrees = currentSeq.end;

          transitionStartPos.copy(camera.position);
          transitionStartTarget.copy(currentCamTarget);
          transitionStartUp.copy(camera.up);

          if (cursivePlane) {
            cursivePlane.visible = true;
            cursivePlane.rotation.set(0, 0, 0);
            cursivePlane.position.set(0, 0, getCylinderMiddleZ());
            cursivePlane.material.opacity = 0.0;
          }
        } else {
          const nextIndex = (currentSeqIndex + 1) % orbitSequence.length;
          const nextSeq = orbitSequence[nextIndex];
          if (nextSeq && nextSeq.params) {
            nextSeq.params.orbitDegrees = nextSeq.start;
          }

          setCurrentSeqIndex(nextIndex);
          syncCamGuiFromSequence();

          if (cameraFollowEnabled) {
            setIsTransitioning(true);
            setTransitionProgress(0);
            transitionStartPos.copy(camera.position);
            transitionStartTarget.copy(currentCamTarget);
            transitionStartUp.copy(camera.up);
          }
        }
      }
    }

    if (isTransitioning) {
      const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
      const prevSeq = orbitSequence[prevIndex];
      if (prevSeq && prevSeq.params && !isVehicleHeld) {
        const prevDirection = prevSeq.end > prevSeq.start ? 1 : -1;
        const easeOut = 0.2 + 0.8 * ((1.0 - transitionProgress) * (1.0 - transitionProgress));
        prevSeq.params.orbitDegrees += prevDirection * (prevSeq.params.speed * easeOut) * deltaTime;
        if (prevDirection === 1 && prevSeq.params.orbitDegrees > prevSeq.end) {
          prevSeq.params.orbitDegrees = prevSeq.end;
        } else if (prevDirection === -1 && prevSeq.params.orbitDegrees < prevSeq.end) {
          prevSeq.params.orbitDegrees = prevSeq.end;
        }
      }

      const activeSeq = orbitSequence[currentSeqIndex];
      if (activeSeq && activeSeq.params && !isVehicleHeld) {
        const activeDirection = activeSeq.end > activeSeq.start ? 1 : -1;
        const easeIn = 0.2 + 0.8 * (transitionProgress * transitionProgress);
        activeSeq.params.orbitDegrees += activeDirection * (activeSeq.params.speed * easeIn) * deltaTime;
        if (activeDirection === 1 && activeSeq.params.orbitDegrees > activeSeq.end) {
          activeSeq.params.orbitDegrees = activeSeq.end;
        } else if (activeDirection === -1 && activeSeq.params.orbitDegrees < activeSeq.end) {
          activeSeq.params.orbitDegrees = activeSeq.end;
        }
      }
    }
  }

  const activeIndices = new Set();
  activeIndices.add(currentSeqIndex);
  if (isTransitioning) {
    const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
    activeIndices.add(prevIndex);
  }

  if (!isIntroState) {
    activeIndices.forEach(idx => {
      const seq = orbitSequence[idx];
      if (seq && seq.update) {
        seq.update(activeWheelSpeedFactor, (name, angle, h, cache, fn, hover, p) => {
          updateSceneTextboxes(name, angle, h, cache, fn, hover, p);
        });
      }
    });
  }

  if (!isIntroState) {
    updateBackgroundVisibility();
  } else {
    const bgNames = ['City', 'School', 'Landscape', 'Beach', 'Desert', 'Cafe'];
    bgNames.forEach(name => {
      const model = scene.getObjectByName(name);
      if (model) model.visible = false;
    });
  }

  if (cursivePlane) {
    const shouldShowCursive = introActive || isIntroTransitioning || isPostSequence;
    if (cursivePlane.visible !== shouldShowCursive) {
      cursivePlane.visible = shouldShowCursive;
    }
  }

  if (introActive) {
    const aspect = window.innerWidth / window.innerHeight;
    const targetFOV = getResponsiveFOV();
    const introDist = aspect < 1.0 ? (1.8 / (aspect * Math.tan(THREE.MathUtils.degToRad(targetFOV / 2)))) : 1.8;
    camera.position.set(0, -introDist, 2.275);
    camera.lookAt(0, 0, 2.275);
    camera.up.set(0, 0, 1);
    controls.enabled = false;

    orbitSequence.forEach(seq => {
      const obj = seq.getObject();
      if (obj) {
        setOpacity(obj, 0.0);
      }
    });
  } else if (isIntroTransitioning) {
    if (!isPaused) {
      introTransitionProgress += realDeltaTime / 1.5;
    }
    const t = smoothstep(Math.min(introTransitionProgress, 1.0));
    const targetTransform = getVehicleCameraTransform(orbitSequence[0]);
    if (targetTransform) {
      camera.position.lerpVectors(introTransitionStartPos, targetTransform.position, t);
      const currentTarget = new THREE.Vector3().lerpVectors(introTransitionStartTarget, targetTransform.target, t);
      camera.lookAt(currentTarget);
      camera.up.lerpVectors(introTransitionStartUp, targetTransform.up, t).normalize();
    }

    globeMaterial.opacity = THREE.MathUtils.lerp(transitionStartGlobeOpacity, 0.35, t);
    orbitMaterial.opacity = THREE.MathUtils.lerp(transitionStartOrbitOpacity, 0.45, t);
    setOpacity(motorcycleGroup, t);

    if (cursivePlane) {
      cursivePlane.material.opacity = THREE.MathUtils.lerp(transitionStartCursiveOpacity, 0.0, t);
    }

    updateMotorcycle(activeWheelSpeedFactor, (name, angle, h, cache, fn, hover, p) => {
      updateSceneTextboxes(name, angle, h, cache, fn, hover, p);
    });

    if (introTransitionProgress >= 1.0) {
      isIntroTransitioning = false;
      currentCamPos.copy(camera.position);
      const finalTransform = getVehicleCameraTransform(orbitSequence[0]);
      if (finalTransform) {
        currentCamTarget.copy(finalTransform.target);
      }
      if (cursivePlane) {
        cursivePlane.visible = false;
        drawCursiveName(1.0, 0.0);
      }
    }
    controls.enabled = false;
  } else if (isMovieTransitionActive) {
    setMovieTransitionTimer(movieTransitionTimer + realDeltaTime);

    if (movieTransitionState === 'lerping_camera_to_p1') {
      const duration = 1.5;
      const t = smoothstep(Math.min(movieTransitionTimer / duration, 1.0));
      const targetPos = new THREE.Vector3(0.17, -28.06, 3.36);
      const targetLookAt = new THREE.Vector3(-0.26, -3.33, 3.2);

      camera.position.lerpVectors(movieTransitionStartPos, targetPos, t);
      const currentTarget = new THREE.Vector3().lerpVectors(movieTransitionStartTarget, targetLookAt, t);
      controls.target.copy(currentTarget);
      camera.quaternion.slerpQuaternions(movieTransitionStartQuat, movieTransitionEndQuat, t);

      if (movieTransitionTimer >= duration) {
        camera.position.copy(targetPos);
        camera.quaternion.copy(movieTransitionEndQuat);
        controls.target.copy(targetLookAt);
        controls.update();

        setMovieTransitionState('waiting_one_second');
        setMovieTransitionTimer(0.0);
      }
    } else if (movieTransitionState === 'waiting_one_second') {
      camera.position.set(0.17, -28.06, 3.36);
      camera.quaternion.copy(movieTransitionEndQuat);
      controls.target.set(-0.26, -3.33, 3.2);

      if (movieTransitionTimer >= 1.0) {
        setMovieTransitionState('fading_in_video');
        setMovieTransitionTimer(0.0);
      }
    } else if (movieTransitionState === 'fading_in_video') {
      camera.position.set(0.17, -28.06, 3.36);
      camera.quaternion.copy(movieTransitionEndQuat);
      controls.target.set(-0.26, -3.33, 3.2);

      const fadeDuration = 2.0;
      const progress = Math.min(movieTransitionTimer / fadeDuration, 1.0);
      const overlay = document.getElementById('video-overlay');
      if (overlay) {
        overlay.classList.add('active');
        overlay.style.opacity = progress;
      }

      if (movieTransitionTimer >= fadeDuration) {
        setMovieTransitionState('playing_video_lerping_to_p2');
        setMovieTransitionTimer(0.0);

        const movieVideo = document.getElementById('movie-video');
        if (movieVideo) {
          movieVideo.currentTime = 0;
          movieVideo.play().catch(err => console.error("Movie video play failed:", err));
        }

        const audio = document.getElementById('bg-audio');
        const songNameEl = document.getElementById('song-name');
        if (audio) {
          audio.currentTime = 0;
          audio.play().then(() => {
            if (songNameEl) {
              songNameEl.textContent = "howl's moving castle - hisaishi";
              songNameEl.classList.add('playing');
            }
          }).catch(err => console.error("Movie audio play failed:", err));
        }

        movieTransitionStartPos.set(0.17, -28.06, 3.36);
        movieTransitionStartTarget.set(-0.26, -3.33, 3.2);
        movieTransitionStartQuat.copy(movieTransitionEndQuat);

        const targetEulerP2 = new THREE.Euler(-1.17, 0.14, 0.31, 'XYZ');
        movieTransitionEndQuat.setFromEuler(targetEulerP2);
      }
    } else if (movieTransitionState === 'playing_video_lerping_to_p2') {
      const duration = 3.5;
      const t = smoothstep(Math.min(movieTransitionTimer / duration, 1.0));
      const targetPos = new THREE.Vector3(6.12, 22.97, 9.17);
      const targetLookAt = new THREE.Vector3(2.77, 0.45, -0.49);

      camera.position.lerpVectors(movieTransitionStartPos, targetPos, t);
      const currentTarget = new THREE.Vector3().lerpVectors(movieTransitionStartTarget, targetLookAt, t);
      controls.target.copy(currentTarget);
      camera.quaternion.slerpQuaternions(movieTransitionStartQuat, movieTransitionEndQuat, t);

      camera.fov = THREE.MathUtils.lerp(30, 61, t);
      camera.updateProjectionMatrix();

      const overlay = document.getElementById('video-overlay');
      if (overlay) {
        overlay.classList.add('active');
        overlay.style.opacity = 1.0;
      }

      if (movieTransitionTimer >= duration) {
        camera.position.copy(targetPos);
        camera.quaternion.copy(movieTransitionEndQuat);
        controls.target.copy(targetLookAt);
        camera.fov = 61;
        camera.updateProjectionMatrix();
        controls.update();

        camGuiState.fov = 61;
        setMovieTransitionState('waiting_for_video_end');
      }
    } else if (movieTransitionState === 'waiting_for_video_end') {
      camera.position.set(6.12, 22.97, 9.17);
      camera.quaternion.copy(movieTransitionEndQuat);
      controls.target.set(2.77, 0.45, -0.49);
      camera.fov = 61;

      const overlay = document.getElementById('video-overlay');
      if (overlay) {
        overlay.classList.add('active');
        overlay.style.opacity = 1.0;
      }

      const movieVideo = document.getElementById('movie-video');
      if (movieVideo && movieVideo.ended) {
        setMovieTransitionState('fading_out_to_3js');
        setMovieTransitionTimer(0.0);
      }
    } else if (movieTransitionState === 'fading_out_to_3js') {
      camera.position.set(6.12, 22.97, 9.17);
      camera.quaternion.copy(movieTransitionEndQuat);
      controls.target.set(2.77, 0.45, -0.49);
      camera.fov = 61;

      const fadeDuration = 2.0;
      const progress = Math.min(movieTransitionTimer / fadeDuration, 1.0);
      const overlay = document.getElementById('video-overlay');
      if (overlay) {
        overlay.style.opacity = 1.0 - progress;
      }

      if (movieTransitionTimer >= fadeDuration) {
        if (overlay) {
          overlay.classList.remove('active');
          overlay.style.opacity = '';
        }
        const movieVideo = document.getElementById('movie-video');
        if (movieVideo) {
          movieVideo.pause();
          movieVideo.currentTime = 0;
        }

        setMovieTransitionState('holding_before_exit');
        setMovieTransitionTimer(0.0);
      }
    } else if (movieTransitionState === 'holding_before_exit') {
      camera.position.set(6.12, 22.97, 9.17);
      camera.quaternion.copy(movieTransitionEndQuat);
      controls.target.set(2.77, 0.45, -0.49);
      camera.fov = 61;

      if (movieTransitionTimer >= 0.5) {
        setIsMovieTransitionActive(false);
        setMovieTransitionState('idle');
        camGuiState.paused = false;
        isPostSequence = false;
        returnToFinale();
      }
    } else if (movieTransitionState === 'exiting_fade_out') {
      camera.position.copy(movieTransitionStartPos);
      camera.quaternion.copy(movieTransitionStartQuat);
      controls.target.copy(movieTransitionStartTarget);

      const fadeDuration = 2.0;
      const progress = Math.min(movieTransitionTimer / fadeDuration, 1.0);
      const overlay = document.getElementById('video-overlay');
      if (overlay) {
        overlay.style.opacity = 1.0 - progress;
      }

      if (movieTransitionTimer >= fadeDuration) {
        if (overlay) {
          overlay.classList.remove('active');
          overlay.style.opacity = '';
        }
        setIsMovieTransitionActive(false);
        setMovieTransitionState('idle');
        camGuiState.paused = false;
        isPostSequence = false;
        returnToFinale();

        const audio = document.getElementById('bg-audio');
        const songNameEl = document.getElementById('song-name');
        if (wasBgAudioPlaying && audio) {
          audio.play().then(() => {
            if (songNameEl) songNameEl.classList.add('playing');
          }).catch(err => console.error("Failed to resume background audio:", err));
        }
      }
    }
  } else if (isPostSequence) {
    updatePostSeqNavRotation(realDeltaTime, isPaused, postSeqTimer, {
      get postSeqAngle() { return postSeqAngle; },
      set postSeqAngle(v) { postSeqAngle = v; }
    }, { triggerNavigation });

    if (isPaused) {
      controls.enabled = true;
      controls.update();
    } else {
      postSeqTimer += realDeltaTime;
      const accelTime = 3.0;

      const currentOmega = dragOmegaSpeed * Math.min(postSeqTimer / accelTime, 1.0);
      postSeqAngle += currentOmega * realDeltaTime;

      const postSeqDuration = 3.0;
      const t = smoothstep(Math.min(postSeqTimer / postSeqDuration, 1.0));

      const finalCamPos = new THREE.Vector3(0, 0, 15);
      const finalCamTarget = new THREE.Vector3(0, 0, 0);
      const finalUp = new THREE.Vector3(-Math.sin(postSeqAngle), Math.cos(postSeqAngle), 0).normalize();

      currentCamPos.lerpVectors(transitionStartPos, finalCamPos, t);
      currentCamTarget.lerpVectors(transitionStartTarget, finalCamTarget, t);
      camera.up.lerpVectors(transitionStartUp, finalUp, t).normalize();
      camera.position.copy(currentCamPos);
      camera.lookAt(currentCamTarget);

      const targetFOV = getResponsiveFOV();
      camera.fov = THREE.MathUtils.lerp(transitionStartFOV, targetFOV, t);
      camera.updateProjectionMatrix();
      camGuiState.fov = camera.fov;

      if (postSeqTimer >= postSeqDuration && camera.fov !== targetFOV) {
        camera.fov = targetFOV;
        camera.updateProjectionMatrix();
        camGuiState.fov = targetFOV;
      }

      controls.enabled = false;
      controls.autoRotate = false;
    }

    if (globeMaterial) globeMaterial.opacity = THREE.MathUtils.lerp(globeMaterial.opacity, 0.35, 0.02);
    if (orbitMaterial) orbitMaterial.opacity = THREE.MathUtils.lerp(orbitMaterial.opacity, 0.45, 0.02);

    if (cursivePlane) {
      cursivePlane.material.opacity = THREE.MathUtils.lerp(cursivePlane.material.opacity, 0.9, 0.03);
      cursivePlane.rotation.z = postSeqAngle;
    }

    orbitSequence.forEach(seq => {
      const obj = seq.getObject();
      if (obj && obj.visible) {
        const currentOpacity = obj.children[0]?.material?.opacity || 1.0;
        setOpacity(obj, Math.max(0, currentOpacity - 0.02));
      }
    });

    const bgNames = ['City', 'School', 'Landscape', 'Beach', 'Desert', 'Cafe'];
    bgNames.forEach(name => {
      const model = scene.getObjectByName(name);
      if (model) model.visible = true;
    });

    if (introFinaleActive && !isPaused) {
      introFinaleTimer += realDeltaTime;
      if (introFinaleTimer >= 10.0) {
        isPostSequence = false;
        introFinaleActive = false;
        isIntroTransitioning = true;
        introTransitionProgress = 0;
        setCurrentSeqIndex(0);
        setIsOrbitAnimating(true);
        navLabelsVisible = true;
        setIsTransitioning(false);
        setTransitionProgress(0);

        const targetSeq = orbitSequence[0];
        if (targetSeq && targetSeq.params) {
          targetSeq.params.orbitDegrees = targetSeq.start;
        }
        syncCamGuiFromSequence();

        introTransitionStartPos.copy(camera.position);
        introTransitionStartTarget.copy(currentCamTarget);
        introTransitionStartUp.copy(camera.up);

        transitionStartGlobeOpacity = globeMaterial.opacity;
        transitionStartOrbitOpacity = orbitMaterial.opacity;
        transitionStartCursiveOpacity = cursivePlane ? cursivePlane.material.opacity : 0.0;
      }
    }
  } else if (cameraFollowEnabled) {
    if (isTransitioning) {
      setTransitionProgress(transitionProgress + deltaTime / transitionDuration);
      const t = smoothstep(Math.min(transitionProgress, 1.0));
      const nextSeq = orbitSequence[currentSeqIndex];
      const nextTransform = nextSeq ? getVehicleCameraTransform(nextSeq) : null;

      if (nextTransform) {
        transitionEndPos.copy(nextTransform.position);
        transitionEndTarget.copy(nextTransform.target);
      }

      currentCamPos.lerpVectors(transitionStartPos, transitionEndPos, t);
      currentCamTarget.lerpVectors(transitionStartTarget, transitionEndTarget, t);

      if (nextTransform) {
        const transitionEndUp = nextTransform.up;
        camera.up.lerpVectors(transitionStartUp, transitionEndUp, t).normalize();
      }
      camera.position.copy(currentCamPos);
      camera.lookAt(currentCamTarget);

      const prevIndex = (currentSeqIndex - 1 + orbitSequence.length) % orbitSequence.length;
      const prevSeq = orbitSequence[prevIndex];
      const prevObj = prevSeq ? prevSeq.getObject() : null;
      const nextObj = nextSeq ? nextSeq.getObject() : null;

      setOpacity(prevObj, 1.0 - t);
      setOpacity(nextObj, t);

      if (prevSeq) {
        const prevScene = vehicleSceneMap[prevSeq.name];
        const prevTBs = sceneTextboxes[prevScene];
        if (prevTBs) prevTBs.forEach(tb => setOpacity(tb.mesh, 1.0 - t));
      }
      if (nextSeq) {
        const nextScene = vehicleSceneMap[nextSeq.name];
        const nextTBs = sceneTextboxes[nextScene];
        if (nextTBs) nextTBs.forEach(tb => setOpacity(tb.mesh, t));
      }

      if (transitionProgress >= 1.0) {
        setIsTransitioning(false);
        setOpacity(prevObj, 0.0);
        setOpacity(nextObj, 1.0);

        if (prevSeq) {
          const prevScene = vehicleSceneMap[prevSeq.name];
          const prevTBs = sceneTextboxes[prevScene];
          if (prevTBs) prevTBs.forEach(tb => setOpacity(tb.mesh, 0.0));
        }
        if (nextSeq) {
          const nextScene = vehicleSceneMap[nextSeq.name];
          const nextTBs = sceneTextboxes[nextScene];
          if (nextTBs) nextTBs.forEach(tb => setOpacity(tb.mesh, 1.0));
        }
      }
    } else if (isOrbitAnimating) {
      const currentSeq = orbitSequence[currentSeqIndex];
      const transform = currentSeq ? getVehicleCameraTransform(currentSeq) : null;

      orbitSequence.forEach((seq, idx) => {
        const obj = seq.getObject();
        const shouldBeVisible = (idx === currentSeqIndex);
        if (obj) {
          if (obj.visible !== shouldBeVisible) {
            obj.visible = shouldBeVisible;
            if (shouldBeVisible) {
              obj.traverse((child) => {
                if (child.isMesh && child.material) {
                  const materials = Array.isArray(child.material) ? child.material : [child.material];
                  materials.forEach((mat) => {
                    const origOpacity = mat.userData.originalOpacity !== undefined ? mat.userData.originalOpacity : 1.0;
                    mat.opacity = origOpacity;
                  });
                }
              });
            }
          }
        }

        const sceneName = vehicleSceneMap[seq.name];
        const textboxes = sceneTextboxes[sceneName];
        if (textboxes) {
          textboxes.forEach((tb) => {
            setOpacity(tb.mesh, shouldBeVisible ? 1.0 : 0.0);
          });
        }
      });

      if (transform) {
        currentCamPos.copy(transform.position);
        currentCamTarget.copy(transform.target);
        camera.up.copy(transform.up);
        camera.position.copy(currentCamPos);
        camera.lookAt(currentCamTarget);
      }
    }

    if (isOrbitAnimating || isTransitioning || textboxFocusState === 'entering' || textboxFocusState === 'exiting') {
      controls.enabled = false;
    } else {
      controls.enabled = true;
      controls.update();
    }
  }

  if (isPostSequence || navLabelsVisible) {
    updateNavLabelPositions();

    if (isHandheldDevice && isPostSequence && (isDraggingMobileNav || mobileNavSelectionTimeout !== null)) {
      let closestIdx = -1;
      let minDiff = Infinity;
      const marginOfError = 0.26;

      navLabels.forEach((entry, idx) => {
        const angleOnScreen = entry.baseAngle - postSeqAngle;
        let diff = angleOnScreen - Math.PI / 2;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const absDiff = Math.abs(diff);
        if (absDiff < minDiff) {
          minDiff = absDiff;
          closestIdx = idx;
        }
      });

      navLabels.forEach((entry, idx) => {
        const isSelected = (idx === closestIdx && minDiff < marginOfError);
        if (isSelected) {
          entry.targetScale = (mobileNavSelectionTimeout !== null) ? 1.4 : 1.3;
          entry.targetOpacity = 1.0;
          if (hoverScenes[entry.config.scene]) {
            hoverScenes[entry.config.scene].target = 1.0;
          }
        } else {
          entry.targetScale = 1.0;
          entry.targetOpacity = 0.75;
          if (hoverScenes[entry.config.scene]) {
            hoverScenes[entry.config.scene].target = 0.0;
          }
        }
      });
    } else if (isHandheldDevice && isPostSequence) {
      navLabels.forEach((entry) => {
        entry.targetScale = 1.0;
        entry.targetOpacity = 0.75;
        if (hoverScenes[entry.config.scene]) {
          hoverScenes[entry.config.scene].target = 0.0;
        }
      });
    }

    navLabels.forEach((entry) => {
      entry.mesh.visible = true;
      if (!navLabelsVisible) {
        for (const name in hoverScenes) {
          hoverScenes[name].target = 0.0;
        }
        navLabels.forEach((e) => {
          e.targetOpacity = 0.75;
          e.targetScale = 1.0;
        });
        navLabelsVisible = true;
        hoverTimeoutTimer = 0;
      }

      const currentOpacity = entry.mesh.material.opacity;
      entry.mesh.material.opacity += (entry.targetOpacity - currentOpacity) * 6.0 * realDeltaTime;

      const currentScaleY = Math.abs(entry.mesh.scale.y);
      const newScale = currentScaleY + (entry.targetScale - currentScaleY) * 6.0 * realDeltaTime;
      entry.mesh.scale.y = newScale;
      entry.mesh.scale.x = newScale;
      entry.mesh.scale.z = newScale;
    });

    if (hoverTimeoutTimer > 0 && !isPaused) {
      hoverTimeoutTimer -= realDeltaTime;
      if (hoverTimeoutTimer <= 0) {
        hoverTimeoutTimer = 0;
        for (const name in hoverScenes) {
          hoverScenes[name].target = 0.0;
        }
        navLabels.forEach((entry) => {
          entry.targetOpacity = 0.75;
          entry.targetScale = 1.0;
        });
      }
    }
  }

  for (const name in sceneTextboxes) {
    sceneTextboxes[name].forEach(tb => {
      if (!tb.mesh.visible) return;

      if (tb !== selectedTextbox) {
        tb.targetScale = tb.baseScale;
        tb.targetOpacity = 0.85;
      }

      tb.currentScale = THREE.MathUtils.lerp(tb.currentScale, tb.targetScale, 0.12);
      tb.mesh.scale.setScalar(tb.currentScale);
      tb.mesh.material.opacity = THREE.MathUtils.lerp(
        tb.mesh.material.opacity,
        tb.targetOpacity,
        0.12
      );
    });
  }

  if (textboxFocusState !== 'idle') {
    setTextboxFocusTimer(textboxFocusTimer + realDeltaTime);
    const t = smoothstep(Math.min(textboxFocusTimer / TEXTBOX_FOCUS_DURATION, 1.0));

    if (textboxFocusState === 'entering') {
      camera.position.lerpVectors(textboxFocusLerpStartPos, textboxFocusTargetPos, t);
      controls.target.lerpVectors(textboxFocusLerpStartTarget, textboxFocusTargetLookAt, t);
      camera.up.lerpVectors(textboxFocusLerpStartUp, textboxFocusTargetUp, t).normalize();
      camera.fov = THREE.MathUtils.lerp(textboxFocusLerpStartFOV, getFocusFOV(), t);
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      controls.enabled = false;

      if (t >= 1.0) {
        setTextboxFocusState('focused');
        controls.enableDamping = false;
        controls.update();
        controls.enableDamping = true;
        controls.enabled = true;
      }
    } else if (textboxFocusState === 'exiting') {
      camera.position.lerpVectors(textboxFocusLerpStartPos, textboxFocusPrePos, t);
      controls.target.lerpVectors(textboxFocusLerpStartTarget, textboxFocusPreTarget, t);
      camera.up.lerpVectors(textboxFocusLerpStartUp, textboxFocusPreUp, t).normalize();
      camera.fov = THREE.MathUtils.lerp(textboxFocusLerpStartFOV, textboxFocusPreFOV, t);
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      controls.enabled = false;

      if (t >= 1.0) {
        setTextboxFocusState('idle');
        camGuiState.paused = false;
        setIsOrbitAnimating(true);
        controls.enableDamping = false;
        controls.update();
        controls.enableDamping = true;
        controls.enabled = true;
      }
    }
  }

  renderer.render(scene, camera);
}

animate();
