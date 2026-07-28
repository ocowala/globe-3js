import * as THREE from 'three';
import { scene } from '../core/context.js';
import { getCylinderMiddleZ } from '../utils/responsive.js';
import { currentCursiveColor } from './dayNight.js';

export let cursivePlane = null;
export let cursiveCanvas = null;
export let cursiveTexture = null;

import { gui } from '../core/gui.js';

export const introParams = {
  writeDuration: 1.4,
  unwriteDuration: 1.4,
  writePause: 0.15,
  unwritePause: 0.15
};

const introFolder = gui.addFolder('Intro Animation');
introFolder.add(introParams, 'writeDuration', 0.5, 10.0).step(0.1).name('Write Time (s)');
introFolder.add(introParams, 'unwriteDuration', 0.5, 10.0).step(0.1).name('Unwrite Time (s)');
introFolder.open();

export function initCursivePlane() {
  cursiveCanvas = document.createElement('canvas');
  cursiveCanvas.width = 2048;
  cursiveCanvas.height = 1024;

  cursiveTexture = new THREE.CanvasTexture(cursiveCanvas);
  cursiveTexture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: cursiveTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false
  });

  const geometry = new THREE.PlaneGeometry(3.6, 1.8);
  cursivePlane = new THREE.Mesh(geometry, material);
  cursivePlane.position.set(0, 0, getCylinderMiddleZ());
  cursivePlane.rotation.x = Math.PI / 2;
  cursivePlane.renderOrder = 999;
  scene.add(cursivePlane);
}

export function drawCursiveName(writeProgress, unwriteProgress, customColor = null) {
  if (!cursiveCanvas) return;
  const ctx = cursiveCanvas.getContext('2d');
  ctx.clearRect(0, 0, cursiveCanvas.width, cursiveCanvas.height);

  const name1 = "advitiya";
  const name2 = "jadhav";

  ctx.font = '210px "Instrument Serif", Georgia, serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = customColor || currentCursiveColor;

  const w1 = ctx.measureText(name1).width;
  const w2 = ctx.measureText(name2).width;

  const startX1 = (2048 - w1) / 2;
  const startX2 = (2048 - w2) / 2;

  const y1 = 240;
  const y2 = 500;
  const rowHeight = 280;

  ctx.save();
  ctx.beginPath();
  if (unwriteProgress > 0) {
    const clipX = startX1 + unwriteProgress * w1;
    ctx.rect(clipX, y1, w1 * (1.0 - unwriteProgress), rowHeight);
  } else {
    ctx.rect(startX1, y1, w1 * writeProgress, rowHeight);
  }
  ctx.clip();
  ctx.fillText(name1, startX1, y1);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  if (unwriteProgress > 0) {
    ctx.rect(startX2, y2, w2 * (1.0 - unwriteProgress), rowHeight);
  } else {
    ctx.rect(startX2, y2, w2 * writeProgress, rowHeight);
  }
  ctx.clip();
  ctx.fillText(name2, startX2, y2);
  ctx.restore();

  cursiveTexture.needsUpdate = true;
}
