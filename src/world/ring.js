import * as THREE from 'three';
import { buildTerrainRing, buildGroundStrip, BIOME_ORDER, SEG_ANGLE, mulberry32 } from './terrain.js';
import { BIOME_BUILDERS, GROUND_STRIP_OPTS } from './biomes.js';
import { buildOcean } from './ocean.js';
import { FAMILY } from './palette.js';

/**
 * Assembles the terrain ring, all six biomes, and the animated ocean into one group.
 * Only this group's `.rotation.z` is ever touched by the render loop, so the ring body,
 * every prop, and the ocean always move together as a single rigid disc.
 */
export function buildWorldRing() {
  const group = new THREE.Group();

  group.add(buildTerrainRing());

  // One seeded RNG shared across every non-ocean biome so the layout is deterministic
  // and reviewable across reloads (ocean.js seeds its own — see its module).
  const rand = mulberry32(9001);
  const updaters = [];

  BIOME_ORDER.forEach((family, i) => {
    const thetaStart = i * SEG_ANGLE;
    const thetaEnd = thetaStart + SEG_ANGLE;

    if (family === FAMILY.OCEAN) {
      const ocean = buildOcean();
      group.add(ocean.group);
      updaters.push(ocean.update);
      return;
    }

    // Continuous ground layer first, so every biome has an unbroken surface running the
    // full arc (and slightly past it, into its neighbours) before props are scattered on
    // top — the fix for bare, disconnected-looking joins between segments.
    const stripOpts = GROUND_STRIP_OPTS[family];
    if (stripOpts) group.add(buildGroundStrip(thetaStart, thetaEnd, family, stripOpts));

    const builder = BIOME_BUILDERS[family];
    if (!builder) return;
    group.add(builder(thetaStart, thetaEnd, rand));
  });

  function update(elapsed) {
    for (const fn of updaters) fn(elapsed);
  }

  return { group, update };
}
