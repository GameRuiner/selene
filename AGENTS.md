# Selene's Space agent guide

## Project constraints

- Use Node.js 22.13 or newer.
- Develop and preview locally at `http://localhost:3000` with `npm run dev -- --port 3000`.
- Keep the application static and browser-side. `npm run build` must produce the site in `dist/client/`; do not introduce server routes, Workers, databases, or remote runtime assets.
- Preserve Vinext static export through `next.config.ts`; `dist/server/` may be used during prerendering but is not part of the local preview.
- The scene requires WebGL 2 and hardware acceleration. Preview the static build over HTTP rather than `file://`.
- Keep runtime textures local.

## Required checks

Before finishing code changes, run:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Vitest is development-only and runs in Node. It must not add a production runtime or deployment requirement.

## Generated and maintained files

- Do not edit or reformat files under `components/ui/` or `hooks/use-mobile.ts`; they are generated UI infrastructure.
- `lib/earth-meridian-lengths.json` is generated data. Regenerate it only with `scripts/calculate_meridian_lengths.py`.
- Do not change `scripts/calculate_meridian_lengths.py`, its data output, public textures, or attribution files as part of the current structural refactor.
- Lint custom top-level components, project components, tests, application code, and configuration while excluding generated UI infrastructure.

## Public engine API

- Preserve the positional `createSolarSystem(host, onSelect, onLandmarkSelect, onError, onReady, onObserverFreeLook)` signature.
- Preserve the returned methods: `focus`, `setEarthObserver`, `zoomEarthObserver`, `setOptions`, `setDate`, `getDate`, `getMoonPhase`, `getEclipseState`, `reset`, and `dispose`.
- Preserve the WebMCP tool name, schema, annotations, result shape, selection behavior, and abort cleanup.

## Engine guardrails

- Preserve frame order: elapsed-time clamp and time advance, body transforms and lunar shadow, observer or normal camera, orbit visibility and controls, glow facing, render, readiness callback, then DOM overlays.
- Keep reusable vectors and objects outside the animation callback.
- Preserve J2000 conversion, Kepler iteration count, scene-scale formulas, and orbital rotation order: periapsis, inclination, ascending node.
- Keep calendar eclipse matching, scene eclipse alerts, lunar surface shadow, and observer visuals separate because their thresholds have distinct meanings.
- Calendar event day matching uses local calendar dates; do not change it to UTC.
- Preserve camera near plane, preferred distance, closer-camera behavior, transition threshold, mobile overview offset, and selected-body following.
- User camera input cancels active transitions. Observer dragging switches to free look once for each transition.
- Remove every listener with the same target and function reference used to add it. Stop animation before disposing resources, controls, listeners, renderer, or DOM nodes.

## Architecture

- `app/page.tsx`: React composition, UI state, engine lifecycle, polling, and WebMCP adapter.
- `app/globals.css`: application and responsive styling.
- `components/solar-system/`: application-specific explorer panels and controls.
- `components/simulation-time-picker.tsx`: date/time calendar UI.
- `components/eclipse-observer-panel.tsx`: Earth sky observer controls.
- `components/ui/`: generated UI primitives. Treat these files as generated and do not edit or reformat them.
- `lib/solar-data.ts`: static celestial-body catalog and body type helpers.
- `lib/astronomy/`: date conversion, event calculations, lunar state, and observer calculations.
- `lib/formatters.ts`: shared body fact formatting.
- `lib/solar-system.ts`: sole public engine facade, lifecycle, frame sequencing, and cleanup.
- `lib/solar-system/types.ts`: public and shared engine types.
- `lib/solar-system/orbit-math.ts`: deterministic scene scale and orbital calculations.
- `lib/solar-system/resources.ts`: GPU resource registration and disposal.
- `lib/solar-system/earth-overlays.ts`: Earth grid, landmarks, and circumference readings.
- `lib/solar-system/celestial-mapper.ts`: astronomy-engine coordinates mapped into scene coordinates.
- `lib/solar-system/body-scene.ts`: body meshes, materials, orbit lines, shaders, labels, and per-frame transforms.
- `lib/solar-system/camera-controller.ts`: normal focus transitions and selected-body following.
- `lib/solar-system/earth-observer-view.ts`: observer camera, horizon, compass, sky markers, and eclipse visuals.
- `lib/solar-system/input-controller.ts`: pointer, wheel, raycast, and context-loss handling.
- `lib/explorer-tool.ts`: optional WebMCP registration.
- `scripts/calculate_meridian_lengths.py`: offline ETOPO/WGS84 meridian-data generator.
- `public/`: local textures and static assets.
- `tests/`: deterministic characterization and unit tests.

## Commands

```sh
npm install
npm run dev -- --port 3000
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run preview
```

`npm run preview` serves the static files from `dist/client/`. Vitest runs in Node and is development-only; it does not add a production runtime or deployment requirement.

Lint application code, custom components, tests, and configuration. Do not add generated files under `components/ui/` or `hooks/use-mobile.ts` to lint-driven cleanup work.
