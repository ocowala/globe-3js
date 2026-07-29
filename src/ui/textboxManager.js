import * as THREE from 'three';
import { scene, camera, controls, _tempV3_1, _tempV3_2, _tempV3_3, _tempV3_4, _tempV3_5, _tempV3_6, _tempMatrix } from '../core/context.js';
import { cylinderParams, SECTOR_NAMES, SECTOR_PASTEL_COLORS } from '../core/constants.js';
import { getSnappedData } from '../utils/geometry.js';
import { getFocusFOV } from '../utils/responsive.js';
import { drawTextBoxCanvas } from './textboxCanvas.js';
import { camGuiState, setIsOrbitAnimating } from '../camera/cameraManager.js';

export let selectedTextbox = null;
export let textboxFocusState = 'idle'; // 'idle' | 'entering' | 'focused' | 'exiting'
export let textboxFocusTimer = 0.0;
export const TEXTBOX_FOCUS_DURATION = 0.85;
export const TEXTBOX_FOCUS_DISTANCE = 3.8;

export const textboxFocusTargetPos = new THREE.Vector3();
export const textboxFocusTargetLookAt = new THREE.Vector3();
export const textboxFocusTargetUp = new THREE.Vector3();

export const textboxFocusPrePos = new THREE.Vector3();
export const textboxFocusPreTarget = new THREE.Vector3();
export const textboxFocusPreUp = new THREE.Vector3();
export let textboxFocusPreFOV = 38;

export const textboxFocusLerpStartPos = new THREE.Vector3();
export const textboxFocusLerpStartTarget = new THREE.Vector3();
export const textboxFocusLerpStartUp = new THREE.Vector3();
export let textboxFocusLerpStartFOV = 38;

export function setSelectedTextbox(tb) { selectedTextbox = tb; }
export function setTextboxFocusState(st) { textboxFocusState = st; }
export function setTextboxFocusTimer(t) { textboxFocusTimer = t; }

export const sceneTextboxes = {
  'City': [],
  'School': [],
  'Landscape': [],
  'Beach': [],
  'Desert': [],
  'Cafe': []
};

export const staticTextboxConfigs = {
  'City': [
    { angleOffset: 12.0, data: { title: "advitiya jadhav", subtitle: "computer engineering student & developer", badges: ["systems", "full stack"] } },
    { angleOffset: -16.0, data: { title: "contact & links", subtitle: "email: jadhav31@purdue.edu | phone: +1 732 853 5756", badges: ["email", "github", "linkedin"] } }
  ],
  'School': [
    { angleOffset: 6.0, data: { title: "purdue university", subtitle: "computer engineering | grad: may 2028", badges: ["GPA: 3.7", "75+ Credits"] } },
    { angleOffset: -8.0, data: { title: "relevant coursework", subtitle: "computing and engineering fundamentals", badges: ["data structures", "digital systems", "advanced c", "math"] } }
  ],
  'Landscape': [
    { angleOffset: 0.0, data: { title: "technical skills", subtitle: "languages, frameworks & tools", badges: ["languages", "frameworks", "devops", "cloud"], isSkills: true } }
  ],
  'Beach': [
    { angleOffset: 4.5, data: { title: "milliman", subtitle: "software development intern | may 2026 - aug 2026", badges: ["api security", "llm drug search", "excel report ui", "github actions"] } },
    { angleOffset: -17.5, data: { title: "purdue extension", subtitle: "assistant web developer | jun 2025 - present", badges: ["react / wordpress", "accessibility", "expertise database"] } }
  ],
  'Desert': [
    { angleOffset: 1.5, data: { title: "car auction market", subtitle: "live market aggregation & price prediction", badges: ["python scraper", "express backend", "react frontend", "postgresql"] } },
    { angleOffset: -17.5, data: { title: "extensionllm", subtitle: "llm-powered search and rag pipeline", badges: ["langchain", "vector database", "rag pipeline", "react search"] } },
    { angleOffset: -36.5, data: { title: "spellkasten", subtitle: "interactive word-graph semantic visualization", badges: ["d3.js", "force-directed graph", "express backend", "shortest path"] } }
  ],
  'Cafe': [
    { angleOffset: -10.0, data: { title: "cooking", subtitle: "cuisine, dessert & methods", badges: ["thai", "falooda", "flambeing"] } },
    { angleOffset: -32.0, data: { title: "tennis", subtitle: "recreational play, rallying & fitness", badges: ["singles", "doubles", "cardio"] } }
  ]
};

export const navLabelConfig = [
  { scene: 'City', label: 'Resume', color: SECTOR_PASTEL_COLORS[0] },
  { scene: 'School', label: 'School', color: SECTOR_PASTEL_COLORS[1] },
  { scene: 'Landscape', label: 'Skills', color: SECTOR_PASTEL_COLORS[2] },
  { scene: 'Beach', label: 'Experience', color: SECTOR_PASTEL_COLORS[3] },
  { scene: 'Desert', label: 'Projects', color: SECTOR_PASTEL_COLORS[4] },
  { scene: 'Cafe', label: 'Hobbies', color: SECTOR_PASTEL_COLORS[5] }
];

export function createTextBox(data, pastelColor = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  canvas.setAttribute('data-color', pastelColor);
  drawTextBoxCanvas(canvas, data, pastelColor, false, texture);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  material.userData.originalOpacity = 0.85;

  const geometry = new THREE.PlaneGeometry(2.0, 1.0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'textbox';
  mesh.userData = { canvas, data, pastelColor };

  return mesh;
}

export function updateVehicleTextbox(group, params) {
  if (!group) return;
  const textbox = group.getObjectByName('textbox');
  if (!textbox) return;

  textbox.position.set(params.textboxOffsetX, params.textboxOffsetY, params.textboxOffsetZ);
  textbox.rotation.set(params.textboxRotX, params.textboxRotY, params.textboxRotZ);

  const s = (1.0 / Math.max(params.scale, 0.0001)) * params.textboxScale;
  textbox.scale.set(s, s, s);
}

export function initStaticTextboxes() {
  for (const name in staticTextboxConfigs) {
    const configs = staticTextboxConfigs[name];
    const labelCfg = navLabelConfig.find(item => item.scene === name);
    const pastelColor = labelCfg ? labelCfg.color : '#ffffff';
    configs.forEach((cfg) => {
      const mesh = createTextBox(cfg.data, pastelColor);
      mesh.visible = false;
      scene.add(mesh);
      sceneTextboxes[name].push({
        mesh: mesh,
        angleOffset: cfg.angleOffset,
        baseScale: 1.0,
        currentScale: 1.0,
        targetScale: 1.0,
        targetOpacity: 0.85,
        data: cfg.data
      });
    });
  }
}

export function updateSceneTextboxes(sceneName, refAngle, height, cache, raycastFn, hoverOffset, params) {
  const textboxes = sceneTextboxes[sceneName];
  if (!textboxes) return;

  textboxes.forEach((tb) => {
    const angle = refAngle + THREE.MathUtils.degToRad(tb.angleOffset);
    let snappedRadius = 0.0;
    if (cache && raycastFn) {
      const snapped = getSnappedData(cache, raycastFn, angle);
      snappedRadius = snapped.posRadius;
    } else {
      snappedRadius = cylinderParams.radius;
    }

    const radialDir = _tempV3_1.set(Math.cos(angle), Math.sin(angle), 0).normalize();
    const tangentDir = _tempV3_2.set(-Math.sin(angle), Math.cos(angle), 0).normalize();
    const heightDir = _tempV3_3.set(0, 0, 1);

    const baseRadius = snappedRadius + hoverOffset;
    const basePos = _tempV3_4.copy(radialDir).multiplyScalar(baseRadius);
    basePos.z = height;

    const finalPos = _tempV3_5.copy(basePos)
      .addScaledVector(tangentDir, params.textboxOffsetX)
      .addScaledVector(radialDir, params.textboxOffsetY + 0.85)
      .addScaledVector(heightDir, params.textboxOffsetZ);

    tb.mesh.position.copy(finalPos);

    const negTangent = _tempV3_6.copy(tangentDir).negate();
    _tempMatrix.makeBasis(negTangent, radialDir, heightDir);
    tb.mesh.quaternion.setFromRotationMatrix(_tempMatrix);

    tb.baseScale = params.textboxScale;
    if (tb.currentScale === undefined) tb.currentScale = params.textboxScale;
    if (tb.targetScale === undefined) tb.targetScale = params.textboxScale;
    if (tb.targetOpacity === undefined) tb.targetOpacity = 0.85;
  });
}

export function applyTextboxHighlight(tb, selected) {
  tb.targetScale = selected ? tb.baseScale * 1.55 : tb.baseScale;
  tb.targetOpacity = selected ? 1.0 : 0.85;
}

export function selectTextbox(tb, cameraFollowState = {}) {
  if (selectedTextbox && selectedTextbox !== tb) {
    applyTextboxHighlight(selectedTextbox, false);
    if (selectedTextbox.mesh && selectedTextbox.mesh.userData && selectedTextbox.mesh.material.map) {
      const { canvas, data, pastelColor } = selectedTextbox.mesh.userData;

      if (selectedTextbox.mesh.userData.portraitGeometry) {
        selectedTextbox.mesh.geometry = selectedTextbox.mesh.userData.originalGeometry;
        selectedTextbox.mesh.userData.portraitGeometry.dispose();
        selectedTextbox.mesh.userData.portraitGeometry = null;

        selectedTextbox.mesh.material.map.dispose();
        canvas.width = 2048;
        canvas.height = 1024;
        const newTexture = new THREE.CanvasTexture(canvas);
        newTexture.minFilter = THREE.LinearFilter;
        selectedTextbox.mesh.material.map = newTexture;
      }

      drawTextBoxCanvas(canvas, data, pastelColor, false, selectedTextbox.mesh.material.map);
      selectedTextbox.mesh.material.map.needsUpdate = true;
    }
  }

  selectedTextbox = tb;
  applyTextboxHighlight(tb, true);

  const currentTarget = new THREE.Vector3();
  if (cameraFollowState.cameraFollowEnabled && !cameraFollowState.isPostSequence) {
    currentTarget.copy(cameraFollowState.currentCamTarget);
  } else {
    currentTarget.copy(controls.target);
  }

  textboxFocusPrePos.copy(camera.position);
  textboxFocusPreTarget.copy(currentTarget);
  textboxFocusPreUp.copy(camera.up);
  textboxFocusPreFOV = camera.fov;

  camGuiState.paused = true;
  setIsOrbitAnimating(false);

  const aspect = window.innerWidth / window.innerHeight;
  const isMobile = aspect < 1.0;

  const tbPos = tb.mesh.position.clone();
  textboxFocusTargetLookAt.copy(tbPos);

  const focusDistance = isMobile ? 2.4 : TEXTBOX_FOCUS_DISTANCE;
  textboxFocusTargetPos.set(tbPos.x, tbPos.y, tbPos.z + focusDistance);

  const radialXY = new THREE.Vector2(tbPos.x, tbPos.y);
  if (radialXY.length() > 0.001) {
    radialXY.normalize();
    textboxFocusTargetUp.set(radialXY.x, radialXY.y, 0);
  } else {
    textboxFocusTargetUp.set(1, 0, 0);
  }

  textboxFocusLerpStartPos.copy(camera.position);
  textboxFocusLerpStartTarget.copy(currentTarget);
  textboxFocusLerpStartUp.copy(camera.up);
  textboxFocusLerpStartFOV = camera.fov;

  textboxFocusState = 'entering';
  textboxFocusTimer = 0.0;
  controls.enabled = false;

  if (tb.mesh && tb.mesh.userData && tb.mesh.material.map) {
    const { canvas, data, pastelColor } = tb.mesh.userData;

    if (isMobile) {
      if (!tb.mesh.userData.originalGeometry) {
        tb.mesh.userData.originalGeometry = tb.mesh.geometry;
      }
      const portraitGeometry = new THREE.PlaneGeometry(1.2, 1.8);
      tb.mesh.geometry = portraitGeometry;
      tb.mesh.userData.portraitGeometry = portraitGeometry;

      tb.mesh.material.map.dispose();
      canvas.width = 1024;
      canvas.height = 1536;
      const newTexture = new THREE.CanvasTexture(canvas);
      newTexture.minFilter = THREE.LinearFilter;
      tb.mesh.material.map = newTexture;
    }

    drawTextBoxCanvas(canvas, data, pastelColor, true, tb.mesh.material.map);
    tb.mesh.material.map.needsUpdate = true;
  }
}

export function deselectTextbox() {
  if (!selectedTextbox) return;

  if (selectedTextbox.mesh && selectedTextbox.mesh.userData && selectedTextbox.mesh.material.map) {
    const { canvas, data, pastelColor } = selectedTextbox.mesh.userData;

    if (selectedTextbox.mesh.userData.portraitGeometry) {
      selectedTextbox.mesh.geometry = selectedTextbox.mesh.userData.originalGeometry;
      selectedTextbox.mesh.userData.portraitGeometry.dispose();
      selectedTextbox.mesh.userData.portraitGeometry = null;

      selectedTextbox.mesh.material.map.dispose();
      canvas.width = 2048;
      canvas.height = 1024;
      const newTexture = new THREE.CanvasTexture(canvas);
      newTexture.minFilter = THREE.LinearFilter;
      selectedTextbox.mesh.material.map = newTexture;
    }

    drawTextBoxCanvas(canvas, data, pastelColor, false, selectedTextbox.mesh.material.map);
    selectedTextbox.mesh.material.map.needsUpdate = true;
  }

  applyTextboxHighlight(selectedTextbox, false);
  selectedTextbox = null;

  textboxFocusLerpStartPos.copy(camera.position);
  textboxFocusLerpStartTarget.copy(controls.target);
  textboxFocusLerpStartUp.copy(camera.up);
  textboxFocusLerpStartFOV = camera.fov;

  textboxFocusState = 'exiting';
  textboxFocusTimer = 0.0;
  controls.enabled = false;
}

export function addTextboxGUI(folder, params, updateFn, sceneName) {
  const textboxes = sceneTextboxes[sceneName];
  if (!textboxes) return;
  textboxes.forEach((tb, i) => {
    const tbFolder = folder.addFolder(`Textbox ${i + 1}`);
    tbFolder.add(tb, 'posX', -10, 10).step(0.01).name('Pos X').onChange(updateFn);
    tbFolder.add(tb, 'posY', -10, 10).step(0.01).name('Pos Y').onChange(updateFn);
    tbFolder.add(tb, 'posZ', -10, 10).step(0.01).name('Pos Z').onChange(updateFn);
    tbFolder.add(tb, 'baseScale', 0.1, 5.0).step(0.01).name('Scale').onChange(updateFn);
    tbFolder.add(tb, 'rotX', -Math.PI, Math.PI).step(0.01).name('Rot X').onChange(updateFn);
    tbFolder.add(tb, 'rotY', -Math.PI, Math.PI).step(0.01).name('Rot Y').onChange(updateFn);
    tbFolder.add(tb, 'rotZ', -Math.PI, Math.PI).step(0.01).name('Rot Z').onChange(updateFn);
  });
}
