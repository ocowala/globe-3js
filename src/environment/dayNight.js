import * as THREE from 'three';
import { ambientLight, directionalLight } from '../core/context.js';
import { updateStarfield } from './starfield.js';

export let activeBackdropMode = 'cycle';
export function setActiveBackdropMode(mode) {
  activeBackdropMode = mode;
}

export const themeGradients = {
  clay: {
    day: { r1: 253, g1: 248, b1: 231, r2: 244, g2: 233, b2: 208, r3: 225, g3: 211, b3: 179, ambient: 0xfff6ea },
    night: { r1: 20, g1: 28, b1: 36, r2: 13, g2: 19, b2: 26, r3: 5, g3: 8, b3: 12, ambient: 0x3a4f66 }
  },
  cobalt: {
    day: { r1: 32, g1: 44, b1: 57, r2: 20, g2: 28, b2: 36, r3: 13, g3: 19, b3: 26, ambient: 0x5a7fa6 },
    night: { r1: 20, g1: 28, b1: 36, r2: 13, g2: 19, b2: 26, r3: 5, g3: 8, b3: 12, ambient: 0x223344 }
  },
  emerald: {
    day: { r1: 242, g1: 247, b1: 242, r2: 225, g2: 235, b2: 225, r3: 204, g3: 220, b3: 202, ambient: 0xeaf6ea },
    night: { r1: 15, g1: 29, b1: 18, r2: 10, g2: 20, b2: 12, r3: 5, g3: 10, b3: 6, ambient: 0x2a4430 }
  },
  crimson: {
    day: { r1: 253, g1: 242, b1: 238, r2: 245, g2: 223, b2: 213, r3: 229, g3: 196, b3: 182, ambient: 0xffefe8 },
    night: { r1: 38, g1: 19, b1: 15, r2: 26, g2: 13, b2: 10, r3: 13, g3: 7, b3: 5, ambient: 0x4a2a20 }
  }
};

export const sceneTimeConfigs = {
  0: {
    bg: { r1: 253, g1: 242, b1: 238, r2: 245, g2: 223, b2: 213, r3: 229, g3: 196, b3: 182 },
    ambient: 0xffefe8,
    ambientIntensity: 0.65,
    dir: 0xffaa90,
    dirIntensity: 0.6,
    stars: 0.0,
    dark: false
  },
  1: {
    bg: { r1: 253, g1: 248, b1: 231, r2: 244, g2: 233, b2: 208, r3: 225, g3: 211, b3: 179 },
    ambient: 0xfff6ea,
    ambientIntensity: 0.8,
    dir: 0xffffff,
    dirIntensity: 0.7,
    stars: 0.0,
    dark: false
  },
  2: {
    bg: {
      r1: Math.round(253 * 0.6 + 253 * 0.4),
      g1: Math.round(248 * 0.6 + 242 * 0.4),
      b1: Math.round(231 * 0.6 + 238 * 0.4),
      r2: Math.round(244 * 0.6 + 245 * 0.4),
      g2: Math.round(233 * 0.6 + 223 * 0.4),
      b2: Math.round(208 * 0.6 + 213 * 0.4),
      r3: Math.round(225 * 0.6 + 229 * 0.4),
      g3: Math.round(211 * 0.6 + 196 * 0.4),
      b3: Math.round(179 * 0.6 + 182 * 0.4)
    },
    ambient: 0xfff3eb,
    ambientIntensity: 0.75,
    dir: 0xffe6d9,
    dirIntensity: 0.7,
    stars: 0.0,
    dark: false
  },
  3: {
    bg: { r1: 253, g1: 242, b1: 238, r2: 245, g2: 223, b2: 213, r3: 229, g3: 196, b3: 182 },
    ambient: 0xffefe8,
    ambientIntensity: 0.65,
    dir: 0xffaa90,
    dirIntensity: 0.6,
    stars: 0.0,
    dark: false
  },
  4: {
    bg: { r1: 20, g1: 28, b1: 36, r2: 13, g2: 19, b2: 26, r3: 5, g3: 8, b3: 12 },
    ambient: 0x3a4f66,
    ambientIntensity: 0.45,
    dir: 0xd4e3ff,
    dirIntensity: 0.28,
    stars: 1.0,
    dark: true
  },
  5: {
    bg: { r1: 242, g1: 247, b1: 242, r2: 225, g2: 235, b2: 225, r3: 204, g3: 220, b3: 202 },
    ambient: 0xeaf6ea,
    ambientIntensity: 0.8,
    dir: 0xf0fff0,
    dirIntensity: 0.7,
    stars: 0.0,
    dark: false
  }
};

export function getDayNightTargets(currentTime, state) {
  const { allAssetsLoaded, introActive, isIntroTransitioning, isOrbitAnimating, selectedTextbox, currentSeqIndex, activeNavIndex, orbitSequence } = state;

  if (activeBackdropMode === 'clay') {
    return {
      bg: themeGradients.clay.day,
      ambient: themeGradients.clay.day.ambient,
      ambientIntensity: 0.8,
      dir: 0xffffff,
      dirIntensity: 0.7,
      stars: 0.0,
      dark: false
    };
  }

  if (activeBackdropMode === 'cobalt') {
    return {
      bg: themeGradients.cobalt.night,
      ambient: themeGradients.cobalt.night.ambient,
      ambientIntensity: 0.45,
      dir: 0xd4e3ff,
      dirIntensity: 0.28,
      stars: 0.8,
      dark: true
    };
  }

  const isIntroState = introActive || isIntroTransitioning;
  if (!allAssetsLoaded || isIntroState) {
    return {
      bg: themeGradients.clay.day,
      ambient: themeGradients.clay.day.ambient,
      ambientIntensity: 0.8,
      dir: 0xffffff,
      dirIntensity: 0.7,
      stars: 0.0,
      dark: false
    };
  }

  const isSceneActive = isOrbitAnimating || selectedTextbox;

  if (isSceneActive) {
    const activeIdx = isOrbitAnimating ? currentSeqIndex : activeNavIndex;
    let config = sceneTimeConfigs[activeIdx] || sceneTimeConfigs[1];

    if (activeIdx === 0 && isOrbitAnimating) {
      const seq = orbitSequence ? orbitSequence[0] : null;
      if (seq && seq.params) {
        const startDeg = seq.start;
        const endDeg = seq.end;
        const currentDeg = seq.params.orbitDegrees;
        const totalDist = Math.abs(startDeg - endDeg);
        const currentDist = Math.abs(startDeg - currentDeg);

        const progress = Math.min(Math.max(currentDist / totalDist, 0.0), 1.0);

        const midnight = themeGradients.cobalt.night;
        const dawn = themeGradients.crimson.day;

        const r1 = THREE.MathUtils.lerp(midnight.r1, dawn.r1, progress);
        const g1 = THREE.MathUtils.lerp(midnight.g1, dawn.g1, progress);
        const b1 = THREE.MathUtils.lerp(midnight.b1, dawn.b1, progress);

        const r2 = THREE.MathUtils.lerp(midnight.r2, dawn.r2, progress);
        const g2 = THREE.MathUtils.lerp(midnight.g2, dawn.g2, progress);
        const b2 = THREE.MathUtils.lerp(midnight.b2, dawn.b2, progress);

        const r3 = THREE.MathUtils.lerp(midnight.r3, dawn.r3, progress);
        const g3 = THREE.MathUtils.lerp(midnight.g3, dawn.g3, progress);
        const b3 = THREE.MathUtils.lerp(midnight.b3, dawn.b3, progress);

        const colorAmbient = new THREE.Color(midnight.ambient || 0x223344).lerp(new THREE.Color(dawn.ambient), progress);
        const colorDir = new THREE.Color(0xd4e3ff).lerp(new THREE.Color(0xffaa90), progress);

        return {
          bg: { r1, g1, b1, r2, g2, b2, r3, g3, b3 },
          ambient: colorAmbient.getHex(),
          ambientIntensity: THREE.MathUtils.lerp(0.45, 0.65, progress),
          dir: colorDir.getHex(),
          dirIntensity: THREE.MathUtils.lerp(0.28, 0.6, progress),
          stars: THREE.MathUtils.lerp(0.8, 0.0, progress),
          dark: progress < 0.5
        };
      }
    }

    return {
      bg: config.bg,
      ambient: config.ambient,
      ambientIntensity: config.ambientIntensity,
      dir: config.dir,
      dirIntensity: config.dirIntensity,
      stars: config.stars,
      dark: config.dark
    };
  } else {
    return {
      bg: themeGradients.clay.day,
      ambient: themeGradients.clay.day.ambient,
      ambientIntensity: 0.8,
      dir: 0xffffff,
      dirIntensity: 0.7,
      stars: 0.0,
      dark: false
    };
  }
}

// Current interpolation state
export let currentBg = { r1: 253, g1: 248, b1: 231, r2: 244, g2: 233, b2: 208, r3: 225, g3: 211, b3: 179 };
export let currentAmbientColor = new THREE.Color(0xfff6ea);
export let currentAmbientIntensity = 0.8;
export let currentDirColor = new THREE.Color(0xffffff);
export let currentDirIntensity = 0.7;
export let currentStarsOpacity = 0.0;
export let currentCursiveColor = '#000000';

export function updateDayNightCycle(currentTime, realDeltaTime, state, onCursiveColorChange) {
  const targets = getDayNightTargets(currentTime, state);
  const transitionSpeed = Math.min(2.0 * realDeltaTime, 1.0);

  currentBg.r1 += (targets.bg.r1 - currentBg.r1) * transitionSpeed;
  currentBg.g1 += (targets.bg.g1 - currentBg.g1) * transitionSpeed;
  currentBg.b1 += (targets.bg.b1 - currentBg.b1) * transitionSpeed;

  currentBg.r2 += (targets.bg.r2 - currentBg.r2) * transitionSpeed;
  currentBg.g2 += (targets.bg.g2 - currentBg.g2) * transitionSpeed;
  currentBg.b2 += (targets.bg.b2 - currentBg.b2) * transitionSpeed;

  currentBg.r3 += (targets.bg.r3 - currentBg.r3) * transitionSpeed;
  currentBg.g3 += (targets.bg.g3 - currentBg.g3) * transitionSpeed;
  currentBg.b3 += (targets.bg.b3 - currentBg.b3) * transitionSpeed;

  const r1 = Math.round(currentBg.r1);
  const g1 = Math.round(currentBg.g1);
  const b1 = Math.round(currentBg.b1);

  const r2 = Math.round(currentBg.r2);
  const g2 = Math.round(currentBg.g2);
  const b2 = Math.round(currentBg.b2);

  const r3 = Math.round(currentBg.r3);
  const g3 = Math.round(currentBg.g3);
  const b3 = Math.round(currentBg.b3);

  document.body.style.background = `radial-gradient(circle at top, rgb(${r1},${g1},${b1}) 0%, rgb(${r2},${g2},${b2}) 45%, rgb(${r3},${g3},${b3}) 100%)`;

  if (ambientLight) {
    currentAmbientIntensity += (targets.ambientIntensity - currentAmbientIntensity) * transitionSpeed;
    ambientLight.intensity = currentAmbientIntensity;
    currentAmbientColor.lerp(new THREE.Color(targets.ambient), transitionSpeed);
    ambientLight.color.copy(currentAmbientColor);
  }

  if (directionalLight) {
    currentDirIntensity += (targets.dirIntensity - currentDirIntensity) * transitionSpeed;
    directionalLight.intensity = currentDirIntensity;
    currentDirColor.lerp(new THREE.Color(targets.dir), transitionSpeed);
    directionalLight.color.copy(currentDirColor);
  }

  document.body.classList.remove('theme-clay', 'theme-cobalt', 'theme-emerald', 'theme-crimson', 'dark');
  if (targets.dark) {
    document.body.classList.add('theme-cobalt', 'dark');
  } else {
    const isSceneActive = state.isOrbitAnimating || state.selectedTextbox;
    const activeIdx = state.isOrbitAnimating ? state.currentSeqIndex : state.activeNavIndex;
    if (activeBackdropMode === 'cycle' && isSceneActive && activeIdx === 5) {
      document.body.classList.add('theme-emerald');
    } else if (activeBackdropMode === 'cycle' && isSceneActive && activeIdx === 3) {
      document.body.classList.add('theme-crimson');
    } else {
      document.body.classList.add('theme-clay');
    }
  }

  currentStarsOpacity += (targets.stars - currentStarsOpacity) * transitionSpeed;
  updateStarfield(currentStarsOpacity, transitionSpeed, currentTime);

  const targetCursiveColor = targets.dark ? '#ffffff' : '#000000';
  if (currentCursiveColor !== targetCursiveColor) {
    currentCursiveColor = targetCursiveColor;
    if (onCursiveColorChange) {
      onCursiveColorChange(currentCursiveColor);
    }
  }
}
