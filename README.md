# Selene's space

A local, interactive WebGL solar system built with Three.js, React, TypeScript, and Vinext.

The project runs locally as a browser-side WebGL app. Keep new features browser-side unless a server-backed architecture is explicitly requested.

## Run locally

```sh
npm install
npm run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000). Requires Node.js 22.13+ and a browser with WebGL 2 / hardware acceleration enabled. This is the development address for future work;

## Static build and preview

```sh
npm run build
npm run preview
```

The publishable site is **`dist/client/`**, containing HTML, JavaScript, CSS, and local textures. `npm start` also previews these static files. Serve the directory over HTTP; opening `index.html` directly with `file://` is not supported.

Vinext may produce `dist/server/` as an intermediate for prerendering. It is not part of the static site and must not be uploaded. No Worker, database, or server runtime is required for the exported site.

The build and preview commands run locally; neither publishes the site.

## Explore

- Drag to orbit the camera; scroll or pinch to zoom.
- Select the Sun, a planet, or the Moon in the object list or in the scene to follow it.
- Select Earth for a close view of Earth and its orbiting Moon.
- Pause, adjust simulated days per second, toggle labels and orbit paths, or reset the simulation.

This is an illustrative model: body sizes and orbital distances are compressed independently in the default view. Paths use eccentricity, orbital inclination, and relative period; orbital positions are simplified, with exact astronomy-engine positions used for selected Earth-observer views. Axial rotation is stylized except for the tidally locked Moon. It is not a full ephemeris or gravitational simulation.

## Project structure

- `app/page.tsx`: explorer composition, React state, engine lifecycle, and WebMCP adapter
- `components/solar-system/`: object browser, body details, and simulation controls
- `components/simulation-time-picker.tsx`: calendar and time picker
- `components/eclipse-observer-panel.tsx`: Earth observer controls
- `lib/solar-system.ts`: public Three.js engine facade, lifecycle, frame sequencing, and cleanup
- `lib/solar-system/`: orbit math, body scene, camera and observer controllers, input binding, overlays, and resource ownership
- `lib/astronomy/`: date conversion, event calculations, Moon state, and observer calculations
- `lib/solar-data.ts`: body definitions and catalog helpers
- `lib/formatters.ts`: mass and distance formatting
- `tests/`: deterministic astronomy, camera, catalog, and WebMCP characterization tests
- `app/globals.css`: responsive interface

## Checks

Vitest runs in Node as a development-only dependency; it adds no production runtime or deployment requirement.

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Lint covers application code, custom components, tests, and configuration; generated UI primitives are retained unchanged.

Browsers supporting the proposed WebMCP API can also start a body focus through `start_focusing_solar_body`. This optional integration was not browser-verified because no supported browser context was available.

Surface textures are bundled locally so the app does not require remote assets at runtime. See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) for their sources, licenses, and coverage limitations.
