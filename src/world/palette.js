import * as THREE from 'three';

// Density ramp, light -> dense. Per-family variants (see ascii.js's RAMP_BY_FAMILY) swap a
// few low/mid glyphs for a family-flavoured accent while keeping this exact density order,
// so texture differs by biome without breaking the luminance->character mapping.
export const RAMP = ' .,:;i1tfLCG08@█';

export const FAMILY = {
  NEUTRAL: 0,
  CITY: 1,
  SCHOOL: 2,
  FOREST: 3,
  OCEAN: 4,
  DESERT: 5,
  CAFE: 6,
};

// dim / mid / bright tier per family. Cohesive dark-terminal register: cool teal base
// with warm accents. Hue no longer has to keep a classification margin (see the ID-pass
// materials below), so tiers are tuned purely for contrast/legibility.
export const FAMILY_TIERS = [
  ['#1c3130', '#5a8280', '#c9e8e5'], // neutral — ring body, track, rim, rock
  ['#123f3a', '#33b0a2', '#a8fff0'], // city
  ['#33224a', '#8a6fd1', '#e0cfff'], // school
  ['#16401f', '#3fb262', '#baffce'], // forest
  ['#142e57', '#3d78d1', '#b8ddff'], // ocean
  ['#5a3714', '#cf8f3d', '#ffe4b0'], // desert
  ['#5a1c2c', '#cf5573', '#ffc2d1'], // cafe
];

// Dedicated darks for the ring's structural bands (not a "family" — always neutral).
export const TRACK_COLOR = '#0f1e1c'; // inner label track
export const RIM_COLOR = '#080f0e'; // outer crust wall + back face

export const NOISE_COLOR = '#16292c';
export const NOISE_CHARS = '+.:*#@/\\';
export const BACKGROUND = '#05070a';

/**
 * Blend two colours in HSL along the *shorter* hue arc, so a transition between two
 * families' tiers never passes through a third family's hue — the fix for the ring
 * body's colour bleed (see terrain.js's hard-edged band transitions).
 */
const _hslA = { h: 0, s: 0, l: 0 };
const _hslB = { h: 0, s: 0, l: 0 };
export function blendHSL(colorA, colorB, t, out = new THREE.Color()) {
  colorA.getHSL(_hslA);
  colorB.getHSL(_hslB);
  let dh = _hslB.h - _hslA.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  const h = (((_hslA.h + dh * t) % 1) + 1) % 1;
  const s = THREE.MathUtils.lerp(_hslA.s, _hslB.s, t);
  const l = THREE.MathUtils.lerp(_hslA.l, _hslB.l, t);
  return out.setHSL(h, s, l);
}

/**
 * Lit material for a biome prop. The emissive term keeps colour readable in shadow.
 * Family membership for the ASCII colour pass no longer comes from this colour (see
 * idMaterialFor) — it is only ever read by eyes and by AsciiRenderer's luminance pass.
 */
export function biomeMaterial(family, { light = 0.5, sat = 0.62, hue = null, rough = 0.85 } = {}) {
  const color = new THREE.Color();
  if (hue != null) color.setHSL(hue / 360, sat, light);
  else {
    const tier = new THREE.Color(FAMILY_TIERS[family][1]);
    const hsl = {};
    tier.getHSL(hsl);
    color.setHSL(hsl.h, sat, light);
  }

  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.26),
    roughness: rough,
    metalness: 0.02,
  });
}

// --- Family-ID materials — the ground truth the ASCII colour pass reads instead of
// guessing family from a lit, possibly-antialiased pixel's hue. One flat, unlit material
// per family (cheap to share across every prop of that family), red channel = family/8. ---
const ID_MATERIAL_CACHE = new Map();
export function idMaterialFor(family) {
  if (!ID_MATERIAL_CACHE.has(family)) {
    ID_MATERIAL_CACHE.set(
      family,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(family / 8, 0, 0), fog: false, toneMapped: false })
    );
  }
  return ID_MATERIAL_CACHE.get(family);
}

/**
 * Builds a biome prop mesh with both its lit material and its ID material attached in one
 * call, so a mesh can never exist with only one of the two — the structural fix for the
 * earlier risk of an untagged prop silently misreporting its family during the ID pass.
 */
export function makeBiomeMesh(geometry, family, opts) {
  const mesh = new THREE.Mesh(geometry, biomeMaterial(family, opts));
  mesh.userData.idMaterial = idMaterialFor(family);
  return mesh;
}

// --- Ring-body ID shader — the ring spans all six families (plus neutral) in one mesh via
// a per-vertex colour attribute, so it needs a per-vertex ID too. MeshBasicMaterial's
// vertexColors mode is hardcoded to read an attribute named "color", which the lit pass
// already occupies with the visible hue — so the ID channel lives in a second attribute
// ("idColor") read by this tiny unlit ShaderMaterial instead of duplicating geometry. ---
export function ringIdMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      attribute vec3 idColor;
      varying vec3 vIdColor;
      void main() {
        vIdColor = idColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vIdColor;
      void main() {
        gl_FragColor = vec4(vIdColor, 1.0);
      }
    `,
  });
}
