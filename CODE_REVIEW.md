# Code Review & Implementation Plan (Addendum)

This document is additive to [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md), which already covers performance work, drag-navigation features, and a batch of logic/ordering fixes in detail — read both for the full picture. Findings already documented there (intro-animation delay, unthrottled per-frame DOM writes, oversized canvas textures, the `loadedCount === 12` exact-match hang, undeclared radial-offset variables, the dat.GUI temporal-dead-zone crash risk, texture/asset-loading strategy) are **not** repeated here.

Two things are explicitly out of scope for this document:
- **Asset loading strategy** (meshopt variants, preload tags) — left as-is by request.
- **The radial nav dial** — `styles.css:519` sets `.radial-nav { display: none !important; ... }`, which no later declaration in the same rule block can override, so it currently renders permanently inert regardless of the `isHandheldDevice` JS logic that shows/hides it. This is treated as intentional and is not proposed for revival or fixing.

All line numbers below were verified directly against the current `src/main.js` / `styles.css` / `index.html`.

---

## 1. Code Review Findings

Ordered most-severe first.

### 1.1 Premature user input during the loading phase (the reported bug)

**Severity: High — this is the issue the user explicitly reported.**

`allAssetsLoaded` (declared `src/main.js:269`) only flips to `true` at `src/main.js:3767`, once the incremental pre-caching / shader-compile loop (`src/main.js:3651-3781`) finishes — this is the real "app is actually ready" signal. **None of the top-level input listeners check it:**

- `window.addEventListener('click', ...)` at `src/main.js:5589` — the cylinder-background-click branch (`5660-5697`) jumps straight to `isPostSequence = true` (skipping the intro/finale sequence entirely, setting `sequenceEverCompleted = true`, showing the cylinder/orbit ring) with **no guard at all** — not `introActive`, not `isIntroTransitioning`, not `allAssetsLoaded`. Contrast with the textbox-click branch a few lines above it (`5609`), which correctly checks `!introActive && !isIntroTransitioning`.
- `window.addEventListener('keydown', ...)` at `src/main.js:5287` — the `ArrowLeft` / `ArrowRight` / `Enter` branches (`5314-5345`) call `triggerNavigation()` or mutate `activeNavIndex` completely unconditionally.
- `window.addEventListener('pointerdown', ...)` at `src/main.js:5701` — the vehicle click-and-hold branch does guard on intro flags (`5740`: `if (!isOrbitAnimating || introActive || isIntroTransitioning || isPostSequence) return;`) but still omits `allAssetsLoaded`; the mobile drag-to-select (`5713-5730`) and orbit-swipe-tracking (`5732-5737`) branches above it have no readiness guard beyond `isPostSequence` / `isHandheldDevice`.

**Why it actually breaks things:** during loading, the code is mid-flight toggling background-scene visibility and incrementally populating raycast caches (`motorcycleCache`, `boatCache`, `broncoCache`, `car2Cache`, `racecarCache` — built up across `src/main.js:3687-3723`), and briefly flipping models' `.visible` for shader pre-compilation (`3667-3671`, `3748-3763`). A click or keypress that slips through to `isPostSequence = true` / `triggerNavigation()` forces camera and vehicle state that assumes those caches are fully populated and visibility has settled — while the `#loading-overlay` DOM element does **not** actually block this, because these listeners are bound to `window` and key off `clientX`/`clientY` raycasting rather than checking `event.target` against the overlay.

**Fix:** add a single `if (!allAssetsLoaded) return;` guard at the top of the `click` (`5589`), `keydown` (`5287`), and `pointerdown` (`5701`) listeners. Reuses the existing `allAssetsLoaded` flag — no new state required. ~3 lines, low risk.

### 1.2 Audio toggle double-click deadlocks first-time playback

`src/main.js:5427-5489`. The click handler defers to a 250ms `setTimeout` to distinguish single vs. double click. `audioCtx`/`analyser` creation and the actual `audio.play()` call only happen inside the deferred single-click branch (`5457-5486`). The double-click branch (`5433-5454`) only swaps the song and does `if (!audio.paused) audio.play()`. If a user's very first interaction with the toggle is a fast double-click, `audio.paused` is still `true` (nothing has played yet), so `play()` never fires — the song silently changes but nothing plays, and the visualizer stays dead until a later single click.

### 1.3 Keyboard vs. pointer guard-parity gap

`src/main.js:5314-5345` vs. `5740`. This is a narrower instance of the same "missing guard" pattern as 1.1: the pointerdown vehicle-hold path checks `introActive` / `isIntroTransitioning` / `isPostSequence` before acting; the keydown Arrow-key handlers don't check any of those before calling `triggerNavigation()`. Worth fixing in the same pass as 1.1, ideally with the same guard mechanism (see §3, Phase C).

### 1.4 Dead code

- `updateVehicleTextbox()` (`src/main.js:1264-1274`) is defined but never called anywhere in the file — superseded by `updateSceneTextboxes` (`1344`) and the `staticTextboxConfigs` system, never removed.
- `_car2Raycaster` (`src/main.js:2543`) is declared at module scope (mirroring the pattern used for the other 4 vehicles — `_motoRaycaster:1952`, `_boatRaycaster:1655`, `_broncoRaycaster:2284`, `_planeRaycaster:2174`) but never referenced again. `runCar2Raycast()` (`2565-2600`) and `runRacecarRaycast()` (`2693-2727`, no module-level raycaster declared at all) instead allocate a brand-new `THREE.Raycaster` plus several `THREE.Vector3`s on *every call* — each called at least twice per cache-miss — instead of reusing a shared instance like the other 4 vehicles correctly do.

---

## 2. UI / Functionality Improvement Suggestions

Scenario-based; broader categories already listed in `IMPLEMENTATION_PLAN.md` Part 4 (loading UX, audio-state persistence, textbox interaction polish, scene-transition crossfades, general a11y/mobile/code-quality wishlists) are cross-referenced rather than restated.

- **Movie/video-overlay easter egg has no touch-friendly exit.** `triggerMovieTransition()` locks `controls.enabled` and the camera for the full video duration; the only manual exit is `exitMovieView()`, wired solely to the `Escape` keydown (`src/main.js:5290-5299`, `5494-5515`). There's no click-to-dismiss on `#video-overlay` and no visible close button (the `#movie-btn` markup in `index.html:67-69` is commented out). A touch-only user who triggers this has no way to skip or exit early.
- **No hover/cursor feedback on two real interactive 3D affordances.** The `pointermove` handler (`5857-5921`) sets `cursor: pointer` and highlighting for textboxes and the Resume nav label, but never for the click-and-hold vehicle (`5700-5762`) or the click-to-return-to-finale cylinder background (`5661-5697`) — both are functioning interactions, presented with a plain default cursor, so desktop users have no way to discover them short of trial and error.
- **Clicking the cylinder while already in finale view is a silent no-op.** `src/main.js:5666` only runs the transition-to-finale logic `if (!isPostSequence)`; clicking the same visual surface once already there does nothing — no feedback, no state change — so it reads as "the click didn't register" rather than "already there."
- **Audio toggle timing feels laggy and its hidden feature is hard to trigger.** Every single click is delayed 250ms before anything audible happens (`src/main.js:5486`), and the double-click detection window is also only 250ms — tighter than typical OS double-click thresholds (~400-500ms) — with no visual cue anywhere that double-clicking does something different. Users trying to skip a track are more likely to just toggle play/pause twice by accident.
- **Mobile drag-to-select nav stacks three unexplained timers with no interim feedback.** `releaseMobileNavDrag()` (`src/main.js:5771-5807`) requires landing within a ~15° window (`marginOfError = 0.26`), then waits a further fixed 500ms before navigating on success, or imposes a 1.5s delay before auto-rotation resumes on a near-miss — none of which is surfaced to the user *during* the drag itself.
- **Escape-key dismiss cascade has no mobile equivalent for two of its three steps.** The `Escape` handler cascades textbox → movie → finale (`5290-5299`). Textbox dismissal has a mobile-friendly tap-out equivalent; the movie-exit and return-to-finale steps do not (see the two findings above) — mobile users have fewer ways out of those states than desktop users.

---

## 3. Implementation Plan

### Phase A — Correctness fixes (do first; independent, low-risk)

| # | Task | Why | Effort |
|---|------|-----|--------|
| A1 | Add `if (!allAssetsLoaded) return;` guard to `click` (5589), `keydown` (5287), `pointerdown` (5701) listeners | Fixes the reported premature-interaction-during-loading bug (§1.1) | S |
| A2 | Add intro/transition guard to keyboard Arrow-key handlers, matching pointerdown's existing guard | Closes the guard-parity gap (§1.3) | S |
| A3 | Fix audio toggle double-click deadlock — ensure `audioCtx`/`analyser` init and `play()` happen regardless of single vs. double-click path | First-interaction audio can silently fail (§1.2) | S |
| A4 | Remove `updateVehicleTextbox()`; reuse a module-level raycaster/vector set in `runCar2Raycast`/`runRacecarRaycast` instead of per-call allocation | Dead code + avoidable GC churn (§1.4) | S |

### Phase B — Interaction/UX polish

| # | Task | Why | Effort |
|---|------|-----|--------|
| B1 | Add hover cursor/feedback for the click-and-hold vehicle and the click-to-return-to-finale background | Two real affordances are currently undiscoverable | S |
| B2 | Add a subtle acknowledgment (or simply disable the raycast) when the cylinder is clicked while already in finale view | Removes the "did my click even register?" dead end | S |
| B3 | Add a visible/touch-friendly exit control for the movie overlay | Mobile users can otherwise get stuck watching the full video | S |
| B4 | Rebalance audio-toggle click timing (shorter single-click delay, longer/OS-typical double-click window) and add a subtle cue that double-click does something different | Reduces perceived lag, makes the hidden feature discoverable | S |
| B5 | Add interim visual feedback during mobile drag-to-select (e.g. proximity indicator as the drag approaches the 15° snap window) | Removes the "silently correct or silently wrong" gap during drag | M |

### Phase C — Structural

| # | Task | Why | Effort |
|---|------|-----|--------|
| C1 | Introduce one shared readiness/navigation guard (e.g. `canNavigate()`, checking `allAssetsLoaded` + the relevant intro/transition flags) consulted by every navigation-triggering handler | Generalizes A1 + A2 into a single source of truth instead of a guard duplicated per-handler; should land **before** picking up `IMPLEMENTATION_PLAN.md`'s Nav 1-3 work (drag-to-swipe, keyboard shortcuts, scene dots), since those add more handlers onto the same currently-unguarded surface | M |

### Suggested order of operations

1. **Phase A first** — all four items are small, independent, and low-risk; A1 directly addresses the bug the user reported.
2. **Phase B next** — polish, no architectural dependencies on A or C.
3. **Phase C before any new navigation features** — land the shared guard before `IMPLEMENTATION_PLAN.md`'s Nav 1-3 items add more input handlers that would otherwise need the same guard copy-pasted in again.
