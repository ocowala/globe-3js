# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page 3D portfolio site (Three.js + GSAP + Vite, vanilla JS/CSS, no framework). The
homepage shows a bio next to a small "ring viewer" canvas; clicking/expanding it launches a
full-screen cylindrical "world ring" with six themed sectors (Resume, School, Skills,
Experience, Projects, Hobbies), each with a GLB vehicle model that orbits its sector and opens
detail textboxes.

## Commands

```bash
npm run dev      # Vite dev server (localhost:5173, configured in .claude/launch.json)
npm run build    # production build -> dist/
npm run preview  # serve the dist/ build locally
```

There is no lint, typecheck, or automated test suite configured in this repo (no eslint/prettier
config, no test runner in `package.json`). `src/test_glb.js` is a standalone Node scratch script
for inspecting a GLB's node names via jsdom (`node src/test_glb.js`), not part of any test suite.

## Architecture

### The one file that matters: `src/main.js` (~6.7k lines)

This single module owns the entire homepage/world-ring experience: Three.js scene setup, all
six vehicle behaviors, camera state machine, textbox/nav-label UI drawn to canvas textures, day/
night lighting, and audio. It's organized as one long sequence of top-level
`function` declarations (no classes, no modules split out) — use `grep -n "^function "` to get
your bearings before editing. There is no framework; DOM elements are grabbed once via
`getElementById` near the top and mutated directly throughout.

Key architectural pieces inside `main.js`:

- **`dat.GUI` is stubbed out** by a local `DummyGUI` class so the real `dat.gui` import stays
  commented out in production; uncomment the import and swap the `dat` const to get the real
  debug panel back during development.
- **Per-vehicle raycast + update pairs**: each of the 6 vehicles (boat, motorcycle, airplane,
  bronco, car2/sls, racecar) has its own `run<Vehicle>Raycast()` (snaps the vehicle to the ring's
  terrain surface at a given angle) and `update<Vehicle>()` (drives its per-frame animation/
  orbit). Adding a 7th sector means adding both, plus wiring it into `loadModelWithGUI` and the
  sector index maps.
- **Camera state machine**, driven by a handful of booleans rather than an explicit FSM:
  `isPostSequence` (true = home/finale overview, false = inside a vehicle-orbit sector),
  `isOrbitAnimating`, `isIntroTransitioning`, `isTakeoffTransitioning`, `isTransitioning`,
  `selectedTextbox` (a focused detail textbox). `animate()` (the
  render loop, ~line 3548) and most interaction handlers branch on combinations of these — check
  existing guard conditions before adding new state.
- **Textboxes are hand-drawn to `<canvas>` and used as CanvasTexture-backed sprites**
  (`drawTextBoxCanvas`, `createTextBox`), not DOM/CSS — this is why textbox content, layout, and
  hover/focus styling all live in JS draw calls rather than HTML/CSS.
- **Routing**: `handleRouting()`/`navigateTo()` implement a tiny manual router (no history
  library) between `/` and `/ring` (`?/ring_direct` replays the cursive-writing intro; any other
  entry to `/ring` jumps straight to the finale overview).
- **Music**: a single flat playlist (`songMap`, 7 tracks in `public/music/`), cycled by
  `cycleToNextSong`. There used to be a calendar-season system that swapped playlists and drove
  corner flower/leaf decorations, plus a hidden "easter egg" backdrop mode that played a
  fullscreen video; both were removed along with their assets. If you find a stale reference to
  `getCalendarSeason`, `songsBySeason`, `#seasonal-decorations`, or `movieTransition`, it is
  leftover — delete it rather than reviving the feature.
- **Performance budget**: the six environment GLBs are ~99.7% of the triangles drawn per frame,
  so they ship decimated to ~25% (`*_opt.glb`, regenerate with `scripts/optimize-models.sh`);
  the originals are kept in `assets/models/` but are not referenced. The scene is fill-rate bound
  before it is triangle bound, so `detectGpuTier()` picks MSAA and a device-pixel-ratio cap up
  front and `updateAdaptiveQuality()` trims the ratio further if fps stays low.
  **`detectGpuTier()` must only ever demote on a positive match against a known-weak renderer
  string.** An earlier version inferred weakness from `navigator.deviceMemory`, which Safari does
  not implement — so the `|| 4` fallback demoted every iPhone and iPad and cost them MSAA. Absent
  capability information means "assume capable"; the runtime sampler is what measures reality.
  Resolution scaling is the only lever that visibly softens the canvas-drawn text, so it is a last
  resort: two consecutive bad windows, a floor of 0.75, and skipped while `document.hidden` or on
  frames over 250ms (a backgrounded tab throttles rAF to ~1Hz and would read as a slow GPU).
  `node scripts/check-render-quality.mjs` guards all of this — run it after touching any of it.
- **Drag/pointer handling** for rotating the ring in overview mode is bound globally on
  `window` (`pointerdown`/`pointermove`/`pointerup`, `isDraggingMobileNav` +
  `dragStartPointerX`/`dragStartAngle`), guarded by checks that skip clicks landing on known UI
  elements (buttons, tabs, dat.GUI). When touching this logic, remember it's window-level, not
  scoped to the canvas — any new interactive/selectable element on the page needs to be added to
  the exclusion checks or it will also trigger ring rotation.

### `src/world/` — a separate, unused-in-production ASCII ring demo

`world.html` + `src/world/main.js` + `ascii.js`/`biomes.js`/`terrain.js`/`ocean.js`/`palette.js`/
`ring.js` implement a second, independent experience: a terminal/ASCII-art-styled rotating world
ring rendered via a custom `AsciiRenderer`, with procedurally placed biomes (city/school/forest/
ocean/desert/cafe) seeded by `mulberry32`. It is **not wired into the production build** — Vite's
default build only emits `index.html` (confirm via `dist/`), so `world.html` only loads if you
navigate to it directly during `npm run dev`. Treat this as a self-contained sandbox: changes here
never affect the homepage/`/ring` experience in `main.js`, and vice versa.

### `src/renderer.js` — dead/legacy code

An early racing-track prototype (loads `/models/track.glb`, which doesn't exist in `assets/`).
Not imported by any HTML entry point. Leave alone unless explicitly asked to revive or remove it.

### Assets

- `assets/models/*.glb` — source vehicle/scene models, referenced by `src/main.js`; also
  `<link rel="preload">`-ed individually in `index.html`'s `<head>` so they download in parallel
  with the JS bundle. New models need both a preload link and a `loadModelWithGUI` call.
- `public/` — static files served as-is (fonts, images, `music/`)
  and duplicated into `dist/` on build.
- Root-level `.blend`/`.blend1` files are Blender source files for the GLB assets, not part of
  the web app.

### Styling

Single global `styles.css` (~1.7k lines) covers the whole homepage/world-ring UI; no CSS modules
or scoping — class names must stay unique by convention. `src/world/world.css` is scoped to the
separate `/world` ASCII demo only.
