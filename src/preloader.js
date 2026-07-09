import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Preloader state constants
export const STATE_DRIFTING = 'drifting';
export const STATE_LOADING = 'loading';
export const STATE_COUNTDOWN = 'countdown';
export const STATE_HANDOFF = 'handoff';

let currentState = STATE_DRIFTING;
let preloaderActive = true;
let handoffActive = false;
let handoffProgress = 0;

// Three.js elements
let preloaderGroup = null;
let rocketShip = null;
const smokeMeshes = []; // Smoke_1 to Smoke_5
let starfieldRef = null;

// Positioning & Physics
export const preloaderCenterZ = 12; // Position preloader scene at Z = 12
const rocketBasePos = new THREE.Vector3(-1.5, -1.8, preloaderCenterZ);
const forwardDirection = new THREE.Vector3(1.0, 1.2, 0.0).normalize(); // Flight path vector (tilted in XY, constant Z)

let driftSpeed = 0.15;
let currentSpeed = driftSpeed;
let currentAltitude = 124.0; // Starting altitude (km)
let preloaderTimer = 0.0;
let loadingStartTime = 0.0;
let countdownTimer = 5.0; // Countdown starts at T-5s
let handoffTimer = 0.0;
let assetsLoadedFlag = false;

export function markAssetsLoaded() {
  assetsLoadedFlag = true;
}

// Sway values (pitch/roll)
let swayAmplitude = 0.05;

// Camera properties (three-quarters isometric profile view matching Blender)
const cameraStartPos = new THREE.Vector3(5.0, 5.0, 16.0);
const cameraStartTarget = new THREE.Vector3(0, 0, 7.0);

// Terminal nodes
let terminalBody = null;
let speedEl = null;
let altEl = null;
let timerEl = null;

const textQueue = [];
let typingActive = false;
const TYPING_SPEED = 20; // ms per char
const LINE_DELAY = 150; // ms between lines

// Simulated logs queue config
const bootLogs = [
  { text: '$ systemctl start portfolio.service', type: 'cmd' },
  { text: '[MCC] System boot initialized. Uplink status: ONLINE', type: 'info' },
  { text: '[MCC] Establishing WebGL2 renderer context (Three.js r160)... OK', type: 'info' },
  { text: '[MCC] Node.js Environment v20.11.0 detected', type: 'info' },
  { text: '[MCC] Day-Night Cycle simulator starting... OK', type: 'info' },
  { text: '[MCC] Main propulsion in STANDBY mode. Rocket drifting.', type: 'warn' }
];

const moduleLogs = [
  { text: '[MCC] Loading portfolio modules and 3D assets...', type: 'info' },
  { text: '[INIT] Module: [Resume & Welcome] -> Initializing... OK', type: 'pink' },
  { text: '[ASSET] gltf: city_at_night_v4_meshopt.glb (5.5MB) ... OK', type: 'pink' },
  { text: '[ASSET] gltf: motorcycle.glb (1.1MB) ... OK', type: 'pink' },
  { text: '[INIT] Module: [School Education] -> Coursework registry loading... OK', type: 'purple' },
  { text: '[ASSET] gltf: school_v2_meshopt.glb (9.1MB) ... OK', type: 'purple' },
  { text: '[ASSET] gltf: airplane.glb (0.4MB) ... OK', type: 'purple' },
  { text: '[INIT] Module: [Technical Skills] -> Language & tool database loading... OK', type: 'yellow' },
  { text: '[ASSET] gltf: landscape_v5_meshopt.glb (4.2MB) ... OK', type: 'yellow' },
  { text: '[ASSET] gltf: car_v2.glb (0.7MB) ... OK', type: 'yellow' },
  { text: '[INIT] Module: [Experience Pipelines] -> Data pipelines & microservices loading... OK', type: 'green' },
  { text: '[ASSET] gltf: beach_v2_meshopt.glb (9.5MB) ... OK', type: 'green' },
  { text: '[ASSET] gltf: boat.glb (16.7KB) ... OK', type: 'green' },
  { text: '[INIT] Module: [Projects Registry] -> Codebases & APIs loading... OK', type: 'orange' },
  { text: '[ASSET] gltf: desert_v3_meshopt.glb (3.5MB) ... OK', type: 'orange' },
  { text: '[ASSET] gltf: bronco.glb (0.2MB) ... OK', type: 'orange' },
  { text: '[INIT] Module: [Hobbies & Music] -> Custom audio & media player loading... OK', type: 'blue' },
  { text: '[ASSET] gltf: cafe_meshopt.glb (2.2MB) ... OK', type: 'blue' },
  { text: '[ASSET] gltf: sls_amg_63_black_series.glb (5.3MB) ... OK', type: 'blue' },
  { text: '[INIT] Core: [Easter Egg Movie] -> Preloading castle.mp4 & media rigs... OK', type: 'pink' }
];

export function isPreloaderActive() {
  return preloaderActive;
}

export function isHandoffActive() {
  return handoffActive;
}

export function getPreloaderCameraTransform() {
  return {
    position: cameraStartPos,
    target: cameraStartTarget
  };
}

export function getPreloaderHandoffProgress() {
  return handoffProgress;
}

// Push to terminal queue
function logToTerminal(text, type = 'info') {
  textQueue.push({ text, type });
  processQueue();
}

function processQueue() {
  if (typingActive || textQueue.length === 0 || !terminalBody) return;
  typingActive = true;

  const { text, type } = textQueue.shift();
  const lineNode = document.createElement('div');
  lineNode.className = `terminal-line line-${type}`;
  terminalBody.appendChild(lineNode);
  terminalBody.scrollTop = terminalBody.scrollHeight;

  let charIdx = 0;
  function typeChar() {
    if (!preloaderActive) return;
    if (charIdx < text.length) {
      lineNode.textContent += text.charAt(charIdx);
      charIdx++;
      setTimeout(typeChar, TYPING_SPEED);
    } else {
      typingActive = false;
      setTimeout(() => {
        processQueue();
      }, LINE_DELAY);
    }
  }
  typeChar();
}

export function initPreloader(scene, camera, starfield, onLoaded) {
  starfieldRef = starfield;
  preloaderGroup = new THREE.Group();
  scene.add(preloaderGroup);

  // Position preloader camera initially
  camera.position.copy(cameraStartPos);
  camera.lookAt(cameraStartTarget);
  camera.up.set(0, 1, 0);

  // Set up terminal nodes
  terminalBody = document.getElementById('terminal-body');
  speedEl = document.getElementById('telemetry-speed');
  altEl = document.getElementById('telemetry-alt');
  timerEl = document.getElementById('telemetry-time');

  // Start printing boot logs
  bootLogs.forEach(log => logToTerminal(log.text, log.type));

  // Load custom rocket model
  const loader = new GLTFLoader();
  loader.load('/assets/models/rocket_v1.glb', (gltf) => {
    const model = gltf.scene;
    
    // Find the Rocket_Ship body group and smoke nodes
    model.traverse((child) => {
      if (child.name === 'Rocket_Ship' && !child.isMesh) {
        rocketShip = child;
        console.log("Preloader: Matched rocket parent group object:", child.name);
      } else if (child.isMesh) {
        const lowerName = child.name.toLowerCase();
        if (lowerName.includes('smoke_')) {
          const parts = lowerName.split('smoke_');
          const numStr = parts[parts.length - 1];
          const idx = parseInt(numStr) - 1;
          if (idx >= 0 && idx < 5) {
            smokeMeshes[idx] = child;
            // Hide smoke initially during drifting phase
            child.visible = false;
            child.scale.set(0, 0, 0);
            console.log("Preloader: Matched smoke mesh:", child.name, "index:", idx);
          }
        }
      }
    });

    if (rocketShip) {
      rocketShip.children.forEach((child) => {
        child.position.z += 0.018385;
      });
      console.log("Preloader: Shifted rocket children by Z += 0.018385 to align centerline with pivot.");
    }

    // Add model to preloader group
    preloaderGroup.position.copy(rocketBasePos);
    preloaderGroup.add(model);
    console.log("Preloader: rocket_v1.glb loaded successfully.");
    
    if (onLoaded) onLoaded();
  }, undefined, (err) => {
    console.error("Preloader: failed to load rocket_v1.glb, using placeholder.", err);
    // Setup simple placeholder so the app doesn't crash if model fails
    rocketShip = new THREE.Group();
    preloaderGroup.add(rocketShip);
    if (onLoaded) onLoaded();
  });
}

// Triggered when main assets start loading (after 5s)
function startAssetLoadingLogs() {
  currentState = STATE_LOADING;
  loadingStartTime = preloaderTimer;
  moduleLogs.forEach(log => logToTerminal(log.text, log.type));
}

// Triggered when assets finish loading and logs are complete
export function triggerCountdown() {
  if (currentState === STATE_COUNTDOWN || currentState === STATE_HANDOFF) return;
  currentState = STATE_COUNTDOWN;
  countdownTimer = 5.0;

  logToTerminal("[MCC] All 12/12 assets loaded. Systems check: NOMINAL.", 'success');
  logToTerminal("[MCC] T-5s: Locking internal guidance system... [LOCKED]", 'white');
  
  setTimeout(() => {
    logToTerminal("[MCC] T-4s: Pressurizing booster fuel tanks... [NOMINAL]", 'white');
  }, 1000);

  setTimeout(() => {
    logToTerminal("[MCC] T-3s: Launch command confirmed. Starting engine ignition...", 'orange');
  }, 2000);

  setTimeout(() => {
    logToTerminal("[MCC] T-2s: Stabilizers engaged. Decelerating drift sway... [0.0° deviation]", 'cyan');
  }, 3000);

  setTimeout(() => {
    logToTerminal("[MCC] T-1s: Thrusters at 100% power... [Smoke_1 to Smoke_5 sequential plume active]", 'orange');
  }, 4000);

  setTimeout(() => {
    logToTerminal("[MCC] T-0s: LIFTOFF! We have liftoff of the Portfolio Explorer! 🚀", 'success');
    // Start translation acceleration and camera handoff
    handoffActive = true;
    handoffTimer = 0.0;
    currentState = STATE_HANDOFF;
  }, 5000);
}

export function updatePreloader(dt, camera) {
  if (!preloaderActive) return;

  preloaderTimer += dt;

  // Self-heal DOM references in case the DOM elements load slightly after JS execution
  if (!terminalBody) {
    terminalBody = document.getElementById('terminal-body');
    if (terminalBody) {
      processQueue();
    }
  }
  if (!speedEl) speedEl = document.getElementById('telemetry-speed');
  if (!altEl) altEl = document.getElementById('telemetry-alt');
  if (!timerEl) timerEl = document.getElementById('telemetry-time');

  if (timerEl) {
    timerEl.innerText = preloaderTimer.toFixed(1) + 's';
  }

  // Update camera position to follow rocket in isometric three-quarters perspective
  if (currentState !== STATE_HANDOFF && camera && preloaderGroup) {
    camera.position.copy(preloaderGroup.position).add(new THREE.Vector3(3.0, 3.0, 3.0));
    camera.lookAt(preloaderGroup.position);
    camera.up.set(0, 1, 0);
  }

  // If assets are loaded and we reached the 10-second mark, trigger the launch countdown
  if ((currentState === STATE_DRIFTING || currentState === STATE_LOADING) && assetsLoadedFlag && preloaderTimer >= 10.0) {
    triggerCountdown();
  }

  // --- Telemetry calculations & updates ---
  if (currentState === STATE_DRIFTING) {
    // Phase 1: Drifting (0s - 5s)
    currentSpeed = driftSpeed + Math.sin(preloaderTimer * 2) * 0.005;
    currentAltitude += currentSpeed * dt * 0.1; // slowly gain altitude

    // Switch to loading logs at exactly 5 seconds
    if (preloaderTimer >= 5.0) {
      startAssetLoadingLogs();
    }
  } else if (currentState === STATE_LOADING) {
    // Phase 2: Loading (Starts at 5s)
    // Maintain drift speed, but start updating altitude
    currentSpeed = driftSpeed + Math.sin(preloaderTimer * 2) * 0.005;
    currentAltitude += currentSpeed * dt * 0.1;
  } else if (currentState === STATE_COUNTDOWN) {
    // Phase 3: Countdown (MCC Countdown)
    countdownTimer -= dt;
    if (countdownTimer <= 3.0) {
      // Ignition happens at T-3s. Telemetry speed spikes!
      const ignitionDuration = 3.0 - countdownTimer; // 0 to 3
      currentSpeed = THREE.MathUtils.lerp(driftSpeed, 12.5, ignitionDuration / 3.0);
    }
    currentAltitude += currentSpeed * dt * 0.5;
  } else if (currentState === STATE_HANDOFF) {
    // Phase 4: Liftoff & Handoff
    handoffTimer += dt;
    // Fast acceleration to terminal high speed
    currentSpeed = THREE.MathUtils.lerp(12.5, 45.7, Math.min(handoffTimer / 1.5, 1.0));
    currentAltitude += currentSpeed * dt * 1.5;

    // Transition progress (0.0 to 1.0)
    handoffProgress = Math.min(handoffTimer / 2.0, 1.0); // 2 seconds camera pan

    // Once handoff is complete, deactivate preloader
    if (handoffProgress >= 1.0) {
      preloaderActive = false;
      stopPreloader();
    }
  }

  // Update HUD text
  if (speedEl) speedEl.innerText = currentSpeed.toFixed(2) + ' km/s';
  if (altEl) altEl.innerText = currentAltitude.toFixed(1) + ' km';

  // --- Rocket Sway, Translation, and Starfield rotation ---
  if (rocketShip) {
    // Translate the rocket along its forwardDirection based on current speed
    preloaderGroup.position.addScaledVector(forwardDirection, currentSpeed * dt);

    // Apply drift sway and handle deceleration/stabilization
    let swayFactor = 1.0;
    if (currentState === STATE_COUNTDOWN && countdownTimer <= 3.0) {
      // Damping sway amplitude to 0 over 2 seconds during countdown ignition
      const stabilizationDuration = Math.min((3.0 - countdownTimer) / 2.0, 1.0);
      swayFactor = 1.0 - stabilizationDuration;
    } else if (currentState === STATE_HANDOFF) {
      swayFactor = 0.0;
    }

    const localLongitudinal = new THREE.Vector3(1, 1, 0).normalize();
    const localTransverse1 = new THREE.Vector3(1, -1, 0).normalize();
    const localTransverse2 = new THREE.Vector3(0, 0, 1);

    const baseQuat = new THREE.Quaternion().setFromUnitVectors(localLongitudinal, forwardDirection);

    // Continuous slow roll rotation around the rocket's longitudinal local axis to show 3D volume
    const rollAngle = preloaderTimer * 0.25; // slow roll rate
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(localLongitudinal, rollAngle);

    if (swayFactor > 0.0) {
      // Oscillate pitch and yaw slowly around local transverse axes
      const pitchAngle = Math.sin(preloaderTimer * 1.5) * 0.05 * swayFactor;
      const yawAngle = Math.cos(preloaderTimer * 1.8) * 0.05 * swayFactor;
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(localTransverse1, pitchAngle);
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(localTransverse2, yawAngle);
      const swayQuat = new THREE.Quaternion().multiplyQuaternions(pitchQuat, yawQuat);
      // Combine base orientation * roll * sway
      rocketShip.quaternion.copy(baseQuat).multiply(rollQuat).multiply(swayQuat);
    } else {
      // Completely stabilized in sway, but keep rolling
      rocketShip.quaternion.copy(baseQuat).multiply(rollQuat);
    }

    // --- Smoke sequential fade-in (countdown ignition onwards) ---
    const ignitionActive = (currentState === STATE_COUNTDOWN) || (currentState === STATE_HANDOFF);

    if (ignitionActive) {
      let elapsedPlumeTime = 0.0;
      if (currentState === STATE_HANDOFF) {
        elapsedPlumeTime = 5.0; // keep fully active
      } else {
        elapsedPlumeTime = 5.0 - countdownTimer; // time since countdown started
      }

      // Sequential delay between each smoke segment (Smoke_1 = largest, Smoke_5 = smallest)
      const delayPerSmoke = 0.25; // 250ms spacing

      smokeMeshes.forEach((smoke, idx) => {
        if (!smoke) return;
        const triggerTime = idx * delayPerSmoke;
        if (elapsedPlumeTime >= triggerTime) {
          smoke.visible = true;
          const fadeProgress = Math.min((elapsedPlumeTime - triggerTime) / 0.5, 1.0);
          const pulse = 1.0 + Math.sin(preloaderTimer * 28.0 + idx * 2.0) * 0.12;
          const targetScale = fadeProgress * pulse;
          smoke.scale.set(targetScale, targetScale, targetScale);
        } else {
          smoke.visible = false;
          smoke.scale.set(0, 0, 0);
        }
      });
    } else {
      // Drifting and loading logs phase: smoke is completely hidden
      smokeMeshes.forEach(smoke => {
        if (smoke) {
          smoke.visible = false;
          smoke.scale.set(0, 0, 0);
        }
      });
    }
  }

  // --- Background Starfield control ---
  if (starfieldRef) {
    if (currentState === STATE_DRIFTING || currentState === STATE_LOADING) {
      // Keep stars static so the rocket's roll is clearly visible against the starry backdrop
      starfieldRef.rotation.set(0, 0, 0);
    } else if (currentState === STATE_COUNTDOWN) {
      // Slowly start rotating stars during ignition to build liftoff tension
      const speedUpDuration = Math.min((3.0 - countdownTimer) / 3.0, 1.0);
      const rotationMultiplier = THREE.MathUtils.lerp(0.0, 5.0, Math.max(0, speedUpDuration));
      starfieldRef.rotation.y += 0.005 * rotationMultiplier * dt;
      starfieldRef.rotation.x += 0.003 * rotationMultiplier * dt;
    } else if (currentState === STATE_HANDOFF) {
      // High-speed warp stars rotating/rushing by
      const rotationMultiplier = THREE.MathUtils.lerp(25.0, 120.0, handoffProgress);
      starfieldRef.rotation.y += 0.015 * rotationMultiplier * dt;
      starfieldRef.rotation.x += 0.008 * rotationMultiplier * dt;
    }
  }
}

export function stopPreloader() {
  preloaderActive = false;
  handoffActive = false;

  // Slide terminal out and fade rocket HUD out
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
  }

  // Fade out starfield rotation multiplier back to normal
  if (starfieldRef) {
    // Reset starfield rotation values to standard small rates
    starfieldRef.rotation.set(0, 0, 0);
  }

  // Remove preloader group from scene to free memory
  if (preloaderGroup) {
    preloaderGroup.clear();
    if (preloaderGroup.parent) {
      preloaderGroup.parent.remove(preloaderGroup);
    }
  }
}
