import * as THREE from 'three';
import { scene } from '../core/context.js';
import { cylinderParams, SECTOR_PASTEL_COLORS } from '../core/constants.js';
import { createRingSectorGeometry } from '../utils/geometry.js';
import { hoverScenes } from '../utils/loaders.js';

export const navLabelConfig = [
  { key: 'home', label: 'Resume', scene: 'City', angle: 1.73, color: SECTOR_PASTEL_COLORS[0], vehicleIdx: 0 },
  { key: 'school', label: 'School', scene: 'School', angle: 0.74, color: SECTOR_PASTEL_COLORS[1], vehicleIdx: 1 },
  { key: 'skills', label: 'Skills', scene: 'Landscape', angle: -0.06, color: SECTOR_PASTEL_COLORS[2], vehicleIdx: 2 },
  { key: 'experience', label: 'Experience', scene: 'Beach', angle: -0.95, color: SECTOR_PASTEL_COLORS[3], vehicleIdx: 3 },
  { key: 'projects', label: 'Projects', scene: 'Desert', angle: -1.86, color: SECTOR_PASTEL_COLORS[4], vehicleIdx: 4 },
  { key: 'hobbies', label: 'Hobbies', scene: 'Cafe', angle: 3.1, color: SECTOR_PASTEL_COLORS[5], vehicleIdx: 5 },
];

export const navLabelParams = {
  homeZOffset: 4.015,
  homeAngle: 1.73,
  schoolZOffset: 4.015,
  schoolAngle: 0.74,
  skillsZOffset: 4.015,
  skillsAngle: -0.1,
  experienceZOffset: 4.015,
  experienceAngle: -1.00,
  projectsZOffset: 4.03,
  projectsAngle: -2.1,
  hobbiesZOffset: 4.015,
  hobbiesAngle: 2.87
};

export let navLabels = [];
export let activeNavIndex = 0;
export function setActiveNavIndex(idx) { activeNavIndex = idx; }

export function createNavLabel(text, pastelHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const r = parseInt(pastelHex.slice(1, 3), 16);
  const g = parseInt(pastelHex.slice(3, 5), 16);
  const b = parseInt(pastelHex.slice(5, 7), 16);

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = `rgba(${Math.round(r * 0.75)}, ${Math.round(g * 0.75)}, ${Math.round(b * 0.75)}, 0.9)`;
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthTest: true
  });

  const innerR = cylinderParams.radius * cylinderParams.wallRatio;
  const outerR = cylinderParams.radius;

  const geometry = createRingSectorGeometry(innerR, outerR, 0.8, 32);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 999;

  return mesh;
}

export function updateNavLabelCanvas(entry, isHovered) {
  const mesh = entry.mesh;
  if (!mesh || !mesh.material || !mesh.material.map) return;

  const canvas = mesh.material.map.image;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pastelHex = entry.config.color;
  const r = parseInt(pastelHex.slice(1, 3), 16);
  const g = parseInt(pastelHex.slice(3, 5), 16);
  const b = parseInt(pastelHex.slice(5, 7), 16);

  if (isHovered) {
    const rLight = Math.round(r + (255 - r) * 0.5);
    const gLight = Math.round(g + (255 - g) * 0.5);
    const bLight = Math.round(b + (255 - b) * 0.5);
    ctx.fillStyle = `rgba(${rLight}, ${gLight}, ${bLight}, 0.95)`;
  } else {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = `rgba(${Math.round(r * 0.75)}, ${Math.round(g * 0.75)}, ${Math.round(b * 0.75)}, 0.9)`;
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.config.label, canvas.width / 2, canvas.height / 2);

  mesh.material.map.needsUpdate = true;
}

import { gui } from '../core/gui.js';

const _navUp = new THREE.Vector3(0, 0, 1);
const _navOutward = new THREE.Vector3();
const _navTangent = new THREE.Vector3();
const _navRotMatrix = new THREE.Matrix4();

export function updateNavLabelPositions() {
  navLabels.forEach((entry) => {
    const key = entry.config.key || entry.config.scene.toLowerCase();
    const zProp = key + 'ZOffset';
    const aProp = key + 'Angle';
    const angle = navLabelParams[aProp] !== undefined ? navLabelParams[aProp] : entry.baseAngle;
    const zPos = navLabelParams[zProp] !== undefined ? navLabelParams[zProp] : 4.015;

    entry.mesh.position.set(0, 0, zPos);

    _navOutward.set(Math.cos(angle), Math.sin(angle), 0);
    _navTangent.set(-Math.sin(angle), Math.cos(angle), 0);
    _navRotMatrix.makeBasis(_navOutward, _navTangent, _navUp);
    entry.mesh.quaternion.setFromRotationMatrix(_navRotMatrix);
  });
}

const navLabelFolder = gui.addFolder('Nav Labels');
navLabelConfig.forEach(config => {
  const f = navLabelFolder.addFolder(config.label);
  f.add(navLabelParams, config.key + 'ZOffset', 3.0, 5.0).step(0.005).name('Z Offset').onChange(updateNavLabelPositions);
  f.add(navLabelParams, config.key + 'Angle', -Math.PI, Math.PI).step(0.01).name('Angle').onChange(updateNavLabelPositions);
});
navLabelFolder.open();

export function initNavLabels() {
  navLabels.forEach(({ mesh }) => scene.remove(mesh));
  navLabels = [];

  navLabelConfig.forEach((config) => {
    const mesh = createNavLabel(config.label, config.color);
    mesh.visible = false;
    scene.add(mesh);
    navLabels.push({
      mesh,
      config,
      baseAngle: config.angle,
      targetOpacity: 0.0,
      targetScale: 1.0
    });
  });

  updateNavLabelPositions();
  window.labelsInitialized = true;
}

export function highlightNavLabel(activeIdx) {
  navLabels.forEach((entry, idx) => {
    const isCurrent = (idx === activeIdx);
    if (isCurrent) {
      entry.targetOpacity = 1.0;
      entry.targetScale = 1.25;
      if (hoverScenes[entry.config.scene]) {
        hoverScenes[entry.config.scene].target = 1.0;
      }
    } else {
      entry.targetOpacity = 0.75;
      entry.targetScale = 1.0;
      if (hoverScenes[entry.config.scene]) {
        hoverScenes[entry.config.scene].target = 0.0;
      }
    }
  });
}
