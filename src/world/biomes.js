import * as THREE from 'three';
import { FAMILY, makeBiomeMesh } from './palette.js';
import { placeOnTerrain } from './terrain.js';

function randRange(rand, min, max) {
  return min + rand() * (max - min);
}

/** A theta drawn from within [thetaStart, thetaEnd]. Margins are kept narrow (not the old
 *  5-12%) so props can approach and slightly cross a segment's join — density now carries
 *  the "distinct but continuous" read instead of a gap. */
function randTheta(rand, thetaStart, thetaEnd, marginFrac = 0.015) {
  const span = thetaEnd - thetaStart;
  return thetaStart + (marginFrac + rand() * (1 - 2 * marginFrac)) * span;
}

function evenTheta(i, count, thetaStart, thetaEnd, rand, marginFrac = 0.015, jitter = 0.4) {
  const span = thetaEnd - thetaStart;
  const frac = marginFrac + ((i + 0.5) / count) * (1 - 2 * marginFrac);
  const jitterFrac = ((rand() - 0.5) * jitter) / count;
  return thetaStart + Math.min(1, Math.max(0, frac + jitterFrac)) * span;
}

// Continuous ground layer per (non-ocean) biome — see terrain.js's buildGroundStrip.
export const GROUND_STRIP_OPTS = {
  [FAMILY.CITY]: { light: 0.26, width: 0.05 },
  [FAMILY.SCHOOL]: { light: 0.5, width: 0.05 },
  [FAMILY.FOREST]: { light: 0.28, width: 0.06 },
  [FAMILY.DESERT]: { light: 0.56, width: 0.055 },
  [FAMILY.CAFE]: { light: 0.42, width: 0.05 },
};

// --- 1. Cyberpunk City — tall, narrow, uneven skyline -------------------------------

function buildTower(rand) {
  const group = new THREE.Group();
  const w = randRange(rand, 0.036, 0.06);
  const h = randRange(rand, 0.14, 0.3);
  const light = randRange(rand, 0.3, 0.55);

  const body = makeBiomeMesh(new THREE.BoxGeometry(w, h, w * 0.85), FAMILY.CITY, { light });
  body.position.set(0, h / 2, 0);
  group.add(body);

  let topY = h;
  if (rand() < 0.55) {
    const stepH = h * 0.14;
    const step = makeBiomeMesh(new THREE.BoxGeometry(w * 0.62, stepH, w * 0.62), FAMILY.CITY, { light: light + 0.12 });
    step.position.set(0, topY + stepH / 2, 0);
    group.add(step);
    topY += stepH;
  }

  if (h > 0.22 && rand() < 0.4) {
    const spireH = randRange(rand, 0.05, 0.12);
    const spire = makeBiomeMesh(new THREE.ConeGeometry(w * 0.1, spireH, 6), FAMILY.CITY, { light: 0.75, sat: 0.4 });
    spire.position.set(0, topY + spireH / 2, 0);
    group.add(spire);
  }

  const windows = makeBiomeMesh(new THREE.BoxGeometry(w * 0.7, h * 0.62, 0.006), FAMILY.CITY, { light: 0.78, sat: 0.55 });
  windows.position.set(0, h * 0.5, w * 0.43 + 0.003);
  group.add(windows);

  return group;
}

export function buildCity(thetaStart, thetaEnd, rand) {
  const group = new THREE.Group();
  const count = 26 + Math.floor(rand() * 7);
  for (let i = 0; i < count; i++) {
    const theta = evenTheta(i, count, thetaStart, thetaEnd, rand);
    const tower = buildTower(rand);
    placeOnTerrain(tower, theta);
    group.add(tower);
  }
  return group;
}

// --- 2. Collegiate Campus — uniform low buildings in a regular rhythm --------------

function buildHall(rand, scale = 1) {
  const group = new THREE.Group();
  const hallW = 0.3 * scale;
  const hallH = 0.16 * scale;
  const hallD = hallW * 0.5;

  const hall = makeBiomeMesh(new THREE.BoxGeometry(hallW, hallH, hallD), FAMILY.SCHOOL, { light: 0.5 });
  hall.position.set(0, hallH / 2, 0);
  group.add(hall);

  const pediment = makeBiomeMesh(new THREE.CylinderGeometry(0, hallW * 0.55, hallH * 0.45, 3), FAMILY.SCHOOL, { light: 0.62 });
  pediment.rotation.z = Math.PI / 2;
  pediment.rotation.y = Math.PI / 2;
  pediment.position.set(0, hallH + (hallH * 0.45) / 2, 0);
  group.add(pediment);

  const colOpts = { light: 0.72, sat: 0.25 };
  const columnCount = 6;
  for (let i = 0; i < columnCount; i++) {
    const x = -hallW / 2 + 0.12 * hallW + i * ((hallW * 0.76) / (columnCount - 1));
    const col = makeBiomeMesh(new THREE.CylinderGeometry(hallW * 0.018, hallW * 0.018, hallH * 0.9, 8), FAMILY.SCHOOL, colOpts);
    col.position.set(x, hallH * 0.45, hallD / 2 + 0.02);
    group.add(col);
  }

  const cupola = makeBiomeMesh(new THREE.SphereGeometry(0.02 * scale, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), FAMILY.SCHOOL, colOpts);
  cupola.position.set(0, hallH + hallH * 0.45 + 0.02 * scale, 0);
  group.add(cupola);

  const steps = makeBiomeMesh(new THREE.BoxGeometry(hallW * 0.9, 0.012, 0.03), FAMILY.SCHOOL, { light: 0.5 });
  steps.position.set(0, 0.006, hallD / 2 + 0.05);
  group.add(steps);

  return group;
}

function buildColumn(rand) {
  const h = randRange(rand, 0.05, 0.08);
  const col = makeBiomeMesh(new THREE.CylinderGeometry(0.006, 0.006, h, 8), FAMILY.SCHOOL, { light: 0.68, sat: 0.22 });
  col.position.set(0, h / 2, 0);
  return col;
}

function buildFlagpole() {
  const group = new THREE.Group();
  const pole = makeBiomeMesh(new THREE.CylinderGeometry(0.003, 0.003, 0.13, 6), FAMILY.SCHOOL, { light: 0.6, sat: 0.15 });
  pole.position.set(0, 0.065, 0);
  group.add(pole);
  const flag = makeBiomeMesh(new THREE.PlaneGeometry(0.03, 0.018), FAMILY.SCHOOL, { light: 0.7, sat: 0.55 });
  flag.position.set(0.016, 0.12, 0);
  group.add(flag);
  return group;
}

function buildSmallTree(rand) {
  const group = new THREE.Group();
  const trunkH = randRange(rand, 0.03, 0.05);
  const trunk = makeBiomeMesh(new THREE.CylinderGeometry(0.005, 0.007, trunkH, 5), FAMILY.NEUTRAL, { light: 0.32 });
  trunk.position.set(0, trunkH / 2, 0);
  group.add(trunk);
  const foliage = makeBiomeMesh(new THREE.SphereGeometry(0.028, 7, 6), FAMILY.FOREST, { light: 0.42 });
  foliage.position.set(0, trunkH + 0.02, 0);
  group.add(foliage);
  return group;
}

export function buildSchool(thetaStart, thetaEnd, rand) {
  const group = new THREE.Group();
  const span = thetaEnd - thetaStart;

  // A regular rhythm of halls (not one landmark) is what reads as a campus row.
  const hallFracs = [0.2, 0.5, 0.8];
  hallFracs.forEach((frac) => {
    const hall = buildHall(rand, randRange(rand, 0.85, 1.1));
    placeOnTerrain(hall, thetaStart + frac * span);
    group.add(hall);
  });

  // Colonnade: a steady beat of free-standing columns bridging the halls.
  const colonnadeCount = 16;
  for (let i = 0; i < colonnadeCount; i++) {
    const theta = evenTheta(i, colonnadeCount, thetaStart, thetaEnd, rand, 0.02, 0.3);
    const col = buildColumn(rand);
    placeOnTerrain(col, theta);
    group.add(col);
  }

  const flag = buildFlagpole();
  placeOnTerrain(flag, thetaStart + 0.08 * span);
  group.add(flag);

  const treeCount = 6;
  for (let i = 0; i < treeCount; i++) {
    const theta = evenTheta(i, treeCount, thetaStart, thetaEnd, rand, 0.03, 0.5);
    const tree = buildSmallTree(rand);
    placeOnTerrain(tree, theta);
    group.add(tree);
  }

  return group;
}

// --- 3. Subtropical Park / Forest — spiky, irregular canopy -------------------------

function buildConifer(rand) {
  const group = new THREE.Group();
  const tiers = 3;
  let y = 0;
  const baseR = randRange(rand, 0.045, 0.065);
  for (let t = 0; t < tiers; t++) {
    const r = baseR * (1 - t * 0.24);
    const h = randRange(rand, 0.08, 0.11);
    const cone = makeBiomeMesh(new THREE.ConeGeometry(r, h, 7), FAMILY.FOREST, { light: 0.32 + t * 0.08 });
    cone.position.set(0, y + h / 2, 0);
    group.add(cone);
    y += h * 0.62;
  }
  return group;
}

function buildBroadleaf(rand) {
  const group = new THREE.Group();
  const trunkH = randRange(rand, 0.07, 0.11);
  const trunk = makeBiomeMesh(new THREE.CylinderGeometry(0.008, 0.012, trunkH, 6), FAMILY.NEUTRAL, { light: 0.3 });
  trunk.position.set(0, trunkH / 2, 0);
  group.add(trunk);
  const clusters = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < clusters; i++) {
    const foliage = makeBiomeMesh(new THREE.SphereGeometry(randRange(rand, 0.042, 0.062), 7, 6), FAMILY.FOREST, { light: 0.4 + rand() * 0.15 });
    foliage.position.set((rand() - 0.5) * 0.04, trunkH + 0.03, (rand() - 0.5) * 0.03);
    group.add(foliage);
  }
  return group;
}

function buildBareTrunk(rand) {
  const h = randRange(rand, 0.08, 0.14);
  const trunk = makeBiomeMesh(new THREE.CylinderGeometry(0.007, 0.011, h, 5), FAMILY.NEUTRAL, { light: 0.28 });
  trunk.position.set(0, h / 2, 0);
  return trunk;
}

export function buildForest(thetaStart, thetaEnd, rand) {
  const group = new THREE.Group();
  const count = 42 + Math.floor(rand() * 9);
  for (let i = 0; i < count; i++) {
    const theta = randTheta(rand, thetaStart, thetaEnd, 0.012);
    const variant = rand();
    const tree = variant < 0.6 ? buildConifer(rand) : variant < 0.85 ? buildBroadleaf(rand) : buildBareTrunk(rand);
    placeOnTerrain(tree, theta);
    group.add(tree);
  }

  const undergrowthCount = 26 + Math.floor(rand() * 8);
  for (let i = 0; i < undergrowthCount; i++) {
    const theta = randTheta(rand, thetaStart, thetaEnd, 0.01);
    const bush = makeBiomeMesh(new THREE.SphereGeometry(randRange(rand, 0.01, 0.02), 6, 5), FAMILY.FOREST, { light: 0.36 });
    placeOnTerrain(bush, theta, 0.005);
    group.add(bush);
  }

  return group;
}

// --- 5. Desert — wide low mesas + isolated tall saguaros ---------------------------

function buildSaguaro(rand) {
  const group = new THREE.Group();
  const opts = { light: 0.42, sat: 0.45 };
  const h = randRange(rand, 0.17, 0.3);
  const trunk = makeBiomeMesh(new THREE.CylinderGeometry(0.016, 0.019, h, 7), FAMILY.DESERT, opts);
  trunk.position.set(0, h / 2, 0);
  group.add(trunk);

  const armCount = rand() < 0.7 ? 2 : 1;
  for (let i = 0; i < armCount; i++) {
    const armH = h * randRange(rand, 0.3, 0.45);
    const armY = h * randRange(rand, 0.45, 0.7);
    const side = i === 0 ? 1 : -1;
    const arm = makeBiomeMesh(new THREE.CylinderGeometry(0.008, 0.01, armH, 6), FAMILY.DESERT, opts);
    arm.position.set(side * 0.02, armY, 0);
    arm.rotation.z = side * 0.35;
    group.add(arm);
  }
  return group;
}

function buildMesa(rand, scale = 1) {
  const group = new THREE.Group();
  const tiers = 2;
  let y = 0;
  let w = randRange(rand, 0.13, 0.19) * scale;
  for (let t = 0; t < tiers; t++) {
    const h = randRange(rand, 0.07, 0.12) * scale;
    const mesa = makeBiomeMesh(new THREE.BoxGeometry(w, h, w * 0.7), FAMILY.DESERT, { light: 0.38 + t * 0.1 });
    mesa.position.set(0, y + h / 2, 0);
    group.add(mesa);
    y += h;
    w *= 0.68;
  }
  return group;
}

export function buildDesert(thetaStart, thetaEnd, rand) {
  const group = new THREE.Group();

  const saguaroCount = 12 + Math.floor(rand() * 5);
  for (let i = 0; i < saguaroCount; i++) {
    const theta = randTheta(rand, thetaStart, thetaEnd, 0.015);
    const cactus = buildSaguaro(rand);
    placeOnTerrain(cactus, theta);
    group.add(cactus);
  }

  [0.1, 0.35, 0.6, 0.88].forEach((frac) => {
    const theta = thetaStart + frac * (thetaEnd - thetaStart);
    const mesa = buildMesa(rand, randRange(rand, 0.8, 1.15));
    placeOnTerrain(mesa, theta);
    group.add(mesa);
  });

  const rockCount = 9 + Math.floor(rand() * 4);
  for (let i = 0; i < rockCount; i++) {
    const theta = randTheta(rand, thetaStart, thetaEnd, 0.01);
    const rock = makeBiomeMesh(new THREE.DodecahedronGeometry(randRange(rand, 0.012, 0.024), 0), FAMILY.DESERT, { light: 0.34, sat: 0.3 });
    rock.rotation.set(rand(), rand(), rand());
    placeOnTerrain(rock, theta, 0.005);
    group.add(rock);
  }

  const tumbleweedCount = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < tumbleweedCount; i++) {
    const theta = randTheta(rand, thetaStart, thetaEnd, 0.01);
    const tw = makeBiomeMesh(new THREE.IcosahedronGeometry(0.014, 0), FAMILY.DESERT, { light: 0.5, sat: 0.35 });
    placeOnTerrain(tw, theta, 0.015);
    group.add(tw);
  }

  return group;
}

// --- 6. Urban Cafe + Town — mid pitched roofs with one landmark --------------------

function buildCafeStore(rand) {
  const group = new THREE.Group();
  const storeW = 0.2;
  const storeH = 0.14;
  const storeD = storeW * 0.6;

  const store = makeBiomeMesh(new THREE.BoxGeometry(storeW, storeH, storeD), FAMILY.CAFE, { light: 0.48 });
  store.position.set(0, storeH / 2, 0);
  group.add(store);

  const awning = makeBiomeMesh(new THREE.BoxGeometry(storeW * 0.75, 0.012, storeD * 0.55), FAMILY.CAFE, { light: 0.62, sat: 0.5 });
  awning.position.set(0, storeH * 0.7, storeD / 2 + storeD * 0.22);
  awning.rotation.x = -0.25;
  group.add(awning);

  const cupOpts = { light: 0.75, sat: 0.3 };
  const cup = makeBiomeMesh(new THREE.CylinderGeometry(0.018, 0.014, 0.03, 10), FAMILY.CAFE, cupOpts);
  cup.position.set(0, storeH + 0.018, 0);
  group.add(cup);
  const handle = makeBiomeMesh(new THREE.TorusGeometry(0.009, 0.0028, 6, 10, Math.PI), FAMILY.CAFE, cupOpts);
  handle.position.set(0.02, storeH + 0.018, 0);
  handle.rotation.y = Math.PI / 2;
  group.add(handle);

  return group;
}

function buildHouse(rand) {
  const group = new THREE.Group();
  const w = randRange(rand, 0.07, 0.11);
  const h = randRange(rand, 0.065, 0.1);

  const body = makeBiomeMesh(new THREE.BoxGeometry(w, h, w * 0.8), FAMILY.CAFE, { light: randRange(rand, 0.4, 0.58) });
  body.position.set(0, h / 2, 0);
  group.add(body);

  const roof = makeBiomeMesh(new THREE.CylinderGeometry(0, w * 0.62, h * 0.5, 4), FAMILY.CAFE, { light: 0.6, sat: 0.4 });
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, h + (h * 0.5) / 2, 0);
  group.add(roof);

  return group;
}

function buildStreetLamp() {
  const group = new THREE.Group();
  const pole = makeBiomeMesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 6), FAMILY.NEUTRAL, { light: 0.32 });
  pole.position.set(0, 0.03, 0);
  group.add(pole);
  const bulb = makeBiomeMesh(new THREE.SphereGeometry(0.008, 6, 6), FAMILY.CAFE, { light: 0.85, sat: 0.35 });
  bulb.position.set(0, 0.062, 0);
  group.add(bulb);
  return group;
}

function buildFigure() {
  const group = new THREE.Group();
  const opts = { light: 0.55 };
  const bodyH = 0.022;
  const body = makeBiomeMesh(new THREE.CylinderGeometry(0.0035, 0.0045, bodyH, 5), FAMILY.NEUTRAL, opts);
  body.position.set(0, bodyH / 2, 0);
  group.add(body);
  const head = makeBiomeMesh(new THREE.SphereGeometry(0.0035, 6, 5), FAMILY.NEUTRAL, opts);
  head.position.set(0, bodyH + 0.0035, 0);
  group.add(head);
  return group;
}

export function buildCafeTown(thetaStart, thetaEnd, rand) {
  const group = new THREE.Group();
  const center = (thetaStart + thetaEnd) / 2;
  const span = thetaEnd - thetaStart;

  const cafe = buildCafeStore(rand);
  placeOnTerrain(cafe, center);
  group.add(cafe);

  const houseCount = 12 + Math.floor(rand() * 3);
  for (let i = 0; i < houseCount; i++) {
    let theta = randTheta(rand, thetaStart, thetaEnd, 0.02);
    // Keep the cafe's own frontage clear by nudging a too-close house outward instead of
    // dropping it — a silent `continue` here previously meant "12 houses requested" could
    // quietly deliver fewer.
    if (Math.abs(theta - center) < span * 0.06) {
      theta += Math.sign(theta - center || 1) * span * 0.06;
    }
    const house = buildHouse(rand);
    placeOnTerrain(house, theta);
    group.add(house);
  }

  const lampCount = 6;
  for (let i = 0; i < lampCount; i++) {
    const theta = evenTheta(i, lampCount, thetaStart, thetaEnd, rand, 0.02, 0.3);
    const lamp = buildStreetLamp();
    placeOnTerrain(lamp, theta);
    group.add(lamp);
  }

  const figureCount = 4 + Math.floor(rand() * 2);
  for (let i = 0; i < figureCount; i++) {
    const theta = randTheta(rand, thetaStart, thetaEnd, 0.015);
    const figure = buildFigure();
    placeOnTerrain(figure, theta, 0.002);
    group.add(figure);
  }

  return group;
}

export const BIOME_BUILDERS = {
  [FAMILY.CITY]: buildCity,
  [FAMILY.SCHOOL]: buildSchool,
  [FAMILY.FOREST]: buildForest,
  [FAMILY.DESERT]: buildDesert,
  [FAMILY.CAFE]: buildCafeTown,
};
