import * as THREE from 'three';
import { FAMILY, FAMILY_TIERS, TRACK_COLOR, RIM_COLOR, blendHSL, ringIdMaterial, makeBiomeMesh } from './palette.js';

export const TWO_PI = Math.PI * 2;

// --- Ring scale budget ---
// The outer AND inner silhouette are now held at these two constants everywhere, always —
// no function anywhere perturbs x/y by terrain height. Under the page's strictly-frontal
// OrthographicCamera, the rendered 2D silhouette is exactly the projection of x/y (z is
// invisible to it), so pinning x/y to a true circle makes the ring a mathematically exact
// circle regardless of how much relief the front face carries. This is the fix for the
// "renders as an ellipse/blob, not a circle" defect — relief moved off the silhouette and
// onto the front face's Z instead (see terrainHeight below).
export const R_OUTER = 1.95; // ground band outer edge = rim wall
export const R_GROUND_INNER = 1.62; // ground band inner edge = track outer edge
export const R_INNER = 1.48; // track inner edge = bore wall
export const RING_DEPTH = 0.16;
export const VIEW_R = 2.6; // clears the tallest prop (a maxed-out city tower reaches ~2.41)

// Requested cycle: city -> school -> forest -> ocean -> desert -> cafe/town -> city
export const BIOME_ORDER = [
  FAMILY.CITY,
  FAMILY.SCHOOL,
  FAMILY.FOREST,
  FAMILY.OCEAN,
  FAMILY.DESERT,
  FAMILY.CAFE,
];
export const SEG_ANGLE = TWO_PI / BIOME_ORDER.length;
export const OCEAN_SEGMENT_INDEX = BIOME_ORDER.indexOf(FAMILY.OCEAN);
export const OCEAN_THETA_CENTER = (OCEAN_SEGMENT_INDEX + 0.5) * SEG_ANGLE;

// Fraction of a segment's span, at EACH end, over which height/colour blend into the
// neighbour. Kept narrow (~3.6 degrees) so bands read as hard-edged and distinguishable —
// the fix for the "27% of the ring reads as a third, foreign biome" colour-bleed defect —
// while staying just wide enough to avoid a literal C0 discontinuity at the seam.
const TRANSITION = 0.06;

// Base Z-relief per biome, in world units on the front face only (never on the silhouette).
// Ocean is the trough, desert the dunes — same relative shape as before, rescaled to a
// budget of roughly +/-0.05 now that it no longer has to also carry the ring's outer edge.
const BASE_HEIGHT = [0.01, 0.006, 0.018, -0.03, 0.026, 0.008];
const BUMP_AMP = [0.006, 0.004, 0.01, 0.004, 0.014, 0.005];
// Integer, low frequencies only (<=24) sampled against 512 segments stay well clear of the
// aliasing floor (>=21 samples/period) — the fix for the old frequency-61 ripple term,
// which at 8.4 samples/period was itself a source of ragged, undersampled edge noise.
const BUMP_FREQ = [3, 2, 5, 1, 4, 2];
const BUMP_PHASE = [0, 0.6, 0.2, 0, 0.4, 0.9];

/** Deterministic PRNG so every reload lays out the same world. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 6t^5 - 15t^4 + 10t^3 — zero value AND zero derivative at t=0 and t=1.
function smootherstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** theta -> { idx, t, wrapped } — which segment, and how far across it, in [0,1). */
export function segmentAt(theta) {
  const wrapped = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
  const idx = Math.min(BIOME_ORDER.length - 1, Math.floor(wrapped / SEG_ANGLE));
  const t = wrapped / SEG_ANGLE - idx;
  return { idx, t, wrapped };
}

export function segmentCenterTheta(idx) {
  return (idx + 0.5) * SEG_ANGLE;
}

/**
 * Continuous Z-relief as a function of angle. Pure biome value through the middle ~88% of
 * every segment (hard-edged, per TRANSITION), blended only in the narrow zone at each end
 * so neighbouring segments never show a literal cliff. Never touches x/y.
 */
export function terrainHeight(theta) {
  const { idx, t } = segmentAt(theta);
  const nextIdx = (idx + 1) % BIOME_ORDER.length;
  const prevIdx = (idx - 1 + BIOME_ORDER.length) % BIOME_ORDER.length;

  const window = smootherstep(t) * smootherstep(1 - t);
  const bump = BUMP_AMP[idx] * window * Math.sin(t * BUMP_FREQ[idx] * Math.PI + BUMP_PHASE[idx]);

  let base;
  if (t < TRANSITION) {
    base = THREE.MathUtils.lerp(BASE_HEIGHT[prevIdx], BASE_HEIGHT[idx], smootherstep(t / TRANSITION));
  } else if (t > 1 - TRANSITION) {
    base = THREE.MathUtils.lerp(BASE_HEIGHT[idx], BASE_HEIGHT[nextIdx], smootherstep((t - (1 - TRANSITION)) / TRANSITION));
  } else {
    base = BASE_HEIGHT[idx];
  }

  return base + bump;
}

/** Hard-edged tier colour for the ring body at angle theta ("tier" 1=mid, 2=bright). */
function bandColor(theta, tier, out) {
  const { idx, t } = segmentAt(theta);
  const nextIdx = (idx + 1) % BIOME_ORDER.length;
  const prevIdx = (idx - 1 + BIOME_ORDER.length) % BIOME_ORDER.length;

  const familyA = BIOME_ORDER[idx];
  if (t < TRANSITION) {
    const familyPrev = BIOME_ORDER[prevIdx];
    const cPrev = new THREE.Color(FAMILY_TIERS[familyPrev][tier]);
    const cThis = new THREE.Color(FAMILY_TIERS[familyA][tier]);
    return blendHSL(cPrev, cThis, smootherstep(t / TRANSITION), out);
  }
  if (t > 1 - TRANSITION) {
    const familyNext = BIOME_ORDER[nextIdx];
    const cThis = new THREE.Color(FAMILY_TIERS[familyA][tier]);
    const cNext = new THREE.Color(FAMILY_TIERS[familyNext][tier]);
    return blendHSL(cThis, cNext, smootherstep((t - (1 - TRANSITION)) / TRANSITION), out);
  }
  return out.set(FAMILY_TIERS[familyA][tier]);
}

/**
 * Exact family membership at angle theta, as a hard step (never blended) positioned at the
 * midpoint of the same narrow zone the colour/height blend uses. This is what the ring's
 * per-vertex "idColor" attribute encodes — the ASCII colour pass reads it directly instead
 * of inferring family from a lit pixel's hue, so there is no ambiguous/third-family texel
 * anywhere on the ring, including inside the transition zone itself.
 */
function familyIdAt(theta) {
  const { idx, t } = segmentAt(theta);
  const nextIdx = (idx + 1) % BIOME_ORDER.length;
  const prevIdx = (idx - 1 + BIOME_ORDER.length) % BIOME_ORDER.length;
  if (t < TRANSITION / 2) return BIOME_ORDER[prevIdx];
  if (t > 1 - TRANSITION / 2) return BIOME_ORDER[nextIdx];
  return BIOME_ORDER[idx];
}

// --- Hand-built band geometry -------------------------------------------------------
//
// Reused three.js's ExtrudeGeometry (shape + hole) originally, but earcut triangulates an
// annulus shape using only the two boundary loops with zero interior vertices — there is
// no way to get a radially-windowed bump (pinned flat at both edges, free to rise in the
// middle) out of that. Building the six concentric bands by hand instead gives explicit
// control of every radial row, which is what makes the "relief pinned to 0 exactly at both
// band edges" trick possible (see GROUND_LOWER/GROUND_UPPER below) — the piece that lets
// the ground band bulge in Z without ever cracking away from its flat neighbours.
//
// Triangle winding per band was verified against three.js's own
// BufferGeometry.computeVertexNormals face-normal formula (cross(C-B, A-B)) rather than
// derived by hand, to make sure every band's computed normal actually points the intended
// direction (see the "flip" flags below).

const SEGMENTS = 512;

function pushBand(positions, litColors, idColors, indices, ptA, ptB, flip) {
  const n = SEGMENTS;
  const base = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * TWO_PI;
    const a = ptA(theta);
    const b = ptB(theta);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    litColors.push(a.lit.r, a.lit.g, a.lit.b, b.lit.r, b.lit.g, b.lit.b);
    idColors.push(a.id, 0, 0, b.id, 0, 0);
  }
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    const A0 = base + i * 2;
    const B0 = base + i * 2 + 1;
    const A1 = base + i1 * 2;
    const B1 = base + i1 * 2 + 1;
    if (!flip) {
      indices.push(A0, B0, B1, A0, B1, A1);
    } else {
      indices.push(A0, B1, B0, A0, A1, B1);
    }
  }
}

/**
 * Builds the terrain ring as two geometries sharing the same position/index buffers: one
 * carries the visible per-vertex hue ("color") for the lit MeshStandardMaterial pass, the
 * other carries the exact per-vertex family id ("idColor") for AsciiRenderer's ID pass
 * (via palette.js's ringIdMaterial). Returns both meshes plus the lit one's material.
 */
export function buildTerrainRing() {
  const positions = [];
  const litColors = [];
  const idColors = [];
  const indices = [];

  const trackC = new THREE.Color(TRACK_COLOR);
  const rimC = new THREE.Color(RIM_COLOR);
  const litTmp = new THREE.Color();

  const bore = (theta) => ({ x: R_INNER * Math.cos(theta), y: R_INNER * Math.sin(theta), z: RING_DEPTH / 2 });
  const trackOuter = (theta) => ({ x: R_GROUND_INNER * Math.cos(theta), y: R_GROUND_INNER * Math.sin(theta), z: RING_DEPTH / 2 });
  const mid = (theta) => {
    const r = (R_GROUND_INNER + R_OUTER) / 2;
    return { x: r * Math.cos(theta), y: r * Math.sin(theta), z: RING_DEPTH / 2 + terrainHeight(theta) };
  };
  const outerEdge = (theta) => ({ x: R_OUTER * Math.cos(theta), y: R_OUTER * Math.sin(theta), z: RING_DEPTH / 2 });
  const outerTop = outerEdge;
  const outerBottom = (theta) => ({ x: R_OUTER * Math.cos(theta), y: R_OUTER * Math.sin(theta), z: -RING_DEPTH / 2 });
  const boreTop = bore;
  const boreBottom = (theta) => ({ x: R_INNER * Math.cos(theta), y: R_INNER * Math.sin(theta), z: -RING_DEPTH / 2 });

  const withColor = (ptFn, litColorFn, idFn) => (theta) => {
    const p = ptFn(theta);
    p.lit = litColorFn(theta);
    p.id = idFn(theta);
    return p;
  };

  const trackLit = () => trackC;
  const trackId = () => FAMILY.NEUTRAL / 8;
  const rimLit = () => rimC;
  const rimId = () => FAMILY.NEUTRAL / 8;
  const groundInnerLit = (theta) => bandColor(theta, 1, litTmp).clone();
  const groundPeakLit = (theta) => bandColor(theta, 2, litTmp).clone();
  const groundOuterLit = (theta) => bandColor(theta, 1, litTmp).clone();
  const groundId = (theta) => familyIdAt(theta) / 8;

  // TRACK: bore -> trackOuter, flat, neutral. Front-facing winding (no flip).
  pushBand(positions, litColors, idColors, indices, withColor(bore, trackLit, trackId), withColor(trackOuter, trackLit, trackId), false);
  // GROUND_LOWER: trackOuter (pinned flat) -> mid (relief peak). Front-facing (no flip).
  pushBand(positions, litColors, idColors, indices, withColor(trackOuter, groundInnerLit, groundId), withColor(mid, groundPeakLit, groundId), false);
  // GROUND_UPPER: mid (relief peak) -> outerEdge (pinned flat, matches rim wall top). Front-facing (no flip).
  pushBand(positions, litColors, idColors, indices, withColor(mid, groundPeakLit, groundId), withColor(outerEdge, groundOuterLit, groundId), false);
  // RIM_WALL: outerTop -> outerBottom, wants outward radial normal (no flip, verified).
  pushBand(positions, litColors, idColors, indices, withColor(outerTop, rimLit, rimId), withColor(outerBottom, rimLit, rimId), false);
  // BACK: bore -> outerEdge at z=-depth/2, wants -Z normal (flip required, verified).
  pushBand(positions, litColors, idColors, indices, withColor(boreBottom, rimLit, rimId), withColor(outerBottom, rimLit, rimId), true);
  // BORE_WALL: boreTop -> boreBottom, wants inward radial normal (flip required, verified).
  pushBand(positions, litColors, idColors, indices, withColor(boreTop, rimLit, rimId), withColor(boreBottom, rimLit, rimId), true);

  const positionAttr = new THREE.Float32BufferAttribute(positions, 3);
  const indexArray = positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);

  const litGeometry = new THREE.BufferGeometry();
  litGeometry.setAttribute('position', positionAttr);
  litGeometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  litGeometry.setAttribute('color', new THREE.Float32BufferAttribute(litColors, 3));
  litGeometry.setAttribute('idColor', new THREE.Float32BufferAttribute(idColors, 3));
  litGeometry.computeVertexNormals();

  const litMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02,
    emissive: 0x0d0d0d,
  });

  const mesh = new THREE.Mesh(litGeometry, litMaterial);
  mesh.userData.idMaterial = ringIdMaterial();

  return mesh;
}

/**
 * Places `obj` at the ring's fixed outer edge at angle `theta`, oriented so local +Y points
 * radially outward — this is what makes props fan out around the curve. `lift` is a small
 * forward Z offset (e.g. so a low bush or rock sits proud of the ground band's surface)
 * rather than a radial one, since the outer edge is now a constant radius by construction.
 */
export function placeOnTerrain(obj, theta, lift = 0) {
  obj.position.set(R_OUTER * Math.cos(theta), R_OUTER * Math.sin(theta), RING_DEPTH / 2 + lift);
  obj.rotation.z = theta - Math.PI / 2;
}

/**
 * A thin, hard-edged ground strip flush against the inside of the rim wall, spanning
 * `[thetaStart-overlap, thetaEnd+overlap]` — the continuous ground layer each biome was
 * missing. Kept strictly inside R_OUTER (never proud of it) so it can never perturb the
 * ring's true circular silhouette, and given its own `family` for the ID pass.
 */
export function buildGroundStrip(thetaStart, thetaEnd, family, { light = 0.4, overlap = 0.03, width = 0.045 } = {}) {
  const steps = Math.max(8, Math.round(((thetaEnd - thetaStart) / SEG_ANGLE) * 40));
  const rOuter = R_OUTER - 0.01;
  const rInner = rOuter - width;
  const a0 = thetaStart - overlap;
  const a1 = thetaEnd + overlap;

  const shape = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const th = a0 + ((a1 - a0) * i) / steps;
    const x = rOuter * Math.cos(th);
    const y = rOuter * Math.sin(th);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const th = a0 + ((a1 - a0) * i) / steps;
    shape.lineTo(rInner * Math.cos(th), rInner * Math.sin(th));
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: steps });
  geometry.translate(0, 0, RING_DEPTH / 2 + 0.008);

  return makeBiomeMesh(geometry, family, { light });
}
