# Moonwalk

A local, interactive WebGL solar system built with Three.js, React, TypeScript, and Vinext.

The project is intentionally configured for static hosting. Keep new features browser-side unless a server-backed architecture is explicitly requested.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by the server. Requires Node.js 22.13+ and a browser with WebGL 2 / hardware acceleration enabled.

## Static build and preview

```sh
npm run build
npm run preview
```

The publishable site is **`dist/client/`**, containing HTML, JavaScript, CSS, and local textures. `npm start` also previews these static files. Serve the directory over HTTP; opening `index.html` directly with `file://` is not supported.

Vinext may produce `dist/server/` as an intermediate for prerendering. It is not part of the static site and must not be uploaded. No Worker, database, or server runtime is required for the exported site.

For a future Cloudflare Pages deployment, use build command `npm run build` and output directory `dist/client` (Node.js 22.13 or newer). Alternatively, upload only `dist/client` as a prebuilt site. No deployment is performed by the build or preview commands.

## Explore

- Drag to orbit the camera; scroll or pinch to zoom.
- Select the Sun, a planet, or the Moon in the object list or in the scene to follow it.
- Select Earth for a close view of Earth and its orbiting Moon.
- Pause, adjust simulated days per second, toggle labels and orbit paths, or reset the simulation.

This is an illustrative model: body sizes and orbital distances are compressed independently, orbits are circular and coplanar, and initial positions are arbitrary. Orbital periods are approximate relative Earth-day periods. Axial rotation is stylized except for the tidally locked Moon. It is not an ephemeris or a gravitational simulation.

## Project structure

- `app/page.tsx`: explorer interface and state
- `lib/solar-system.ts`: renderer, scene, animation, camera, and cleanup
- `lib/solar-data.ts`: body definitions and orbital periods
- `app/globals.css`: responsive interface

## Checks

```sh
npx tsc --noEmit
npm run lint
npm run build
```

Lint covers application code and build configuration; generated UI primitives are retained unchanged.

Browsers supporting the proposed WebMCP API can also start a body focus through `start_focusing_solar_body`. This optional integration was not browser-verified because no supported browser context was available.

Surface textures are bundled locally from the [Three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets): [Earth](https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg) and [Moon](https://threejs.org/examples/textures/planets/moon_1024.jpg). Three.js is distributed under the [MIT license](https://github.com/mrdoob/three.js/blob/dev/LICENSE). Gas-giant bands and the Sun glow use shaders. The app does not require remote assets at runtime.
