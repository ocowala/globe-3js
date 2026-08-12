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
night lighting, audio, and seasonal decorations. It's organized as one long sequence of top-level
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
  `selectedTextbox` (a focused detail textbox), `isMovieTransitionActive`. `animate()` (the
  render loop, ~line 3548) and most interaction handlers branch on combinations of these — check
  existing guard conditions before adding new state.
- **Textboxes are hand-drawn to `<canvas>` and used as CanvasTexture-backed sprites**
  (`drawTextBoxCanvas`, `createTextBox`), not DOM/CSS — this is why textbox content, layout, and
  hover/focus styling all live in JS draw calls rather than HTML/CSS.
- **Routing**: `handleRouting()`/`navigateTo()` implement a tiny manual router (no history
  library) between `/` and `/ring` (`?/ring_direct` replays the cursive-writing intro; any other
  entry to `/ring` jumps straight to the finale overview).
- **Seasons and music**: `getCalendarSeason()` maps the real calendar date to
  spring/summer/fall/winter (Mar 1–May 1 / May 1–Aug 1 / Aug 1–Nov 1 / Nov 1–Mar 1), which drives
  both the background track picked from `songsBySeason` (see `public/music/<season>/`) and the
  `season-spring`/`season-fall` class on `#seasonal-decorations` (flowers/leaves art in
  `public/flowers/` and `public/leaves/`, styled in `styles.css`). Seasonal decorations are
  intentionally restricted to the finale/overview view — see the `isPostSequence` guards around
  `applyBackdropMode`/`seasonalDecorations` — do not let them show during vehicle-orbit or
  textbox-focused states.
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
- `public/` — static files served as-is (fonts, images, `music/<season>/`, `flowers/`, `leaves/`)
  and duplicated into `dist/` on build.
- Root-level `.blend`/`.blend1` files are Blender source files for the GLB assets, not part of
  the web app.

### Styling

Single global `styles.css` (~1.7k lines) covers the whole homepage/world-ring UI; no CSS modules
or scoping — class names must stay unique by convention. `src/world/world.css` is scoped to the
separate `/world` ASCII demo only.
