import * as THREE from 'three';
import { camera, controls, isHandheldDevice } from '../core/context.js';
import { globe, orbitRing } from '../utils/geometry.js';
import { getCylinderMiddleZ } from '../utils/responsive.js';
import { activeBackdropMode, setActiveBackdropMode } from '../environment/dayNight.js';
import { cursivePlane, drawCursiveName } from '../environment/cursiveIntro.js';
import { sceneTextboxes, selectedTextbox, selectTextbox, deselectTextbox, textboxFocusState, navLabelConfig } from '../ui/textboxManager.js';
import { navLabels, updateNavLabelCanvas, highlightNavLabel } from '../ui/navLabels.js';
import { orbitSequence, currentSeqIndex, isOrbitAnimating, transitionStartPos, transitionStartTarget, transitionStartUp } from '../camera/cameraManager.js';
import { isMovieTransitionActive, triggerMovieTransition, exitMovieView } from '../media/moviePlayer.js';

export let isVehicleHeld = false;
export let isDraggingMobileNav = false;
export let dragStartPointerX = 0;
export let dragStartAngle = 0;
export let mobileNavSelectionTimeout = null;
export let dragOmegaSpeed = 0.4;
export let mobileNavDragHoldTimer = 0.0;
export let mobileNavResumeDelayTimer = 0.0;

export let orbitSwipeStartPointerY = 0;
export let orbitSwipeStartPointerX = 0;
export let isTrackingOrbitSwipe = false;

export let isResumeHovered = false;
export let isTextboxHovered = false;

const _globeRaycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

export function releaseMobileNavDrag(state, callbacks) {
  if (isDraggingMobileNav && isHandheldDevice) {
    isDraggingMobileNav = false;

    let closestIdx = -1;
    let minDiff = Infinity;
    const marginOfError = 0.26;

    navLabels.forEach((entry, idx) => {
      const angleOnScreen = entry.baseAngle - state.postSeqAngle;
      let diff = angleOnScreen - Math.PI / 2;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const absDiff = Math.abs(diff);

      if (absDiff < minDiff) {
        minDiff = absDiff;
        closestIdx = idx;
      }
    });

    if (closestIdx !== -1 && minDiff < marginOfError) {
      const selectedLabel = navLabels[closestIdx];
      selectedLabel.targetScale = 1.4;
      selectedLabel.targetOpacity = 1.0;

      mobileNavSelectionTimeout = setTimeout(() => {
        if (callbacks && callbacks.triggerNavigation) {
          callbacks.triggerNavigation(closestIdx);
        }
        mobileNavSelectionTimeout = null;
      }, 500);
    } else {
      mobileNavResumeDelayTimer = 1.5;
    }
  }
}

export function updatePostSeqNavRotation(realDeltaTime, isPaused, postSeqTimer, state, callbacks) {
  if (isDraggingMobileNav && isHandheldDevice) {
    mobileNavDragHoldTimer -= realDeltaTime;
    if (mobileNavDragHoldTimer <= 0) {
      releaseMobileNavDrag(state, callbacks);
    }
  }

  if (!isPaused) {
    const accelTime = 3.0;
    const omegaMax = 0.4;

    if (isDraggingMobileNav) {
      dragOmegaSpeed = 0.0;
    } else if (mobileNavResumeDelayTimer > 0) {
      mobileNavResumeDelayTimer -= realDeltaTime;
      dragOmegaSpeed = 0.0;
    } else {
      dragOmegaSpeed = THREE.MathUtils.lerp(dragOmegaSpeed, omegaMax, 0.05);
    }

    const currentOmega = dragOmegaSpeed * Math.min(postSeqTimer / accelTime, 1.0);
    state.postSeqAngle += currentOmega * realDeltaTime;
  }
}

export function initInputHandlers(state, callbacks) {
  const movieVideo = document.getElementById('movie-video');
  if (movieVideo) {
    if (import.meta.env.DEV) {
      movieVideo.src = '/capcut_video_v1.mp4';
    } else {
      movieVideo.src = 'https://pub-072874b429b14b129985f91cc0b6ecbc.r2.dev/capcut_video_v1.mp4';
    }
  }

  window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' ||
      event.target.closest('button') ||
      event.target.closest('.dg') ||
      event.target.id === 'audio-toggle' ||
      event.target.closest('#audio-toggle')) {
      return;
    }

    _mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    _globeRaycaster.setFromCamera(_mouse, camera);

    if (!isMovieTransitionActive && !state.introActive && !state.isIntroTransitioning) {
      const allTextboxMeshes = Object.values(sceneTextboxes)
        .flat()
        .filter(tb => tb.mesh.visible)
        .map(tb => tb.mesh);

      if (allTextboxMeshes.length > 0) {
        const tbIntersects = _globeRaycaster.intersectObjects(allTextboxMeshes);
        if (tbIntersects.length > 0) {
          const clickedMesh = tbIntersects[0].object;
          const clickedTb = Object.values(sceneTextboxes).flat().find(tb => tb.mesh === clickedMesh);
          if (clickedTb) {
            if (selectedTextbox === clickedTb) {
              deselectTextbox();
            } else {
              selectTextbox(clickedTb, state);
            }
            return;
          }
        }
      }

      if (selectedTextbox && textboxFocusState === 'focused') {
        deselectTextbox();
        return;
      }
    }

    if (state.isPostSequence) {
      const labelMeshes = navLabels.map(entry => entry.mesh);
      const intersectsLabels = _globeRaycaster.intersectObjects(labelMeshes);
      if (intersectsLabels.length > 0) {
        const clickedMesh = intersectsLabels[0].object;
        const clickedEntryIdx = navLabels.findIndex(entry => entry.mesh === clickedMesh);
        if (clickedEntryIdx !== -1) {
          const clickedEntry = navLabels[clickedEntryIdx];
          if (clickedEntry.config.label === 'Resume') {
            window.open('/Advitiya_Resume_Jul_12.pdf', '_blank');
          } else {
            if (callbacks.triggerNavigation) {
              callbacks.triggerNavigation(clickedEntryIdx);
            }
          }
          return;
        }
      }
    }

    if (globe) {
      const intersects = _globeRaycaster.intersectObject(globe);
      if (intersects.length > 0) {
        if (!state.isPostSequence && callbacks.returnToFinale) {
          callbacks.returnToFinale();
        }
      }
    }
  });

  window.addEventListener('pointerdown', (event) => {
    if (event.target.tagName === 'BUTTON' ||
      event.target.closest('.dg') ||
      event.target.id === 'audio-toggle' ||
      event.target.closest('#audio-toggle') ||
      event.target.closest('.radial-nav') ||
      event.target.closest('.theme-selector') ||
      event.target.closest('.mobile-nav-container')) {
      return;
    }

    if (state.isPostSequence && isHandheldDevice) {
      isDraggingMobileNav = true;
      dragStartPointerX = event.clientX;
      dragStartAngle = state.postSeqAngle;
      if (mobileNavSelectionTimeout) {
        clearTimeout(mobileNavSelectionTimeout);
        mobileNavSelectionTimeout = null;
      }
      state.introFinaleActive = false;
      state.introFinaleTimer = 0.0;

      dragOmegaSpeed = 0.0;
      mobileNavDragHoldTimer = 5.0;
      mobileNavResumeDelayTimer = 0.0;
      return;
    }

    if (!state.isPostSequence && isHandheldDevice) {
      isTrackingOrbitSwipe = true;
      orbitSwipeStartPointerY = event.clientY;
      orbitSwipeStartPointerX = event.clientX;
    }

    if (!isOrbitAnimating || state.introActive || state.isIntroTransitioning || state.isPostSequence) {
      return;
    }

    _mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    _globeRaycaster.setFromCamera(_mouse, camera);

    const currentSeq = orbitSequence[currentSeqIndex];
    if (currentSeq) {
      const activeObj = currentSeq.getObject();
      if (activeObj) {
        const intersects = _globeRaycaster.intersectObjects([activeObj], true);
        if (intersects.length > 0) {
          isVehicleHeld = true;
        }
      }
    }
  });

  const releaseVehicleHold = () => {
    if (isVehicleHeld) {
      isVehicleHeld = false;
    }
  };

  const releaseOrbitSwipe = (event) => {
    if (isTrackingOrbitSwipe) {
      isTrackingOrbitSwipe = false;
      if (typeof event.clientY !== 'number' || typeof event.clientX !== 'number') return;

      const deltaY = event.clientY - orbitSwipeStartPointerY;
      const deltaX = event.clientX - orbitSwipeStartPointerX;

      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 60) {
        let sectorIdx = callbacks.getSectorIndexFromVehicleIndex ? callbacks.getSectorIndexFromVehicleIndex(currentSeqIndex) : 0;
        if (sectorIdx === -1) sectorIdx = 0;

        if (deltaY > 60) {
          const nextSectorIdx = (sectorIdx + 1) % navLabelConfig.length;
          if (callbacks.triggerNavigation) callbacks.triggerNavigation(nextSectorIdx);
        } else if (deltaY < -60) {
          const prevSectorIdx = (sectorIdx - 1 + navLabelConfig.length) % navLabelConfig.length;
          if (callbacks.triggerNavigation) callbacks.triggerNavigation(prevSectorIdx);
        }
      }
    }
  };

  window.addEventListener('pointerup', (event) => {
    releaseVehicleHold();
    releaseMobileNavDrag(state, callbacks);
    releaseOrbitSwipe(event);
  });
  window.addEventListener('pointercancel', (event) => {
    releaseVehicleHold();
    releaseMobileNavDrag(state, callbacks);
    releaseOrbitSwipe(event);
  });
  window.addEventListener('mouseleave', (event) => {
    releaseVehicleHold();
    releaseMobileNavDrag(state, callbacks);
    releaseOrbitSwipe(event);
  });

  window.addEventListener('pointermove', (event) => {
    if (isDraggingMobileNav && isHandheldDevice) {
      const deltaX = event.clientX - dragStartPointerX;
      state.postSeqAngle = dragStartAngle - deltaX * 0.015;
      mobileNavDragHoldTimer = 5.0;
      return;
    }

    _mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    _globeRaycaster.setFromCamera(_mouse, camera);

    if (!isMovieTransitionActive && !state.introActive && !state.isIntroTransitioning) {
      const allTextboxMeshes = Object.values(sceneTextboxes)
        .flat()
        .filter(tb => tb.mesh.visible)
        .map(tb => tb.mesh);

      const tbHit = allTextboxMeshes.length > 0
        ? _globeRaycaster.intersectObjects(allTextboxMeshes).length > 0
        : false;

      if (tbHit && !isTextboxHovered) {
        document.body.style.cursor = 'pointer';
        isTextboxHovered = true;
      } else if (!tbHit && isTextboxHovered) {
        document.body.style.cursor = 'default';
        isTextboxHovered = false;
      }

      if (tbHit) return;
    }

    if (!state.isPostSequence) {
      if (isResumeHovered) {
        document.body.style.cursor = 'default';
        const resumeEntry = navLabels.find(entry => entry.config.label === 'Resume');
        if (resumeEntry) updateNavLabelCanvas(resumeEntry, false);
        isResumeHovered = false;
      }
      if (!isTextboxHovered) document.body.style.cursor = 'default';
      return;
    }

    const resumeEntry = navLabels.find(entry => entry.config.label === 'Resume');
    if (resumeEntry) {
      const intersects = _globeRaycaster.intersectObject(resumeEntry.mesh);
      if (intersects.length > 0) {
        if (!isResumeHovered) {
          document.body.style.cursor = 'pointer';
          updateNavLabelCanvas(resumeEntry, true);
          isResumeHovered = true;
        }
      } else {
        if (isResumeHovered) {
          document.body.style.cursor = 'default';
          updateNavLabelCanvas(resumeEntry, false);
          isResumeHovered = false;
        }
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (selectedTextbox) {
        deselectTextbox();
        return;
      }
      if (exitMovieView()) {
        return;
      }
      if (callbacks.returnToFinale) {
        callbacks.returnToFinale();
      }
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      if (callbacks.togglePause) callbacks.togglePause();
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.isPostSequence) {
        state.activeNavIndex = (state.activeNavIndex + 1) % navLabelConfig.length;
        highlightNavLabel(state.activeNavIndex);
        state.hoverTimeoutTimer = 5.0;
      } else {
        let sectorIdx = callbacks.getSectorIndexFromVehicleIndex ? callbacks.getSectorIndexFromVehicleIndex(currentSeqIndex) : 0;
        if (sectorIdx === -1) sectorIdx = 0;
        const nextSectorIdx = (sectorIdx + 1) % navLabelConfig.length;
        state.activeNavIndex = nextSectorIdx;
        if (callbacks.triggerNavigation) callbacks.triggerNavigation(nextSectorIdx);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.isPostSequence) {
        state.activeNavIndex = (state.activeNavIndex - 1 + navLabelConfig.length) % navLabelConfig.length;
        highlightNavLabel(state.activeNavIndex);
        state.hoverTimeoutTimer = 5.0;
      } else {
        let sectorIdx = callbacks.getSectorIndexFromVehicleIndex ? callbacks.getSectorIndexFromVehicleIndex(currentSeqIndex) : 0;
        if (sectorIdx === -1) sectorIdx = 0;
        const prevSectorIdx = (sectorIdx - 1 + navLabelConfig.length) % navLabelConfig.length;
        state.activeNavIndex = prevSectorIdx;
        if (callbacks.triggerNavigation) callbacks.triggerNavigation(prevSectorIdx);
      }
    } else if (e.key === 'Enter') {
      if (state.isPostSequence) {
        if (callbacks.triggerNavigation) callbacks.triggerNavigation(state.activeNavIndex);
      } else {
        const textboxes = Object.values(sceneTextboxes).flat().filter(tb => tb.mesh.visible);
        if (textboxes.length > 0) {
          selectTextbox(textboxes[0], state);
        }
      }
    }
  });

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const emojiEl = themeToggle.querySelector('.theme-emoji');
    const isEasterEggEnabled = Math.random() < 0.1;
    const modesList = isEasterEggEnabled ? ['cycle', 'cobalt', 'clay', 'easteregg'] : ['cycle', 'cobalt', 'clay'];

    const emojisMap = { cycle: '🌗', cobalt: '🌙', clay: '☀️', easteregg: '' };
    const titlesMap = {
      cycle: 'Backdrop: Day-Night Cycle',
      cobalt: 'Backdrop: Dark Mode (Cobalt)',
      clay: 'Backdrop: Light Mode (Beige)',
      easteregg: 'Backdrop: Easter Egg Mode'
    };

    themeToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentIdx = modesList.indexOf(activeBackdropMode);
      const nextIdx = (currentIdx + 1) % modesList.length;
      const nextMode = modesList[nextIdx];

      setActiveBackdropMode(nextMode);

      if (emojiEl) {
        if (nextMode === 'easteregg') {
          emojiEl.innerHTML = '<img src="/easter-egg.png" style="width: 20px; height: 20px; vertical-align: middle; pointer-events: none;" alt="Easter Egg">';
        } else {
          emojiEl.textContent = emojisMap[nextMode];
        }
      }
      themeToggle.title = titlesMap[nextMode];

      if (nextMode === 'easteregg') {
        triggerMovieTransition();
      }
    });
  }
}
