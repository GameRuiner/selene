import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Body as AstronomyBody } from 'astronomy-engine';
import { bodies, type BodyName, type SolarBody, isSatellite } from './solar-data';
import { dateToSimulationDays, simulationDaysToDate } from './astronomy/time';
import { lunarCoordinates as calculateLunarCoordinates, moonPhaseFromAngle, classifySceneEclipse, lunarEclipseStrength } from './astronomy/moon';
import { bodyRadius as calculateBodyRadius, orbitRadius as calculateOrbitRadius, orbitalPosition as calculateOrbitalPosition } from './solar-system/orbit-math';
import { calculateFocusCameraPlan } from './solar-system/camera-controller';
import { astronomyBodyForTarget, SKY_TARGETS, type SkyTarget } from './astronomy/observer';
import { createResourceRegistry, loadSrgbTexture } from './solar-system/resources';
import { createEarthGrid, createEarthLandmarks, readEarthGridAt } from './solar-system/earth-overlays';
import { createCelestialMapper } from './solar-system/celestial-mapper';

import type { SolarSystem, Landmark, LandmarkSelection, EarthObserver, SolarSystemOptions } from './solar-system/types';
export type { SolarSystem, Landmark, LandmarkSelection, EarthObserver, SolarSystemOptions } from './solar-system/types';
type Options = SolarSystemOptions;
const sceneAU = 14;
const surfaceTexturePaths: Partial<Record<BodyName, string>> = {
  Sun: '/textures/sun.jpg',
  Mercury: '/textures/mercury.jpg',
  Venus: '/textures/venus.jpg',
  Earth: '/earth.jpg',
  Moon: '/moon.jpg',
  Mars: '/textures/mars.jpg',
  Jupiter: '/textures/jupiter.jpg',
  Saturn: '/textures/saturn.jpg',
  Uranus: '/textures/uranus.jpg',
  Neptune: '/textures/neptune.jpg',
  Io: '/textures/io.jpg',
  Europa: '/textures/europa.jpg',
  Ganymede: '/textures/ganymede.jpg',
  Callisto: '/textures/callisto.jpg',
};
const missionMosaicBodies = new Set<BodyName>(['Io', 'Europa', 'Ganymede', 'Callisto']);
export function createSolarSystem(host: HTMLDivElement, onSelect: (name: BodyName | null) => void, onLandmarkSelect: (selection: LandmarkSelection) => void, onError: (message: string) => void, onReady: () => void, onObserverFreeLook: () => void): SolarSystem {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Three-dimensional solar system. Use the object list to select a world, or drag and scroll on this view.');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2500);
  const controls = new OrbitControls(camera, renderer.domElement);
  // Keep page scrolling on phones until the user enters the dedicated sky-look mode.
  const mobileMedia = window.matchMedia('(max-width: 700px)');
  let observerInputActive = false;
  const updateTouchAction = () => { renderer.domElement.style.touchAction = mobileMedia.matches && !observerInputActive ? 'pan-y' : 'none'; };
  updateTouchAction();
  mobileMedia.addEventListener('change', updateTouchAction);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1;
  controls.maxDistance = 260;
  controls.enablePan = false;
  const home = new THREE.Vector3(0, 64, 89);
  camera.position.copy(home);
  scene.add(new THREE.AmbientLight(0xb4c9e8, 0.32));
  scene.add(new THREE.PointLight(0xfff1d9, 3.2, 0, 0));
  const resources = createResourceRegistry();
  const geometry = new THREE.SphereGeometry(1, 64, 40);
  resources.geometry(geometry);
  const paths = new THREE.Group();
  scene.add(paths);
  const horizonGeometry = new THREE.SphereGeometry(1, 96, 48);
  const horizonMaterial = new THREE.ShaderMaterial({
    uniforms: {
      horizonUp: { value: new THREE.Vector3(0, 1, 0) },
      groundColor: { value: new THREE.Color('#30342f') },
      lineColor: { value: new THREE.Color('#89939a') },
    },
    vertexShader: `
      varying vec3 vSkyDirection;
      void main() {
        vSkyDirection = normalize(mat3(modelMatrix) * position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vSkyDirection;
      uniform vec3 horizonUp;
      uniform vec3 groundColor;
      uniform vec3 lineColor;
      void main() {
        float elevation = dot(normalize(vSkyDirection), normalize(horizonUp));
        if (elevation > 0.002) discard;
        float line = 1.0 - smoothstep(0.0, 0.002, abs(elevation));
        vec3 color = mix(groundColor, lineColor, line * 0.65);
        float alpha = elevation <= 0.0 ? 0.98 : line * 0.7;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const horizonLine = new THREE.Mesh(horizonGeometry, horizonMaterial);
  horizonLine.visible = false;
  horizonLine.frustumCulled = false;
  horizonLine.renderOrder = 10;
  scene.add(horizonLine);
  resources.geometry(horizonGeometry);
  resources.material(horizonMaterial);
  const positions = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) {
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const r = 280 + Math.random() * 360;
    positions.set([r * Math.sqrt(1 - z * z) * Math.cos(theta), r * z, r * Math.sqrt(1 - z * z) * Math.sin(theta)], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xb8c7e2, size: 0.55, transparent: true, opacity: 0.65, sizeAttenuation: true, depthWrite: false });
  scene.add(new THREE.Points(starGeometry, starMaterial));
  resources.geometry(starGeometry); resources.material(starMaterial);
  const loader = new THREE.TextureLoader();
  function texture(url: string) {
    return loadSrgbTexture(loader, renderer, resources, url, () => onError('A surface texture could not load. Reload the page to try again.'));
  }
  type OrbitalBody = SolarBody;
  const degrees = Math.PI / 180;
  let realScale = false;
  const orbitRadius = (body: SolarBody) => calculateOrbitRadius(body, realScale);
  const bodyRadius = (body: SolarBody) => calculateBodyRadius(body, realScale);
  const orbitalPosition = (body: SolarBody, meanAnomaly: number, target = new THREE.Vector3()) => calculateOrbitalPosition(body, meanAnomaly, realScale, target);
  function orbit(body: OrbitalBody, parent: THREE.Object3D = paths) {
    const points = Array.from({ length: 256 }, (_, i) => orbitalPosition(body, i / 256 * Math.PI * 2));
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x75829c, transparent: true, opacity: 0.23 });
    const line = new THREE.LineLoop(geom, mat);
    line.userData.orbitBody = body;
    parent.add(line); resources.geometry(geom); resources.material(mat);
    return line;
  }
  const earthLandmarkMeshes: THREE.Mesh[] = [];
  let earthGridLine: THREE.LineSegments | null = null;
  const lunarShadowUniforms = {
    uEarthPosition: { value: new THREE.Vector3() },
    uSunPosition: { value: new THREE.Vector3() },
    uEarthRadius: { value: 1 },
    uSunRadius: { value: 1 },
    uEclipseStrength: { value: 0 },
  };
  const objects = bodies.map((body, index) => {
    const mat = new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.95 });
    const texturePath = surfaceTexturePaths[body.name];
    if (texturePath) {
      mat.map = texture(texturePath);
      if (!missionMosaicBodies.has(body.name)) mat.color.set('white');
    }
    if (body.name === 'Sun') {
      mat.emissive.set('white');
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 1.65;
    }
    if (body.name === 'Moon') {
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, lunarShadowUniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMoonWorldPosition;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoonWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMoonWorldPosition;\nuniform vec3 uEarthPosition;\nuniform vec3 uSunPosition;\nuniform float uEarthRadius;\nuniform float uSunRadius;\nuniform float uEclipseStrength;')
          .replace('#include <opaque_fragment>', `
            vec3 moonToEarth = uEarthPosition - vMoonWorldPosition;
            vec3 moonToSun = uSunPosition - vMoonWorldPosition;
            float earthDistance = length(moonToEarth);
            float sunDistance = length(moonToSun);
            float earthAngularRadius = asin(clamp(uEarthRadius / earthDistance, 0.0, 0.9999));
            float sunAngularRadius = asin(clamp(uSunRadius / sunDistance, 0.0, 0.9999));
            float centerSeparation = acos(clamp(dot(normalize(moonToEarth), normalize(moonToSun)), -1.0, 1.0));
            float fullShadowEdge = max(earthAngularRadius - sunAngularRadius, 0.0);
            float shadowCoverage = (1.0 - smoothstep(fullShadowEdge, earthAngularRadius + sunAngularRadius, centerSeparation)) * uEclipseStrength;
            outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.18, 0.07, 0.045), shadowCoverage * 0.94);
            #include <opaque_fragment>
          `);
      };
      mat.customProgramCacheKey = () => 'moon-earth-shadow-v1';
    }
    if (missionMosaicBodies.has(body.name)) {
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          float mosaicCoverage = smoothstep(0.012, 0.05, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
          diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, mosaicCoverage);
        `);
      };
      mat.customProgramCacheKey = () => `mission-mosaic-${body.name}`;
    }
    resources.material(mat);
    const group = new THREE.Group(); scene.add(group);
    const axialTilt = new THREE.Group(); group.add(axialTilt);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.scale.setScalar(bodyRadius(body));
    if (body.name === 'Earth') axialTilt.rotation.x = -23.44 * degrees;
    else if (body.name === 'Uranus') axialTilt.rotation.z = 1.7;
    mesh.userData.name = body.name; axialTilt.add(mesh);
    if (body.name === 'Earth') {
      earthGridLine = createEarthGrid(resources);
      mesh.add(earthGridLine);
      const landmarks = createEarthLandmarks(resources);
      earthLandmarkMeshes.push(...landmarks.meshes);
      mesh.add(landmarks.group);
    }
    const label = document.createElement('button');
    label.className = 'planet-label'; label.textContent = body.name;
    label.setAttribute('aria-label', `Focus ${body.name}`);
    label.onclick = () => { focus(body.name); onSelect(body.name); onLandmarkSelect(null); };
    host.appendChild(label);
    let ring: THREE.Mesh | null = null;
    if (body.name === 'Saturn') {
      const ringGeom = new THREE.RingGeometry(2.15, 3.5, 128, 6);
      const ringMat = new THREE.MeshStandardMaterial({ color: '#bca67b', side: THREE.DoubleSide, transparent: true, opacity: 0.7, roughness: 1 });
      ring = new THREE.Mesh(ringGeom, ringMat); ring.rotation.x = Math.PI / 2 - 0.4;
      group.add(ring); resources.geometry(ringGeom); resources.material(ringMat);
    }
    // The lunar offset is anchored to the 2000-01-06 18:14 UTC new moon.
    const phase = body.name === 'Moon' ? 0.9573515073 : isSatellite(body) ? body.phaseDegrees * degrees : body.name === 'Earth' ? 357.529 * degrees : index * 2.399 + 0.6;
    return { body, group, mesh, ring, label, phase };
  });
  const objectByName = new Map(objects.map((item) => [item.body.name, item]));
  const orbitLines = objects.flatMap((item) => {
    if (!item.body.distance) return [];
    const parent = isSatellite(item.body) ? objectByName.get(item.body.parent)?.group : paths;
    return [{ body: item.body, line: orbit(item.body, parent) }];
  });
  const earth = objects.find((item) => item.body.name === 'Earth')!;
  const moon = objects.find((item) => item.body.name === 'Moon')!;
  const observerMarkerNames: SkyTarget[] = SKY_TARGETS;
  const markerCanvas = document.createElement('canvas');
  markerCanvas.width = 64;
  markerCanvas.height = 64;
  const markerContext = markerCanvas.getContext('2d');
  if (markerContext) {
    const markerGlow = markerContext.createRadialGradient(32, 32, 2, 32, 32, 31);
    markerGlow.addColorStop(0, '#ffffff');
    markerGlow.addColorStop(0.28, '#ffffff');
    markerGlow.addColorStop(0.52, '#ffffffcc');
    markerGlow.addColorStop(1, '#ffffff00');
    markerContext.fillStyle = markerGlow;
    markerContext.fillRect(0, 0, 64, 64);
  }
  const observerMarkerTexture = new THREE.CanvasTexture(markerCanvas);
  observerMarkerTexture.colorSpace = THREE.SRGBColorSpace;
  resources.texture(observerMarkerTexture);
  const observerMarkerColors: Partial<Record<BodyName, string>> = {
    Sun: '#ffd06d', Moon: '#e4ecff', Mercury: '#c7c1b8', Venus: '#f0c78d', Mars: '#e1805f',
    Jupiter: '#e2c09e', Saturn: '#e8d49c', Uranus: '#9bdbe5', Neptune: '#7fa5ff',
  };
  const observerMarkers = new Map<BodyName, THREE.Sprite>();
  observerMarkerNames.forEach((name) => {
    const markerMaterial = new THREE.SpriteMaterial({
      map: observerMarkerTexture,
      color: observerMarkerColors[name] ?? '#ffffff',
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const marker = new THREE.Sprite(markerMaterial);
    marker.visible = false;
    marker.renderOrder = 20;
    scene.add(marker);
    resources.material(markerMaterial);
    observerMarkers.set(name, marker);
  });
  const eclipseCoronaCanvas = document.createElement('canvas');
  eclipseCoronaCanvas.width = 256;
  eclipseCoronaCanvas.height = 256;
  const eclipseCoronaContext = eclipseCoronaCanvas.getContext('2d');
  if (eclipseCoronaContext) {
    const coronaGlow = eclipseCoronaContext.createRadialGradient(128, 128, 24, 128, 128, 124);
    coronaGlow.addColorStop(0, '#ffffff00');
    coronaGlow.addColorStop(0.22, '#ffffff00');
    coronaGlow.addColorStop(0.28, '#ffffffee');
    coronaGlow.addColorStop(0.38, '#ffffff88');
    coronaGlow.addColorStop(0.68, '#ffffff22');
    coronaGlow.addColorStop(1, '#ffffff00');
    eclipseCoronaContext.fillStyle = coronaGlow;
    eclipseCoronaContext.fillRect(0, 0, 256, 256);
    eclipseCoronaContext.save();
    eclipseCoronaContext.translate(128, 128);
    for (let ray = 0; ray < 40; ray++) {
      const angle = ray / 40 * Math.PI * 2;
      const inner = 42 + (ray % 4) * 2;
      const outer = 82 + (ray * 29 % 42);
      const width = ray % 5 === 0 ? 2.2 : 0.85;
      const rayGradient = eclipseCoronaContext.createLinearGradient(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
      rayGradient.addColorStop(0, '#ffffffa8');
      rayGradient.addColorStop(1, '#ffffff00');
      eclipseCoronaContext.strokeStyle = rayGradient;
      eclipseCoronaContext.lineWidth = width;
      eclipseCoronaContext.beginPath();
      eclipseCoronaContext.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      eclipseCoronaContext.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      eclipseCoronaContext.stroke();
    }
    eclipseCoronaContext.restore();
  }
  const eclipseCoronaTexture = new THREE.CanvasTexture(eclipseCoronaCanvas);
  eclipseCoronaTexture.colorSpace = THREE.SRGBColorSpace;
  resources.texture(eclipseCoronaTexture);
  const eclipseDiscCanvas = document.createElement('canvas');
  eclipseDiscCanvas.width = 128;
  eclipseDiscCanvas.height = 128;
  const eclipseDiscContext = eclipseDiscCanvas.getContext('2d');
  if (eclipseDiscContext) {
    const discEdge = eclipseDiscContext.createRadialGradient(64, 64, 48, 64, 64, 62);
    discEdge.addColorStop(0, '#ffffff');
    discEdge.addColorStop(0.82, '#ffffff');
    discEdge.addColorStop(0.96, '#ffffffdd');
    discEdge.addColorStop(1, '#ffffff00');
    eclipseDiscContext.fillStyle = discEdge;
    eclipseDiscContext.fillRect(0, 0, 128, 128);
  }
  const eclipseDiscTexture = new THREE.CanvasTexture(eclipseDiscCanvas);
  eclipseDiscTexture.colorSpace = THREE.SRGBColorSpace;
  resources.texture(eclipseDiscTexture);
  const eclipseCoronaMaterial = new THREE.SpriteMaterial({
    map: eclipseCoronaTexture,
    color: '#fff0ba',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const eclipseCorona = new THREE.Sprite(eclipseCoronaMaterial);
  eclipseCorona.visible = false;
  eclipseCorona.renderOrder = 18;
  scene.add(eclipseCorona);
  resources.material(eclipseCoronaMaterial);
  const eclipseDiscMaterial = new THREE.SpriteMaterial({
    map: eclipseDiscTexture,
    color: '#030408',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const eclipseDisc = new THREE.Sprite(eclipseDiscMaterial);
  eclipseDisc.visible = false;
  eclipseDisc.renderOrder = 22;
  scene.add(eclipseDisc);
  resources.material(eclipseDiscMaterial);
  const compassPoints = [
    { label: 'N', azimuth: 0 }, { label: 'NE', azimuth: 45 }, { label: 'E', azimuth: 90 }, { label: 'SE', azimuth: 135 },
    { label: 'S', azimuth: 180 }, { label: 'SW', azimuth: 225 }, { label: 'W', azimuth: 270 }, { label: 'NW', azimuth: 315 },
  ].map(({ label, azimuth }) => {
    const element = document.createElement('span');
    element.className = 'compass-label';
    element.textContent = label;
    element.hidden = true;
    host.appendChild(element);
    return { element, azimuth: azimuth * degrees };
  });
  let lunarCoordinateDay = Number.NaN;
  let cachedLunarPhaseAngle = 0;
  let cachedLunarLatitude = 0;
  const lunarCoordinates = () => {
    if (days !== lunarCoordinateDay) {
      const coordinates = calculateLunarCoordinates(simulationDaysToDate(days));
      cachedLunarPhaseAngle = coordinates.phaseAngle;
      cachedLunarLatitude = coordinates.latitude;
      lunarCoordinateDay = days;
    }
    return { phaseAngle: cachedLunarPhaseAngle, latitude: cachedLunarLatitude };
  };
  const moonPhase = () => {
    return moonPhaseFromAngle(lunarCoordinates().phaseAngle);
  };
  const eclipseState = () => {
    return classifySceneEclipse(earth.group.position, moon.group.position);
  };
  const sunGlowMat = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#ff9c38') } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform vec3 tint; void main(){float d=length(vUv-0.5)*2.0;float a=pow(max(0.0,1.0-d),3.5)*0.8;gl_FragColor=vec4(tint,a);}',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glowGeometry = new THREE.PlaneGeometry(23, 23);
  const glow = new THREE.Mesh(glowGeometry, sunGlowMat);
  scene.add(glow); resources.geometry(glowGeometry); resources.material(sunGlowMat);
  let options: Options = { paused: false, speed: 12, orbits: true, labels: true, realScale: false };
  let days = dateToSimulationDays(new Date());
  let selected: BodyName | null = null;
  let earthObserver: EarthObserver | null = null;
  let observerTracking = true;
  let observerAzimuth = 0;
  let observerAltitude = 0;
  let observerFov = 55;
  let observerDragging = false;
  let transition = false;
  let transitionStartedAt = 0;
  let transitionThreshold = 0.03;
  const offset = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const destination = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const observerNorth = new THREE.Vector3();
  const observerEast = new THREE.Vector3();
  const observerNormal = new THREE.Vector3();
  const observerUp = new THREE.Vector3();
  const observerViewDirection = new THREE.Vector3();
  const observerLookDirection = new THREE.Vector3();
  const observerMarkerDirection = new THREE.Vector3();
  const observerSunDirection = new THREE.Vector3();
  const observerMoonDirection = new THREE.Vector3();
  const compassDirection = new THREE.Vector3();
  const compassPoint = new THREE.Vector3();
  const compassProjected = new THREE.Vector3();
  const sceneNorth = new THREE.Vector3(0, Math.cos(23.44 * degrees), -Math.sin(23.44 * degrees));
  let width = 1, height = 1;
  const celestialMapper = createCelestialMapper({ earthPosition: earth.group.position, sceneNorth, origin, sceneAU });
  const exactMoonPosition = (target: THREE.Vector3) => celestialMapper.moonPosition(simulationDaysToDate(days), target);
  const exactBodyPosition = (body: AstronomyBody, target: THREE.Vector3) => celestialMapper.bodyPosition(body, simulationDaysToDate(days), target);
  function refreshOrbitLines() {
    orbitLines.forEach(({ body, line }) => {
      const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 256; i++) {
        const point = orbitalPosition(body, i / 256 * Math.PI * 2);
        attribute.setXYZ(i, point.x, point.y, point.z);
      }
      attribute.needsUpdate = true; line.geometry.computeBoundingSphere();
    });
  }
  function focus(name: BodyName | null) {
    if (earthObserver) {
      earthObserver = null;
      observerInputActive = false;
      updateTouchAction();
      controls.enabled = true;
      camera.fov = 42;
      camera.up.set(0, 1, 0);
      horizonLine.visible = false;
      if (earthGridLine) earthGridLine.visible = true;
      earthLandmarkMeshes.forEach((marker) => { marker.visible = true; });
      observerMarkers.forEach((marker) => { marker.visible = false; });
      eclipseCorona.visible = false;
      eclipseDisc.visible = false;
    }
    selected = name;
    const item = objects.find((obj) => obj.body.name === name);
    const radius = item ? bodyRadius(item.body) : 0;
    const plan = calculateFocusCameraPlan({ selected: Boolean(item), realScale, radius, displayRadius: item?.body.radius ?? 0, currentDistance: camera.position.distanceTo(controls.target), homeVector: [home.x, home.y, home.z], mobile: width < 700 });
    camera.near = plan.near;
    camera.updateProjectionMatrix();
    transitionThreshold = plan.transitionThreshold;
    controls.minDistance = plan.minDistance;
    offset.set(...plan.offset);
    transition = true;
    transitionStartedAt = performance.now();
    lastTarget.copy(item ? item.group.position : origin);
  }
  function setEarthObserver(next: EarthObserver | null) {
    const wasObserving = earthObserver !== null;
    if (next && !wasObserving) observerFov = 55;
    earthObserver = next;
    observerInputActive = Boolean(next);
    updateTouchAction();
    observerTracking = Boolean(next);
    observerDragging = false;
    horizonLine.visible = Boolean(next);
    if (earthGridLine) earthGridLine.visible = !next;
    earthLandmarkMeshes.forEach((marker) => { marker.visible = !next; });
    if (!next) {
      observerMarkers.forEach((marker) => { marker.visible = false; });
      eclipseCorona.visible = false;
      eclipseDisc.visible = false;
    }
    transition = false;
    controls.enabled = !next;
    camera.fov = next ? observerFov : 42;
    if (!next) camera.up.set(0, 1, 0);
    if (next) {
      selected = 'Earth';
      camera.near = Math.max(bodyRadius(earth.body) * 0.0005, 0.000000001);
    } else if (wasObserving) {
      focus('Earth');
      return;
    }
    camera.updateProjectionMatrix();
  }
  function zoomEarthObserver(delta: number) {
    if (!earthObserver) return;
    observerFov = THREE.MathUtils.clamp(observerFov + delta, 8, 90);
    camera.fov = observerFov;
    camera.updateProjectionMatrix();
  }
  const stopTransition = () => { transition = false; };
  controls.addEventListener('start', stopTransition);
  function resize() {
    width = host.clientWidth; height = host.clientHeight;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  if (width < 700) camera.position.multiplyScalar(1.4);
  const pointer = new THREE.Vector2();
  const start = new THREE.Vector2();
  const observerPointerLast = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.035 };
  const gridTooltip = document.createElement('div');
  gridTooltip.className = 'earth-grid-tooltip';
  gridTooltip.hidden = true;
  host.appendChild(gridTooltip);
  const setPointerFromEvent = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return rect;
  };
  const pointerDown = (event: PointerEvent) => {
    start.set(event.clientX, event.clientY);
    if (!earthObserver) return;
    observerDragging = true;
    observerPointerLast.set(event.clientX, event.clientY);
    renderer.domElement.setPointerCapture?.(event.pointerId);
    gridTooltip.hidden = true;
  };
  const pointerMove = (event: PointerEvent) => {
    if (earthObserver && observerDragging) {
      const deltaX = event.clientX - observerPointerLast.x;
      const deltaY = event.clientY - observerPointerLast.y;
      observerPointerLast.set(event.clientX, event.clientY);
      observerAzimuth -= deltaX * 0.0012;
      observerAltitude = THREE.MathUtils.clamp(observerAltitude + deltaY * 0.001, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      if (observerTracking) {
        observerTracking = false;
        onObserverFreeLook();
      }
      gridTooltip.hidden = true;
      return;
    }
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const rect = setPointerFromEvent(event);
    const hit = earthGridLine ? raycaster.intersectObject(earthGridLine, false)[0] : undefined;
    if (!hit) { gridTooltip.hidden = true; return; }
    const local = earth.mesh.worldToLocal(hit.point.clone()).normalize();
    const cameraDirection = earth.mesh.worldToLocal(camera.position.clone()).sub(local).normalize();
    if (local.dot(cameraDirection) <= 0) { gridTooltip.hidden = true; return; }
    const reading = readEarthGridAt(local);
    gridTooltip.textContent = reading.label;
    const measurement = document.createElement('span');
    measurement.className = reading.className;
    measurement.textContent = reading.measurement;
    gridTooltip.appendChild(measurement);
    gridTooltip.style.left = `${event.clientX - rect.left + 14}px`;
    gridTooltip.style.top = `${event.clientY - rect.top + 14}px`;
    gridTooltip.hidden = false;
  };
  const pointerLeave = () => { observerDragging = false; gridTooltip.hidden = true; };
  const pointerUp = (event: PointerEvent) => {
    if (earthObserver) {
      observerDragging = false;
      if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    setPointerFromEvent(event);
    // Only select the body mesh. Earth has grid and landmark children whose names
    // are not BodyName values and previously sent focus back to the overview.
    const hit = raycaster.intersectObjects(objects.map((obj) => obj.mesh), false)[0];
    const landmarkHit = raycaster.intersectObjects(earthLandmarkMeshes, false)[0];
    const landmarkLocal = landmarkHit ? earth.mesh.worldToLocal(landmarkHit.point.clone()).normalize() : null;
    const landmarkCameraDirection = landmarkLocal ? earth.mesh.worldToLocal(camera.position.clone()).sub(landmarkLocal).normalize() : null;
    if (landmarkHit && landmarkLocal && landmarkCameraDirection && landmarkLocal.dot(landmarkCameraDirection) > 0) {
      const rect = renderer.domElement.getBoundingClientRect();
      const popupWidth = Math.min(280, rect.width - 24);
      const x = Math.max(12, Math.min(event.clientX - rect.left + 14, rect.width - popupWidth - 12));
      const y = Math.max(12, Math.min(event.clientY - rect.top + 14, rect.height - 210));
      selected = 'Earth';
      onSelect('Earth');
      onLandmarkSelect({ landmark: landmarkHit.object.userData.landmark as Landmark, x, y });
      return;
    }
    onLandmarkSelect(null);
    if (hit) { const name = hit.object.userData.name as BodyName; focus(name); onSelect(name); }
  };
  const pointerCancel = (event: PointerEvent) => {
    observerDragging = false;
    if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture?.(event.pointerId);
  };
  const wheel = (event: WheelEvent) => {
    if (!earthObserver) return;
    event.preventDefault();
    zoomEarthObserver(Math.sign(event.deltaY) * 4);
  };
  const contextLost = (event: Event) => { event.preventDefault(); options.paused = true; onError('The graphics connection was interrupted. Reload the page to restart the model.'); };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerleave', pointerLeave);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', pointerCancel);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const updateEarthObserverCamera = () => {
    if (!earthObserver) return;
    const date = simulationDaysToDate(days);
    celestialMapper.observerPosition(date, earthObserver.latitude, earthObserver.longitude, observerNormal);
    observerNorth.copy(sceneNorth).addScaledVector(observerNormal, -sceneNorth.dot(observerNormal));
    if (observerNorth.lengthSq() < 0.000001) {
      const eastDirection = celestialMapper.sceneEastDirection();
      observerNorth.copy(eastDirection).addScaledVector(observerNormal, -eastDirection.dot(observerNormal));
    }
    observerNorth.normalize();
    observerEast.crossVectors(observerNorth, observerNormal).normalize();

    const earthSurfaceRadius = bodyRadius(earth.body);
    const cameraRadius = earthSurfaceRadius * 1.002;
    camera.position.copy(earth.group.position).addScaledVector(observerNormal, cameraRadius);
    if (observerTracking) {
      controls.target.copy(objectByName.get(earthObserver.target)?.group.position ?? origin);
      observerViewDirection.copy(controls.target).sub(camera.position).normalize();
      observerAltitude = Math.asin(THREE.MathUtils.clamp(observerViewDirection.dot(observerNormal), -1, 1));
      observerAzimuth = Math.atan2(observerViewDirection.dot(observerEast), observerViewDirection.dot(observerNorth));
    }
    const altitudeCosine = Math.cos(observerAltitude);
    observerLookDirection.copy(observerNorth).multiplyScalar(altitudeCosine * Math.cos(observerAzimuth));
    observerLookDirection.addScaledVector(observerEast, altitudeCosine * Math.sin(observerAzimuth));
    observerLookDirection.addScaledVector(observerNormal, Math.sin(observerAltitude)).normalize();
    controls.target.copy(camera.position).add(observerLookDirection);
    observerUp.copy(observerNormal);
    if (Math.abs(observerUp.dot(observerLookDirection)) > 0.98) {
      observerUp.copy(observerNorth).addScaledVector(observerLookDirection, -observerNorth.dot(observerLookDirection));
    }
    camera.up.copy(observerUp.normalize());
    camera.lookAt(controls.target);
    horizonLine.position.copy(camera.position);
    horizonLine.scale.setScalar(40);
    horizonMaterial.uniforms.horizonUp.value.copy(observerNormal);

    observerMarkers.forEach((marker, name) => {
      const bodyPosition = objectByName.get(name)?.group.position;
      if (!bodyPosition) { marker.visible = false; return; }
      observerMarkerDirection.copy(bodyPosition).sub(camera.position).normalize();
      marker.position.copy(camera.position).addScaledVector(observerMarkerDirection, 10);
      const markerPixelScale = 20 * Math.tan(camera.fov * degrees / 2) / Math.max(height, 1);
      marker.scale.setScalar(markerPixelScale * (name === 'Sun' || name === 'Moon' ? 14 : 10));
      const aboveHorizon = observerMarkerDirection.dot(observerNormal) > 0;
      marker.visible = true;
      marker.userData.aboveHorizon = aboveHorizon;
      marker.userData.eclipseHidden = false;
      const markerMaterial = marker.material as THREE.SpriteMaterial;
      markerMaterial.color.set(observerMarkerColors[name] ?? '#ffffff');
      markerMaterial.opacity = aboveHorizon ? 1 : 0.42;
    });

    const sunMarker = observerMarkers.get('Sun');
    const moonMarker = observerMarkers.get('Moon');
    eclipseCorona.visible = false;
    eclipseDisc.visible = false;
    if (sunMarker?.visible && moonMarker?.visible) {
      observerSunDirection.copy(sunMarker.position).sub(camera.position).normalize();
      observerMoonDirection.copy(moonMarker.position).sub(camera.position).normalize();
      const solarSeparation = observerSunDirection.angleTo(observerMoonDirection) / degrees;
      const solarStrength = 1 - THREE.MathUtils.smoothstep(solarSeparation, 0.16, 1.15);
      const moonAboveHorizon = moonMarker.userData.aboveHorizon !== false;
      const markerPixelScale = 20 * Math.tan(camera.fov * degrees / 2) / Math.max(height, 1);
      if (solarStrength > 0.015) {
        eclipseCorona.position.copy(sunMarker.position);
        eclipseCorona.scale.setScalar(markerPixelScale * (135 + solarStrength * 85));
        eclipseCoronaMaterial.color.set('#fff0ba');
        eclipseCoronaMaterial.opacity = (0.45 + solarStrength * 0.55) * (moonAboveHorizon ? 1 : 0.35);
        eclipseCorona.visible = true;
        eclipseDisc.position.copy(moonMarker.position);
        eclipseDisc.scale.setScalar(markerPixelScale * 22);
        eclipseDiscMaterial.color.set('#030408');
        eclipseDiscMaterial.opacity = (0.68 + solarStrength * 0.32) * (moonAboveHorizon ? 1 : 0.5);
        eclipseDisc.visible = true;
        (moonMarker.material as THREE.SpriteMaterial).opacity = 0;
        moonMarker.userData.eclipseHidden = true;
      } else {
        const lunarStrength = lunarShadowUniforms.uEclipseStrength.value;
        if (lunarStrength > 0.015) {
          eclipseCorona.position.copy(moonMarker.position);
          eclipseCorona.scale.setScalar(markerPixelScale * (90 + lunarStrength * 60));
          eclipseCoronaMaterial.color.set('#c94424');
          eclipseCoronaMaterial.opacity = lunarStrength * (moonAboveHorizon ? 0.72 : 0.25);
          eclipseCorona.visible = true;
          eclipseDisc.position.copy(moonMarker.position);
          eclipseDisc.scale.setScalar(markerPixelScale * 20);
          eclipseDiscMaterial.color.set('#b94c32');
          eclipseDiscMaterial.opacity = (0.55 + lunarStrength * 0.4) * (moonAboveHorizon ? 1 : 0.42);
          eclipseDisc.visible = true;
          (moonMarker.material as THREE.SpriteMaterial).color.set('#ff9a72');
        }
      }
    }
  };
  let previous = performance.now();
  let firstFrame = true;
  renderer.setAnimationLoop((now) => {
    const elapsed = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden && !options.paused) days += elapsed * options.speed;
    const selectedBody = selected ? objectByName.get(selected)?.body : undefined;
    const selectedSystem = selectedBody && isSatellite(selectedBody) ? selectedBody.parent : selected;
    objects.forEach(({ body, group, mesh, ring, phase, label }) => {
      const angle = body.period
        ? 'orbitalEpochJulianDay' in body
          ? (days + 2451545 - body.orbitalEpochJulianDay) / body.period * Math.PI * 2 + body.meanAnomalyDegrees * degrees
          : days / body.period * Math.PI * 2 + phase
        : 0;
      if (body.name === 'Moon') {
        const { phaseAngle, latitude } = lunarCoordinates();
        if (realScale) {
          exactMoonPosition(group.position);
        } else {
          const radius = orbitRadius(body);
          group.position.copy(earth.group.position).multiplyScalar(-1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -phaseAngle);
          group.position.multiplyScalar(Math.cos(latitude));
          group.position.y = Math.sin(latitude);
          group.position.multiplyScalar(radius).add(earth.group.position);
        }
        mesh.rotation.y = -phaseAngle;
      } else {
        if (body.distance) {
          if (earthObserver && SKY_TARGETS.includes(body.name as SkyTarget) && !isSatellite(body)) exactBodyPosition(astronomyBodyForTarget(body.name as SkyTarget), group.position);
          else group.position.copy(orbitalPosition(body, angle));
          if (isSatellite(body)) {
            const parent = objectByName.get(body.parent);
            if (parent) group.position.add(parent.group.position);
          }
        }
        mesh.rotation.y = days / body.rotationPeriod * Math.PI * 2;
      }
      mesh.scale.setScalar(bodyRadius(body));
      mesh.visible = !earthObserver;
      ring?.scale.setScalar(bodyRadius(body) / body.radius);
      if (ring) ring.visible = !earthObserver;
      label.classList.toggle('selected', earthObserver ? earthObserver.target === body.name : selected === body.name);
    });
    glow.scale.setScalar(bodyRadius(objects[0].body) / objects[0].body.radius);
    glow.visible = !earthObserver;
    lunarShadowUniforms.uEarthPosition.value.copy(earth.group.position);
    lunarShadowUniforms.uEarthRadius.value = bodyRadius(earth.body);
    lunarShadowUniforms.uSunRadius.value = bodyRadius(objects[0].body);
    const { phaseAngle, latitude } = lunarCoordinates();
    // Physical angular limits as seen from the Moon: the inner value covers a
    // total eclipse of the lunar disc; the outer value includes the penumbra.
    lunarShadowUniforms.uEclipseStrength.value = lunarEclipseStrength({ phaseAngle, latitude });
    const target = objects.find((item) => item.body.name === selected)?.group.position;
    desired.copy(target ?? origin);
    if (earthObserver) {
      updateEarthObserverCamera();
    } else if (transition) {
      const factor = 1 - Math.exp(-elapsed * 5);
      controls.target.lerp(desired, factor);
      destination.copy(desired).add(offset);
      camera.position.lerp(destination, factor);
      if (camera.position.distanceTo(destination) < transitionThreshold || now - transitionStartedAt > 1_500) {
        controls.target.copy(desired);
        camera.position.copy(destination);
        transition = false;
      }
    } else if (target) {
      camera.position.add(delta.copy(desired).sub(lastTarget)); controls.target.copy(desired);
    }
    lastTarget.copy(desired);
    paths.visible = options.orbits && !earthObserver;
    orbitLines.forEach(({ body, line }) => {
      line.visible = options.orbits && !earthObserver && (!isSatellite(body) || selectedSystem === body.parent);
    });
    if (!earthObserver) controls.update();
    glow.quaternion.copy(camera.quaternion); renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; onReady(); }
    compassPoints.forEach(({ element, azimuth }) => {
      if (!earthObserver) { element.hidden = true; return; }
      compassDirection.copy(observerNorth).multiplyScalar(Math.cos(azimuth));
      compassDirection.addScaledVector(observerEast, Math.sin(azimuth)).normalize();
      compassPoint.copy(camera.position).addScaledVector(compassDirection, 10);
      compassProjected.copy(compassPoint).project(camera);
      const visible = compassProjected.z > -1 && compassProjected.z < 1 && Math.abs(compassProjected.x) < 1.05 && Math.abs(compassProjected.y) < 1.05;
      element.hidden = !visible;
      if (visible) element.style.transform = `translate(-50%, -100%) translate(${(compassProjected.x * 0.5 + 0.5) * width}px, ${(-compassProjected.y * 0.5 + 0.5) * height - 7}px)`;
    });
    objects.forEach(({ body, group, label }) => {
      const labelOffset = realScale ? bodyRadius(body) * 0.25 : 0.55;
      const observerMarker = observerMarkers.get(body.name);
      projected.copy(observerMarker?.visible ? observerMarker.position : group.position);
      if (!earthObserver) projected.y += bodyRadius(body) + labelOffset;
      projected.project(camera);
      const inSelectedSystem = !isSatellite(body) || selectedSystem === body.parent;
      const visibleInObserver = Boolean(earthObserver && observerMarker?.visible && !observerMarker.userData.eclipseHidden);
      const visible = options.labels && (visibleInObserver || (!earthObserver && inSelectedSystem)) && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
      label.classList.toggle('below-horizon', Boolean(earthObserver && observerMarker && observerMarker.userData.aboveHorizon === false));
      label.hidden = !visible;
      if (visible) {
        const labelAnchor = earthObserver && width < 700 ? 'translate(-50%, 8px)' : 'translate(-50%, -100%)';
        label.style.transform = `${labelAnchor} translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px)`;
      }
    });
  });
  return {
    focus,
    setEarthObserver,
    zoomEarthObserver,
    setOptions(next: Options) {
      if (next.realScale !== options.realScale) {
        realScale = next.realScale;
        refreshOrbitLines();
        if (earthObserver) {
          camera.near = Math.max(bodyRadius(earth.body) * 0.0005, 0.000000001);
          camera.updateProjectionMatrix();
        } else {
          focus(selected);
        }
      }
      options = next;
    },
    setDate(date: Date) { days = dateToSimulationDays(date); },
    getDate() { return simulationDaysToDate(days); },
    getMoonPhase: moonPhase,
    getEclipseState: eclipseState,
    reset() { days = dateToSimulationDays(new Date()); setEarthObserver(null); focus(null); },
    dispose() {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose();
      mobileMedia.removeEventListener('change', updateTouchAction);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerCancel);
      renderer.domElement.removeEventListener('wheel', wheel);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      resources.dispose();
      objects.forEach((item) => item.label.remove()); compassPoints.forEach(({ element }) => element.remove()); gridTooltip.remove(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
