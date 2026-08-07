import * as THREE from 'three';
import { FAMILY, makeBiomeMesh } from './palette.js';
import { R_OUTER, R_GROUND_INNER, RING_DEPTH, SEG_ANGLE, OCEAN_SEGMENT_INDEX, placeOnTerrain, mulberry32 } from './terrain.js';

const THETA_STEPS = 64;
const R_STEPS = 16;
const WATER_Z = RING_DEPTH / 2 + 0.012; // proud of the ring's ground band, its own layer

const THETA_START = OCEAN_SEGMENT_INDEX * SEG_ANGLE;
const THETA_END = THETA_START + SEG_ANGLE;

function smootherstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function shoreWindow(uFrac) {
  return smootherstep(uFrac) * smootherstep(1 - uFrac);
}

/**
 * Wave Z-displacement only — never x/y — so no amount of wave motion can ever perturb the
 * ring's true circular silhouette (the same principle as terrain.js's relief). Tapered to
 * zero at both the shore (u near the segment edges) and the two radial edges (v near 0/1,
 * matching the ring's own pinned-flat band boundaries) so the water sheet never cracks
 * away from its neighbours while it animates.
 */
function waveZ(theta, uFrac, vFrac, elapsed) {
  const radialWindow = smootherstep(vFrac) * smootherstep(1 - vFrac);
  const amp = 0.02 * shoreWindow(uFrac) * radialWindow;
  return (
    amp *
    (Math.sin(theta * 9 + elapsed * 1.3) +
      0.5 * Math.sin(vFrac * 10 - elapsed * 1.7) +
      0.3 * Math.sin(theta * 5 + vFrac * 6 + elapsed * 0.9))
  );
}

function waterRadiusAt(vFrac) {
  return THREE.MathUtils.lerp(R_GROUND_INNER, R_OUTER, vFrac);
}

function buildWaterMesh() {
  const geometry = new THREE.PlaneGeometry(1, 1, THETA_STEPS, R_STEPS);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3d78d1'),
    emissive: new THREE.Color('#3d78d1').multiplyScalar(0.26),
    roughness: 0.35,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.idMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(FAMILY.OCEAN / 8, 0, 0),
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  mesh.userData.update = (elapsed) => {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const uFrac = pos.getX(i) + 0.5;
      const vFrac = pos.getY(i) + 0.5;
      const theta = THETA_START + uFrac * SEG_ANGLE;
      const r = waterRadiusAt(vFrac);
      const z = WATER_Z + waveZ(theta, uFrac, vFrac, elapsed);
      pos.setXYZ(i, r * Math.cos(theta), r * Math.sin(theta), z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  mesh.userData.update(0);
  return mesh;
}

function buildRocks(rand) {
  const group = new THREE.Group();
  const count = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < count; i++) {
    const theta = THETA_START + (0.2 + rand() * 0.6) * SEG_ANGLE;
    const r = 0.04 + rand() * 0.03;
    const rock = makeBiomeMesh(new THREE.DodecahedronGeometry(r, 0), FAMILY.NEUTRAL, { light: 0.28 });
    rock.rotation.set(rand(), rand(), rand());
    placeOnTerrain(rock, theta, 0.01);
    group.add(rock);
  }
  return group;
}

function buildShoreSand(rand) {
  const group = new THREE.Group();
  [0.06, 0.1].forEach((edgeOffset) => {
    for (let side = 0; side < 2; side++) {
      const theta = side === 0 ? THETA_START + edgeOffset * SEG_ANGLE : THETA_END - edgeOffset * SEG_ANGLE;
      const patch = makeBiomeMesh(new THREE.BoxGeometry(0.05 + rand() * 0.03, 0.015, 0.04), FAMILY.DESERT, { light: 0.62, sat: 0.4 });
      placeOnTerrain(patch, theta, 0.005);
      group.add(patch);
    }
  });
  return group;
}

function buildLighthouse() {
  const group = new THREE.Group();
  const bodyOpts = { light: 0.68, sat: 0.1 };
  const beaconOpts = { light: 0.85, sat: 0.7 };

  const towerH = 0.32;
  const tower = makeBiomeMesh(new THREE.CylinderGeometry(0.025, 0.035, towerH, 8), FAMILY.NEUTRAL, bodyOpts);
  tower.position.set(0, towerH / 2, 0);
  group.add(tower);

  const roof = makeBiomeMesh(new THREE.ConeGeometry(0.035, 0.06, 8), FAMILY.DESERT, beaconOpts);
  roof.position.set(0, towerH + 0.03, 0);
  group.add(roof);

  const beacon = makeBiomeMesh(new THREE.SphereGeometry(0.02, 8, 6), FAMILY.DESERT, beaconOpts);
  beacon.position.set(0, towerH - 0.02, 0.03);
  group.add(beacon);

  // Was previously offset by a raw radian constant (0.03) while every other placement in
  // this file uses a fraction of SEG_ANGLE — that mismatch put it right on the segment
  // seam. Placed as a fraction here, like everywhere else.
  placeOnTerrain(group, THETA_END - 0.05 * SEG_ANGLE, 0.01);
  return group;
}

function buildBoat() {
  const group = new THREE.Group();
  const hullOpts = { light: 0.55, sat: 0.15 };
  const sailOpts = { light: 0.85, sat: 0.05 };

  const hull = makeBiomeMesh(new THREE.CylinderGeometry(0.02, 0.035, 0.09, 6), FAMILY.NEUTRAL, hullOpts);
  hull.rotation.z = Math.PI / 2;
  group.add(hull);

  const mast = makeBiomeMesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4), FAMILY.NEUTRAL, hullOpts);
  mast.position.set(0, 0.045, 0);
  group.add(mast);

  const sail = makeBiomeMesh(new THREE.ConeGeometry(0.03, 0.07, 4), FAMILY.NEUTRAL, sailOpts);
  sail.position.set(0, 0.07, 0.01);
  sail.rotation.y = Math.PI / 4;
  group.add(sail);

  group.userData.theta = THETA_START + 0.55 * SEG_ANGLE;
  group.userData.vFrac = 0.6;
  return group;
}

export function buildOcean() {
  const rand = mulberry32(20240804);
  const group = new THREE.Group();

  const water = buildWaterMesh();
  group.add(water);
  group.add(buildRocks(rand));
  group.add(buildShoreSand(rand));
  group.add(buildLighthouse());

  const boat = buildBoat();
  group.add(boat);

  function update(elapsed) {
    water.userData.update(elapsed);

    const { theta, vFrac } = boat.userData;
    const uFrac = (theta - THETA_START) / SEG_ANGLE;
    const r = waterRadiusAt(vFrac);
    const z = WATER_Z + waveZ(theta, uFrac, vFrac, elapsed);
    boat.position.set(r * Math.cos(theta), r * Math.sin(theta), z + 0.01);
    boat.rotation.z = theta - Math.PI / 2 + Math.sin(elapsed * 1.5) * 0.06;
  }
  update(0);

  return { group, update };
}
