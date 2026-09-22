# Selene's Space agent guide

## Project constraints

- Use Node.js 22.13 or newer.
- Keep the deployed application static and browser-side. `npm run build` must produce the publishable site in `dist/client/`; do not introduce server routes, Workers, databases, or remote runtime assets.
- Preserve Vinext static export through `next.config.ts`; `dist/server/` may be used during prerendering but is not deployed.
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

## Active refactor destination

The structural migration described in `migration.md` is the active destination. This map describes intended responsibilities; entries marked as future extraction destinations are not claims that those modules already exist.

- `lib/astronomy/time.ts`, `events.ts`, `observer.ts`, and `moon.ts`: extracted pure date, event, observer, and lunar calculations. These modules are present.
- `lib/solar-system/types.ts`, `orbit-math.ts`, `camera-controller.ts`, `resources.ts`, `earth-overlays.ts`, and `celestial-mapper.ts`: shared engine types, deterministic math, camera planning, GPU resource ownership, Earth overlays, and astronomy-to-scene mapping. These modules are present; camera transition ownership and view orchestration remain in the facade.
- Future engine extraction destinations: `body-scene.ts`, `earth-observer-view.ts`, and `input-controller.ts`.
- `lib/solar-system.ts`: retain as the sole public engine facade and lifecycle/frame orchestrator.
- `components/solar-system/`: application-specific object browser, body details, and simulation controls. These components are present.
- `lib/formatters.ts`: shared body fact formatting.
- `tests/`: deterministic characterization tests for astronomy, orbital and focus calculations, the body catalog, and WebMCP behavior.
