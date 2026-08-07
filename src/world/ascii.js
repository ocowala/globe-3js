import * as THREE from 'three';
import { RAMP, FAMILY, FAMILY_TIERS, NOISE_COLOR, NOISE_CHARS, BACKGROUND } from './palette.js';

const FONT_STACK = 'ui-monospace, "SF Mono", "Fira Code", "JetBrains Mono", monospace';

// Bayer 4x4 ordered-dither matrix, normalized to roughly [-0.47, 0.47].
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const GAMMA = 0.7;
const DITHER_STRENGTH = 0.09;
const NOISE_DENSITY = 0.045;
const NOISE_DRIFT_RATE = 0.6; // noise frame steps per second — a "flicker" cadence, not per-render-frame

// Per-family character accents: a handful of RAMP's low/mid density indices are swapped
// for a glyph of comparable visual weight so each biome carries its own texture, not just
// its own colour, without breaking the ramp's proven luminance ordering (every other index
// is untouched). Index 0 (space) is never overridden.
const FAMILY_RAMP_ACCENTS = {
  [FAMILY.CITY]: { 2: '-', 5: '+', 9: '#' },
  [FAMILY.SCHOOL]: { 2: '"', 5: 'r', 9: 'H' },
  [FAMILY.FOREST]: { 2: '`', 5: '^', 9: '%' },
  [FAMILY.OCEAN]: { 2: '-', 5: '~', 9: '=' },
  [FAMILY.DESERT]: { 2: '.', 5: ':', 9: 'x' },
  [FAMILY.CAFE]: { 2: "'", 5: 'o', 9: 'A' },
};

function buildRampByFamily() {
  const table = new Array(7).fill(RAMP);
  for (const [family, accents] of Object.entries(FAMILY_RAMP_ACCENTS)) {
    const chars = RAMP.split('');
    for (const idx in accents) chars[idx] = accents[idx];
    table[family] = chars.join('');
  }
  return table;
}
const RAMP_BY_FAMILY = buildRampByFamily();

function hash3(a, b, c) {
  let h = a * 374761393 + b * 668265263 + c * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/**
 * Swaps every mesh in `root` between its lit material and its registered ID material (or
 * back). ID materials are flat/unlit and encode family membership in the red channel (see
 * palette.js's idMaterialFor/ringIdMaterial) — reading that channel back is how the colour
 * pass knows a texel's biome exactly, instead of inferring it from a lit, possibly
 * antialiased pixel's hue (the old approach, and the source of the reported colour bleed).
 */
function swapMaterials(root, toId) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (toId) {
      if (!obj.userData.litMaterial) obj.userData.litMaterial = obj.material;
      obj.material = obj.userData.idMaterial || obj.userData.litMaterial;
    } else if (obj.userData.litMaterial) {
      obj.material = obj.userData.litMaterial;
    }
  });
}

/**
 * Renders a Three.js scene as coloured ASCII onto a plain 2D canvas.
 *
 * Draws fixed-position glyphs onto a canvas (rather than three/examples' AsciiEffect,
 * which emits a DOM <table> with hardcoded font metrics) — each glyph sits at an explicit
 * (col*cellW, row*cellH), so it is what makes an exactly-circular ring possible in concert
 * with the frontal OrthographicCamera and the frustum math in main.js.
 *
 * Every frame renders the scene twice: once lit (for luminance -> character, MSAA on) and
 * once flat/unlit with every material swapped to its ID material (MSAA off) so the colour
 * pass can read exact biome family from the ID buffer's red channel instead of guessing it
 * from the lit buffer's hue.
 */
export class AsciiRenderer {
  constructor({ cellWidth = 5.4, cellHeight = 8, maxCells = 28000 } = {}) {
    this.baseCellWidth = cellWidth;
    this.baseCellHeight = cellHeight;
    this.maxCells = maxCells;

    this.domElement = document.createElement('canvas');
    this.domElement.style.display = 'block';
    this.ctx = this.domElement.getContext('2d');
    this.cssWidth = 0;
    this.cssHeight = 0;

    this.glRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.glRenderer.setClearColor(0x000000, 1);

    this.renderTarget = null;
    this.idRenderTarget = null;
    this.pixelBuffer = null;
    this.idPixelBuffer = null;
    this.cols = 0;
    this.rows = 0;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;

    this.buckets = new Map();
    const allColors = new Set([...FAMILY_TIERS.flat(), NOISE_COLOR]);
    for (const color of allColors) this.buckets.set(color, []);
  }

  /** Grid aspect (cols*cellW / rows*cellH) — the value the camera frustum must match. */
  get gridAspect() {
    return (this.cols * this.cellWidth) / (this.rows * this.cellHeight);
  }

  setSize(containerWidth, containerHeight) {
    // Defensive clamp: a misbehaving layout (e.g. a resize-observer feedback loop
    // upstream) should degrade gracefully here rather than allocate a multi-gigapixel
    // render target and canvas backing store.
    containerWidth = Math.min(containerWidth, 4000);
    containerHeight = Math.min(containerHeight, 4000);
    if (containerWidth <= 0 || containerHeight <= 0) return;

    let cellW = this.baseCellWidth;
    let cellH = this.baseCellHeight;
    let cols = Math.max(1, Math.floor(containerWidth / cellW));
    let rows = Math.max(1, Math.floor(containerHeight / cellH));

    if (cols * rows > this.maxCells) {
      const scale = Math.sqrt((cols * rows) / this.maxCells);
      cellW *= scale;
      cellH *= scale;
      cols = Math.max(1, Math.floor(containerWidth / cellW));
      rows = Math.max(1, Math.floor(containerHeight / cellH));
    }

    this.cellWidth = cellW;
    this.cellHeight = cellH;
    this.cols = cols;
    this.rows = rows;
    this.cssWidth = containerWidth;
    this.cssHeight = containerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.domElement.width = Math.round(containerWidth * dpr);
    this.domElement.height = Math.round(containerHeight * dpr);
    this.domElement.style.width = `${containerWidth}px`;
    this.domElement.style.height = `${containerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.font = `${this.cellHeight * 0.95}px ${FONT_STACK}`;
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'left';

    const isWebGL2 = this.glRenderer.capabilities.isWebGL2;

    if (this.renderTarget) this.renderTarget.dispose();
    this.renderTarget = new THREE.WebGLRenderTarget(cols, rows, {
      samples: isWebGL2 ? 4 : 0,
      type: THREE.UnsignedByteType,
    });
    this.pixelBuffer = new Uint8Array(cols * rows * 4);

    // No MSAA on the ID pass — any blended edge texel there would average two families'
    // encoded indices into a value that decodes as neither, reintroducing exactly the
    // bleed this pass exists to eliminate.
    if (this.idRenderTarget) this.idRenderTarget.dispose();
    this.idRenderTarget = new THREE.WebGLRenderTarget(cols, rows, {
      samples: 0,
      type: THREE.UnsignedByteType,
    });
    this.idPixelBuffer = new Uint8Array(cols * rows * 4);
  }

  render(scene, camera, elapsed) {
    if (!this.renderTarget) return;

    swapMaterials(scene, true);
    this.glRenderer.setRenderTarget(this.idRenderTarget);
    this.glRenderer.render(scene, camera);
    this.glRenderer.readRenderTargetPixels(this.idRenderTarget, 0, 0, this.cols, this.rows, this.idPixelBuffer);
    swapMaterials(scene, false);

    this.glRenderer.setRenderTarget(this.renderTarget);
    this.glRenderer.render(scene, camera);
    this.glRenderer.setRenderTarget(null);
    this.glRenderer.readRenderTargetPixels(this.renderTarget, 0, 0, this.cols, this.rows, this.pixelBuffer);

    for (const bucket of this.buckets.values()) bucket.length = 0;

    const noiseFrame = Math.floor(elapsed * NOISE_DRIFT_RATE);
    const { cols, rows, cellWidth, cellHeight, pixelBuffer, idPixelBuffer } = this;

    for (let bufRow = 0; bufRow < rows; bufRow++) {
      // WebGL render targets are bottom-up; canvas rows are top-down.
      const screenRow = rows - 1 - bufRow;
      const y = screenRow * cellHeight;

      for (let col = 0; col < cols; col++) {
        const i = (bufRow * cols + col) * 4;
        const r = pixelBuffer[i] / 255;
        const g = pixelBuffer[i + 1] / 255;
        const b = pixelBuffer[i + 2] / 255;
        const maxChannel = Math.max(r, g, b);
        const x = col * cellWidth;

        if (maxChannel < 0.06) {
          if (hash3(col, screenRow, 0) < NOISE_DENSITY) {
            const charIdx = Math.floor(hash3(col, screenRow, noiseFrame) * NOISE_CHARS.length);
            this.buckets.get(NOISE_COLOR).push({ x, y, ch: NOISE_CHARS[charIdx] });
          }
          continue;
        }

        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const gammaLum = Math.pow(lum, GAMMA);
        const dither = (BAYER[bufRow & 3][col & 3] + 0.5) / 16 - 0.5;
        const ditheredLum = Math.min(1, Math.max(0, gammaLum + dither * DITHER_STRENGTH));

        // Exact family from the ID pass's red channel, encoded as family/8 (see
        // palette.js). Levels are 32/255 apart, far outside any rounding ambiguity.
        const family = Math.min(6, Math.max(0, Math.round((idPixelBuffer[i] / 255) * 8)));
        const ramp = RAMP_BY_FAMILY[family];
        const charIdx = Math.round(ditheredLum * (ramp.length - 1));
        const ch = ramp[charIdx];
        if (ch === ' ') continue;

        const tier = lum < 0.35 ? 0 : lum < 0.68 ? 1 : 2;
        const color = FAMILY_TIERS[family][tier];

        this.buckets.get(color).push({ x, y, ch });
      }
    }

    const { ctx } = this;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    for (const [color, cells] of this.buckets) {
      if (cells.length === 0) continue;
      ctx.fillStyle = color;
      for (const cell of cells) ctx.fillText(cell.ch, cell.x, cell.y);
    }
  }

  dispose() {
    this.renderTarget?.dispose();
    this.idRenderTarget?.dispose();
    this.glRenderer.dispose();
  }
}
