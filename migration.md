# Selene's Space refactor plan

## Structural audit

### Verified baseline

The current repository passes all required checks:

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- `npm run build` — passed and confirmed `/` is statically prerendered.
- The publishable output remains `dist/client/`.
- The build reports one non-failing warning about a client chunk larger than 500 kB.
- The worktree already contains an unrelated modification to `TODO.md`; the refactor must preserve it and must not include it in refactor commits.

Actual line counts:

| File | Lines | Current responsibility |
|---|---:|---|
| `lib/solar-system.ts` | 1,016 | Almost the entire Three.js engine |
| `app/page.tsx` | 267 | State, engine lifecycle, astronomy calculations, formatting, and UI |
| `components/simulation-time-picker.tsx` | 232 | Calendar UI plus astronomical event calculation |
| `app/globals.css` | 188 | Complete responsive application styling |
| `scripts/calculate_meridian_lengths.py` | 182 | Offline ETOPO/WGS84 data generation |
| `components/eclipse-observer-panel.tsx` | 90 | Earth observer controls |
| `lib/solar-data.ts` | 44 | Static body catalog only |
| `lib/explorer-tool.ts` | 34 | Optional WebMCP registration |
| `hooks/use-mobile.ts` | 21 | Generated UI support hook |

The actual `components/`, `hooks/`, and `scripts/` inventory is:

```text
components/
  eclipse-observer-panel.tsx
  simulation-time-picker.tsx
  ui/
    accordion.tsx
    alert-dialog.tsx
    alert.tsx
    aspect-ratio.tsx
    attachment.tsx
    avatar.tsx
    badge.tsx
    breadcrumb.tsx
    bubble.tsx
    button-group.tsx
    button.tsx
    calendar.tsx
    carousel.tsx
    chart.tsx
    checkbox.tsx
    collapsible.tsx
    combobox.tsx
    command.tsx
    context-menu.tsx
    dialog.tsx
    direction.tsx
    drawer.tsx
    dropdown-menu.tsx
    empty.tsx
    field.tsx
    hover-card.tsx
    input-group.tsx
    input-otp.tsx
    input.tsx
    item.tsx
    kbd.tsx
    label.tsx
    marker.tsx
    menubar.tsx
    message-scroller.tsx
    message.tsx
    native-select.tsx
    navigation-menu.tsx
    pagination.tsx
    popover.tsx
    progress.tsx
    radio-group.tsx
    resizable.tsx
    scroll-area.tsx
    select.tsx
    separator.tsx
    sheet.tsx
    sidebar.tsx
    skeleton.tsx
    slider.tsx
    spinner.tsx
    switch.tsx
    table.tsx
    tabs.tsx
    textarea.tsx
    toast.tsx
    toggle-group.tsx
    toggle.tsx
    tooltip.tsx

hooks/
  use-mobile.ts

scripts/
  calculate_meridian_lengths.py
  __pycache__/calculate_meridian_lengths.cpython-314.pyc
```

The `__pycache__` directory is ignored and must remain untracked.

### Files with mixed responsibilities

1. **`lib/solar-system.ts` is the primary refactor target.**

   Its responsibilities are currently divided roughly as follows:

   - Lines 12–61: simulation constants and Earth circumference calculations.
   - Lines 63–156: renderer, camera, controls, lights, star field, textures, and resource tracking.
   - Lines 157–187: body type guards, scale conversion, Kepler solving, and orbit geometry.
   - Lines 188–247: Earth grid and landmark creation.
   - Lines 249–330: surface materials, shader injection, meshes, labels, rings, and initial orbital phases.
   - Lines 331–467: sky markers, eclipse sprites, and compass DOM elements.
   - Lines 468–496: lunar coordinates, phase names, and scene-based eclipse classification.
   - Lines 497–579: engine state and mapping astronomy-engine coordinates into scene coordinates.
   - Lines 580–658: orbit refresh, camera focusing, Earth observer activation, and zoom.
   - Lines 661–777: resize handling, pointer input, raycasting, grid hover, landmarks, wheel input, and context loss.
   - Lines 778–873: Earth observer camera orientation, horizon, sky markers, and eclipse presentation.
   - Lines 874–979: time advancement, every body transform, camera following, rendering, labels, and first-frame readiness.
   - Lines 980–1015: public API and cleanup.

   The most fragile couplings are:

   - `realScale` affects orbital geometry, body size, camera clipping, focus distance, observer clipping, ring scale, and label offsets.
   - `days` is shared by orbital movement, axial rotation, moon phase, eclipses, exact observer positions, and the public date API.
   - `focus()` at lines 590–623 also exits observer mode and mutates camera, controls, selection, clipping, and transition state.
   - `setEarthObserver()` at lines 624–652 partly duplicates observer cleanup from `focus()`.
   - The animation callback at lines 876–979 depends on the exact order of body updates, observer positioning, camera movement, controls, rendering, and DOM label placement.
   - Cleanup depends on locally captured listener function identities and manually maintained resource arrays.

2. **`components/simulation-time-picker.tsx` mixes domain logic with UI.**

   Lines 20–110 calculate seasons and eclipse start times. Lines 116–232 implement React calendar state and markup. The astronomy calculations are deterministic and independently testable; they should not remain embedded in a component.

3. **`app/page.tsx` mixes four layers.**

   - Lines 16–36 define simulation speed configuration and body grouping.
   - Lines 38–83 format values and perform astronomy-engine observer calculations.
   - Lines 85–176 own engine lifecycle, polling, navigation state, Earth observer state, and WebMCP integration.
   - Lines 178–267 render the complete interface.

   The file is not excessively large, but engine commands and React state must stay synchronized manually. UI selection, WebMCP selection, observer entry, observer exit, and reset each update overlapping state in slightly different orders.

### Duplicated or scattered logic

- The nine Earth-sky targets appear in four places:
  - `astronomyTargets` in `app/page.tsx` lines 64–74.
  - `skyTargets` in `eclipse-observer-panel.tsx` line 36.
  - `observerAstronomyBodies` in `solar-system.ts` lines 33–41.
  - `observerMarkerNames` in `solar-system.ts` line 339.
- J2000 date conversion is repeated at `solar-system.ts` lines 473, 565, 573, 780, 997, and 998.
- Body and satellite discrimination is implemented locally inside `createSolarSystem()`, although it is a property of the data model.
- Eclipse-related logic is spread across calendar event searches, scene-alignment alerts, and lunar/observer visual strengths. These calculations should be isolated, but their different meanings and thresholds must remain separate.
- Body lookup alternates between repeated `.find()` calls and `objectByName`. The animation loop still uses `.find()` at line 928 despite already having a map.
- Page selection from visible UI and selection from WebMCP duplicate state updates, although the WebMCP path deliberately uses `flushSync`. They should not be casually merged because their ordering is observably different.

### Safe areas to leave alone

- `lib/solar-data.ts` is compact and cohesive. Do not split one body per file or reformat the whole catalog.
- `lib/explorer-tool.ts` is already cohesive. Add characterization tests, but retain its tool name, schema, annotations, return value, and abort lifecycle.
- `components/eclipse-observer-panel.tsx` is cohesive after its shared domain types and constants are moved.
- `app/globals.css` is only 188 lines and closely reflects the existing DOM. Avoid CSS restructuring during this refactor.
- `scripts/calculate_meridian_lengths.py` and `lib/earth-meridian-lengths.json` form an offline data-generation pair. Leave both unchanged.
- `public/` textures and attribution files are unrelated to the structural problem.
- Every file under `components/ui/` and `hooks/use-mobile.ts` is generated UI infrastructure. Do not edit or reformat them.

One convention mismatch should be recorded: the current lint command excludes all of `components/` and `hooks/`, not only generated UI primitives. The refactor should lint the two custom top-level components, new custom components, hooks written by the project, and tests while continuing to exclude `components/ui/**` and `hooks/use-mobile.ts`.

## Target module structure

### Domain and pure calculation modules

| New file | Responsibility and exports | Extracted from |
|---|---|---|
| `lib/astronomy/time.ts` | `J2000_EPOCH_MS`, `DAY_MS`, `dateToSimulationDays(date: Date): number`, `simulationDaysToDate(days: number): Date` | Repeated code in `lib/solar-system.ts` |
| `lib/astronomy/events.ts` | `AstronomyEventKind`, `AstronomyEvent`, `SolarEclipseStart`, `sameLocalDay(first, second): boolean`, `solarEclipseStart(eclipse): SolarEclipseStart`, `eventsForYear(year): AstronomyEvent[]` | `components/simulation-time-picker.tsx` lines 20–110 |
| `lib/astronomy/observer.ts` | `SKY_TARGETS`, `SkyTarget`, `ObserverLocation`, `DEFAULT_OBSERVER`, `astronomyBodyForTarget(target)`, `skyObservation(date, location, target): SkyObservation` | `app/page.tsx`, `eclipse-observer-panel.tsx`, and target maps in `solar-system.ts` |
| `lib/astronomy/moon.ts` | `LunarCoordinates`, `MoonPhaseState`, `EclipseState`, `lunarCoordinates(date)`, `moonPhaseFromAngle(angle)`, `moonPhaseAt(date)`, `lunarEclipseStrength(coordinates)`, `classifySceneEclipse(earthPosition, moonPosition)` | `solar-system.ts` lines 468–496 and 922–927 |
| `lib/formatters.ts` | `formatMass(massKg: number): string`, `formatKilometers(kilometers: number): string` | `app/page.tsx` lines 38–61 |

Add these exports to `lib/solar-data.ts` without changing the `bodies` array:

```ts
export type SolarBody = (typeof bodies)[number];
export type SatelliteBody = Extract<SolarBody, { readonly parent: string }>;
export function isSatellite(body: SolarBody): body is SatelliteBody;
export function findBody(name: BodyName): SolarBody;
```

### Solar-system engine modules

| New file | Responsibility and exports | Extracted from |
|---|---|---|
| `lib/solar-system/types.ts` | `Landmark`, `LandmarkSelection`, `EarthObserver`, `SolarSystemOptions`, `SolarSystemCallbacks`, `MoonPhaseState`, `EclipseState`, and the `SolarSystem` interface | Public and internal types at the top and bottom of `lib/solar-system.ts` |
| `lib/solar-system/orbit-math.ts` | `SCENE_AU`, `KILOMETERS_PER_AU`, `orbitRadius(body, realScale)`, `bodyRadius(body, realScale)`, `solveEccentricAnomaly(mean, eccentricity)`, `orbitalPosition(body, mean, realScale, target?)`, `initialOrbitalPhase(body, index)`, `orbitalAngle(body, days, phase)` | Lines 12–16, 157–178, 327–329, and 882–886 |
| `lib/solar-system/resources.ts` | `ResourceRegistry`, `createResourceRegistry()`, `loadSrgbTexture(loader, renderer, registry, url, onError)` | Resource arrays, texture loading, and resource disposal |
| `lib/solar-system/earth-overlays.ts` | `EARTH_LANDMARKS`, `EarthGridReading`, `parallelCircumferenceKm`, `physicalMeridianLengthKm`, `createEarthGrid(registry)`, `createEarthLandmarks(registry)`, `readEarthGridAt(localPoint)` | Lines 43–61 and 188–247, plus grid-tooltip calculations at 708–727 |
| `lib/solar-system/celestial-mapper.ts` | `CelestialMapper`, `createCelestialMapper()` with methods for Moon, planet, and observer-vector mapping into scene coordinates | Lines 525–578 and the astronomy-engine imports they require |
| `lib/solar-system/body-scene.ts` | `SceneBody`, `BodyScene`, `createBodyScene(options)`, `refreshOrbitLines(bodyScene, realScale)`, `updateBodyScene(bodyScene, frame)`, `updateBodyLabels(bodyScene, frame)`, `disposeBodyLabels(bodyScene)` | Body materials, shader injection, rings, meshes, orbits, glow, labels, and per-frame body updates |
| `lib/solar-system/camera-controller.ts` | `FocusCameraPlan`, `calculateFocusCameraPlan(input)`, `FocusCameraController`, `createFocusCameraController(options)` | Lines 590–623 and the non-observer camera branch at 928–945 |
| `lib/solar-system/earth-observer-view.ts` | `EarthObserverView`, `createEarthObserverView(options)` with `enter`, `exit`, `zoom`, pointer gesture methods, `update`, `active`, `current`, and `dispose` | Horizon, observer sprites, compass, free-look state, observer camera, and eclipse presentation |
| `lib/solar-system/input-controller.ts` | `SceneInputController`, `bindSceneInput(options)` returning `{ dispose(): void }` | Lines 667–777, excluding observer camera calculations |

Keep `lib/solar-system.ts` as the only public engine entry point. Its responsibility becomes lifecycle and frame sequencing. It must continue exporting:

```ts
export function createSolarSystem(
  host: HTMLDivElement,
  onSelect: (name: BodyName | null) => void,
  onLandmarkSelect: (selection: LandmarkSelection) => void,
  onError: (message: string) => void,
  onReady: () => void,
  onObserverFreeLook: () => void,
): SolarSystem;

export type {
  EarthObserver,
  Landmark,
  LandmarkSelection,
  SolarSystem,
  SolarSystemOptions,
};
```

The positional `createSolarSystem(...)` signature must remain unchanged so `app/page.tsx` does not need an API migration.

### Custom UI modules

| New file | Responsibility and exports | Extracted from |
|---|---|---|
| `components/solar-system/object-browser.tsx` | `ObjectBrowserProps`, `ObjectBrowser` | `app/page.tsx` lines 213–229 |
| `components/solar-system/body-details.tsx` | `BodyDetailsProps`, `BodyDetails` | `app/page.tsx` lines 230–247 |
| `components/solar-system/simulation-controls.tsx` | `SPEED_STOPS`, `SimulationControlsProps`, `SimulationControls` | Speed constants and `app/page.tsx` lines 250–264 |

Do not create wrappers around generated primitives. The new components may import `components/ui/slider`, `switch`, `calendar`, and `popover`, but must not modify those files.

## Ordered implementation plan

1. **Add the test baseline and minimal in-place test seams.**

   Create:

   - `vitest.config.ts`
   - `tests/solar-data.test.ts`
   - `tests/orbit-math.test.ts`
   - `tests/eclipse-events.test.ts`
   - `tests/focus-camera.test.ts`
   - `tests/explorer-tool.test.ts`

   Modify `package.json`, `package-lock.json`, `lib/solar-system.ts`, and `components/simulation-time-picker.tsx`.

   Add `vitest` as the only new dev dependency and add:

   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```

   Configure Vitest with `environment: 'node'`, `include: ['tests/**/*.test.ts']`, the repository-root `@` alias, and mock restoration between tests. Do not add a browser, preview server, jsdom, or WebGL environment. Vitest uses the existing Vite/TypeScript toolchain and adds no code or runtime requirement to `dist/client/`.

   Before moving functions into new modules, lift the existing calculations to module scope in their current files and export them with their final names: `dateToSimulationDays`, `simulationDaysToDate`, `orbitRadius`, `bodyRadius`, `orbitalPosition`, `moonPhaseFromAngle`, `lunarEclipseStrength`, `classifySceneEclipse`, `calculateFocusCameraPlan`, `eventsForYear`, `solarEclipseStart`, and `sameLocalDay`. The runtime paths must immediately call these functions; do not create duplicate test-only implementations.

   Characterization tests must cover:

   - J2000 noon UTC maps to day zero and arbitrary dates round-trip without drift.
   - Compressed and true-scale orbital radii for Earth, Moon, and a dwarf planet.
   - Kepler position at periapsis and a non-zero inclination/ascending node.
   - Retrograde rotation data remains negative where currently defined.
   - Moon phases at `0`, `π/2`, `π`, and `3π/2`.
   - Solar, lunar, and off-axis scene eclipse classification.
   - Lunar shadow strength at the existing 0.42° and 1.48° boundaries.
   - The ordered 2024 equinoxes, solstices, lunar eclipses, and solar eclipses.
   - The March 3, 2026 total lunar eclipse.
   - Body focus preserving an already-close camera distance.
   - Whole-system desktop and mobile focus.
   - Real-scale focus near plane, distance, and transition formulas.
   - Exact WebMCP registration, validation, selection, result, and cleanup behavior.

   Must not change rendering output, thresholds, `createSolarSystem(...)`, its returned API, calendar labels, or event-selection behavior.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: load `/`, select Earth, Moon, another planet, and Whole system; confirm selection and camera behavior still match the pre-test version.

2. **Create the initial root `AGENTS.md`.**

   Create `AGENTS.md` with the runtime constraints, required checks, generated-file rules, public API guardrail, and the target module map marked as the active refactor destination. Do not claim that target files already exist. Modify no application code.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

3. **Extract shared types, time conversion, body helpers, orbit math, and lunar math.**

   Create `lib/astronomy/time.ts`, `lib/astronomy/moon.ts`, `lib/solar-system/types.ts`, and `lib/solar-system/orbit-math.ts`. Modify `lib/solar-data.ts`, `lib/solar-system.ts`, and affected tests.

   Move the Step 1 test seams without renaming them. Add `SolarBody`, `SatelliteBody`, `isSatellite`, and `findBody` to `solar-data.ts`. Define the explicit `SolarSystem` interface in `types.ts`, then re-export it and existing public types from `lib/solar-system.ts`.

   Must not change six Kepler iterations, J2000, scene scale constants, phase formulas, Moon phase names, eclipse thresholds, or body values.

   **Risk:** orbital position errors can move every body while still compiling.

   Guardrails: compare representative vectors in tests, retain optional target-vector mutation, and preserve rotation order: periapsis, inclination, ascending node.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: compare Earth, Moon, Pluto, and Eris in both scales; pause and resume time.

4. **Extract calendar-event and Earth-observer astronomy.**

   Create `lib/astronomy/events.ts` and `lib/astronomy/observer.ts`. Modify the simulation time picker, observer panel, page, solar-system facade, and affected tests.

   Move calendar calculations unchanged. Move `ObserverLocation`, `SkyTarget`, the Warsaw default, target list, astronomy-engine body map, and `skyObservation()` into `observer.ts`. Replace all duplicated target lists/maps with `SKY_TARGETS` and `astronomyBodyForTarget()`.

   Must not change local-day comparisons, eclipse calculations, labels, picker behavior, observer wording, or altitude rounding.

   **Risk:** UTC date accessors would move markers in some time zones. Preserve local accessors.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: navigate month/year twice, select March 3, 2026, use “Set to now,” and enter the Warsaw sky view.

5. **Extract resource ownership and Earth overlays.**

   Create `lib/solar-system/resources.ts` and `lib/solar-system/earth-overlays.ts`. Modify `lib/solar-system.ts` and relevant tests.

   Replace resource arrays with an idempotent `ResourceRegistry`. Move Earth grid, landmarks, WGS84 calculations, terrain-meridian lookup, and grid-reading text generation into `earth-overlays.ts`.

   Must not change grid geometry, colors, opacity, landmarks, longitude sign, meridian data, front-side tests, tooltip wording, or highlight classes.

   **Risk:** shared resources can be disposed twice or omitted. Register each resource exactly once and dispose only through the registry.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: hover visible grid lines, verify no back-side tooltip, and click all landmarks.

6. **Extract celestial coordinate mapping and body-scene construction.**

   Create `lib/solar-system/celestial-mapper.ts` and `lib/solar-system/body-scene.ts`. Modify `lib/solar-system.ts` and orbit/lunar tests.

   Move textures, body materials, shaders, meshes, axial tilt, Saturn's ring, orbit lines, glow, labels, and per-frame body updates into `body-scene.ts`. Move EQJ-to-scene mapping into `celestial-mapper.ts`.

   Must not change body order, textures, color-space setup, anisotropy, shader strings/cache keys, tilts, ring geometry, Moon mode behavior, observer planet positioning, or labels.

   **Risk:** this is a high-risk visual step. Move shaders verbatim, preserve shared uniform references and stable body objects, and avoid per-frame allocation.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: inspect textures, Galilean moons, Sun glow, Saturn's ring, Earth tilt, Moon phase/shadow, satellites, and orbit lines.

7. **Extract normal camera focusing and following.**

   Create `lib/solar-system/camera-controller.ts`. Modify `lib/solar-system.ts` and camera tests.

   Move `focus()`, transition timing/cancellation, and non-observer camera updates. The facade exits observer view before requesting normal focus.

   Preserve the home vector, FOV, near plane, distance formulas, closer-camera behavior, offset, mobile multiplier, interpolation factor, thresholds, timeout, moving-body following, and user cancellation.

   **Risk:** regressions can cause Earth/Moon to zoom out or disappear.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: switch repeatedly between Earth, Moon, Jupiter, a moon, Pluto, and Whole system in both scales; drag during a transition.

8. **Extract the Earth observer view.**

   Create `lib/solar-system/earth-observer-view.ts`. Modify `lib/solar-system.ts` and observer/lunar tests.

   Move horizon rendering, target sprites, eclipse sprites, compass labels, observer state, local basis, camera placement, free look, zoom, marker state, eclipse presentation, and disposal into one controller.

   Preserve FOV values, drag sensitivity, altitude clamp, horizon shader, marker formulas, below-horizon opacity, eclipse ranges, compass labels, callback timing, and pole fallback.

   **Risk:** this is the highest-risk extraction because camera movement and sky coordinates share mutable vectors.

   Guardrails: allocate scratch vectors once, preserve movement signs, emit free-look once per transition, fully restore state on exit, and let the facade decide whether to refocus Earth.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: use every preset and custom coordinates, center every target, drag, zoom, inspect below-horizon objects, and exit.

9. **Extract canvas input binding and raycasting.**

   Create `lib/solar-system/input-controller.ts`. Modify `lib/solar-system.ts`.

   Move pointer, wheel, raycast, tooltip, landmark, body selection, and context-loss handlers into `bindSceneInput()`. Delegate observer gestures to `EarthObserverView` and return one `dispose()` method.

   Preserve the click threshold, input types, raycast targets, popup bounds, passive wheel setting, pointer capture, touch actions, and context-loss behavior.

   **Risk:** recreated anonymous handlers cannot be removed. Store stable handler references and pair every listener addition/removal exactly.

   Verification:

   ```sh
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Manual smoke test: desktop input, landmarks, mobile page scrolling, observer dragging, and observer zoom.

10. **Reduce `lib/solar-system.ts` to lifecycle and frame orchestration.**

    Modify `lib/solar-system.ts` and tests whose imports changed. Delete no public facade.

    Preserve this frame sequence:

    1. Calculate and clamp elapsed time.
    2. Advance visible, unpaused simulation time.
    3. Update bodies and lunar shadow uniforms.
    4. Update observer or normal camera.
    5. Apply orbit visibility and controls.
    6. Face the Sun glow to the camera.
    7. Render.
    8. Fire `onReady()` after the first successful render.
    9. Project compass and body labels.

    Preserve the returned methods: `focus`, `setEarthObserver`, `zoomEarthObserver`, `setOptions`, `setDate`, `getDate`, `getMoonPhase`, `getEclipseState`, `reset`, and `dispose`.

    Disposal order: stop animation, disconnect resize, dispose controls/input/observer DOM, remove labels/tooltips, dispose resources, dispose renderer, remove canvas.

    **Risk:** frame-order changes can create visual lag, stale eclipse state, or callbacks after unmount.

    Verification:

    ```sh
    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    ```

    Manual smoke test: run for several minutes; exercise time, speed, toggles, date, navigation, refresh, and cleanup.

11. **Make `app/page.tsx` a composition layer.**

    Create `lib/formatters.ts`, `components/solar-system/object-browser.tsx`, `components/solar-system/body-details.tsx`, and `components/solar-system/simulation-controls.tsx`. Modify `app/page.tsx` and lint paths.

    Move JSX verbatim, preserving classes, order, accessibility, and callbacks. Keep engine lifecycle, polling, state, and WebMCP in the page. Keep visible UI focus and WebMCP focus explicit because WebMCP uses `flushSync`.

    Must not change initial state, polling, reset order, observer entry/exit, CSS class names, or WebMCP behavior.

    **Risk:** changing the `flushSync` boundary can remove the synchronous WebMCP selection update.

    Verification:

    ```sh
    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    ```

    Manual smoke test: exercise every control, selection row, detail panel, landmark, calendar, observer control, and reset.

12. **Update repository documentation.**

    Modify `README.md`. Replace the old structure section, add `npm test`, explain that Vitest is development-only, and correct the obsolete circular/coplanar orbit description. Do not alter hosting instructions.

    Verification:

    ```sh
    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    ```

13. **Finalize `AGENTS.md` against the files that now exist.**

    Replace the early destination wording with the final architecture. Use this final content:

    ```md
    # Selene's Space agent guide

    ## Project

    Selene's Space is a browser-side interactive WebGL solar-system explorer built with React, TypeScript, Three.js, astronomy-engine, and Vinext.

    It includes body selection and camera following, compressed and true-scale views, simulation time controls, an astronomical-event calendar, Earth landmarks, eclipse presentation, Earth sky observation, and the optional WebMCP `start_focusing_solar_body` tool.

    ## Runtime and deployment constraints

    - Use Node.js 22.13 or newer.
    - The deployed application must remain fully static and browser-side.
    - `npm run build` must produce the publishable site in `dist/client/`.
    - Do not introduce a server runtime, API routes, databases, Workers, server-backed state, or remote runtime assets.
    - `dist/server/` may be produced while prerendering but is not deployed.
    - The interactive scene requires WebGL 2 and hardware acceleration.
    - Preserve Vinext static export through `next.config.ts`.
    - Preview the static build over HTTP; do not use `file://`.

    ## Architecture

    - `app/page.tsx`: React composition, UI state, engine lifecycle, polling, and WebMCP adapter.
    - `app/globals.css`: application and responsive styling.
    - `components/solar-system/`: application-specific explorer panels and controls.
    - `components/simulation-time-picker.tsx`: date/time calendar UI.
    - `components/eclipse-observer-panel.tsx`: Earth sky observer controls.
    - `components/ui/`: generated UI primitives. Treat these files as generated and do not edit or reformat them.
    - `lib/solar-data.ts`: static celestial-body catalog and body type helpers.
    - `lib/astronomy/time.ts`: J2000 simulation date conversion.
    - `lib/astronomy/events.ts`: equinox, solstice, and eclipse calendar calculations.
    - `lib/astronomy/observer.ts`: Earth observer targets, locations, and sky visibility.
    - `lib/astronomy/moon.ts`: lunar coordinates, phases, eclipse classification, and shadow strength.
    - `lib/solar-system.ts`: public engine facade, animation sequencing, and lifecycle.
    - `lib/solar-system/types.ts`: engine public and shared types.
    - `lib/solar-system/orbit-math.ts`: deterministic scene scale and orbital calculations.
    - `lib/solar-system/resources.ts`: GPU resource registration and disposal.
    - `lib/solar-system/earth-overlays.ts`: Earth grid, landmarks, and circumference readings.
    - `lib/solar-system/celestial-mapper.ts`: astronomy-engine coordinates mapped into scene coordinates.
    - `lib/solar-system/body-scene.ts`: body meshes, materials, orbit lines, shaders, labels, and per-frame transforms.
    - `lib/solar-system/camera-controller.ts`: normal focus transitions and selected-body following.
    - `lib/solar-system/earth-observer-view.ts`: surface observer camera, horizon, compass, sky markers, and eclipse visuals.
    - `lib/solar-system/input-controller.ts`: pointer, wheel, raycast, and context-loss handling.
    - `lib/explorer-tool.ts`: optional WebMCP registration.
    - `scripts/calculate_meridian_lengths.py`: offline ETOPO/WGS84 meridian-data generator.
    - `public/`: local textures and static assets.
    - `tests/`: deterministic characterization and unit tests.

    ## Commands

    ```sh
    npm install
    npm run dev
    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    npm run preview
    ```

    `npm run preview` serves the static files from `dist/client/`.

    ## Checks

    Before finishing any code change, run:

    ```sh
    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    ```

    The test suite uses Vitest in a Node environment for deterministic pure logic. It does not add a production runtime or deployment requirement.

    Lint application code, custom components, hooks, tests, and configuration. Do not add generated files under `components/ui/` or `hooks/use-mobile.ts` to lint-driven cleanup work.

    ## Engine guardrails

    - Preserve the public `createSolarSystem(...)` signature and the methods returned by it.
    - Keep all per-frame scratch vectors and reusable objects allocated outside the animation callback.
    - Clamp frame elapsed time to 0.05 seconds and do not advance simulation time while paused or while `document.hidden`.
    - Preserve frame order: time, body transforms, shadow state, camera, controls, render, first-frame callback, DOM overlays.
    - Fire `onReady()` only after the first successful render.
    - Keep display-scale and true-scale formulas separate and covered by tests.
    - Keep the Moon's compressed-scale approximation and true-scale astronomy-engine position behavior unchanged.
    - Preserve camera distance, near-plane, transition threshold, and moving-target follow formulas.
    - User camera input must cancel an active normal-camera transition.
    - Earth observer dragging must switch from target tracking to free look once per transition.
    - Preserve mobile page scrolling outside Earth observer mode and captured touch input inside it.

    ## Resource and cleanup guardrails

    - Register every created Three.js geometry, material, and texture with the resource registry exactly once.
    - Stop the animation loop before disposing controls, listeners, resources, renderer, or DOM nodes.
    - Remove every event listener with the same function reference and target used to add it.
    - Disconnect `ResizeObserver` and media-query listeners.
    - Remove body labels, compass labels, tooltips, and the renderer canvas during disposal.
    - Resource disposal must be safe if React cleanup runs more than once.

    ## Astronomy and eclipse guardrails

    - Calendar eclipse searches, scene eclipse alerts, lunar surface shadow strength, and observer-view eclipse visuals serve different purposes. Do not merge their thresholds.
    - Calendar day matching currently uses local calendar dates; do not silently change it to UTC.
    - Preserve the J2000 epoch and conversion constants.
    - Preserve the order of orbital rotations: periapsis, inclination, then ascending node.
    - `lib/earth-meridian-lengths.json` is generated data. Regenerate it only through `scripts/calculate_meridian_lengths.py`.
    - Keep all runtime textures local.

    ## WebMCP guardrails

    - Preserve the tool name `start_focusing_solar_body`.
    - Preserve support for every current body plus `Whole system`.
    - `Whole system` must continue mapping to a `null` selection.
    - Preserve schema validation, annotations, result shape, and abort-controller cleanup.
    - Keep the synchronous React selection update used by the WebMCP adapter unless tests demonstrate equivalent behavior.
    ```

    Final verification:

    ```sh
    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    ```

    Perform one final end-to-end smoke pass covering camera orbit and zoom, every selection route, true scale, calendar navigation and eclipse selection, landmarks, Earth sky view, mobile scrolling, reset, and WebMCP registration in a supporting browser.

No production dependency, deployment setting, server component, route, database, Worker, or public `createSolarSystem(...)` API change is required by this plan.
