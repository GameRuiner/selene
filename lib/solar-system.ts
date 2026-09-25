import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Body as AstronomyBody } from 'astronomy-engine';
import { type BodyName, isSatellite } from './solar-data';
import { dateToSimulationDays, simulationDaysToDate } from './astronomy/time';
import { lunarCoordinates as calculateLunarCoordinates, moonPhaseFromAngle, classifySceneEclipse } from './astronomy/moon';
import { bodyRadius as calculateBodyRadius, orbitRadius } from './solar-system/orbit-math';
import { createFocusCameraController } from './solar-system/camera-controller';
import { astronomyBodyForTarget, SKY_TARGETS, type SkyTarget } from './astronomy/observer';
import { createResourceRegistry } from './solar-system/resources';
import { createCelestialMapper } from './solar-system/celestial-mapper';
import { createBodyScene, updateBodyScene, updateBodyLabels } from './solar-system/body-scene';
import { createEarthObserverView, type EarthObserverView } from './solar-system/earth-observer-view';
import { bindSceneInput } from './solar-system/input-controller';
import { createMoonOrbitMapper, writeMoonOrbitPath } from './solar-system/moon-orbit';
import { createApophisSceneMapper, usesFixedApophisFlybyPath } from './solar-system/apophis-path';
import { apophisEncounterBodyRadius, apophisEncounterDisplayBlend } from './solar-system/apophis-display';
import { APOPHIS_EPHEMERIS_START, APOPHIS_EPHEMERIS_END } from './astronomy/apophis';

import type { SolarSystem, LandmarkSelection, EarthObserver, SolarSystemOptions } from './solar-system/types';
export type { SolarSystem, Landmark, LandmarkSelection, EarthObserver, SolarSystemOptions } from './solar-system/types';
type Options = SolarSystemOptions;
const sceneAU = 14;
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
  let observerView: EarthObserverView | null = null;
  const updateTouchAction = () => { renderer.domElement.style.touchAction = mobileMedia.matches && !observerView?.active ? 'pan-y' : 'none'; };
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
  const degrees = Math.PI / 180;
  let realScale = false;
  let width = 1, height = 1;
  const origin = new THREE.Vector3();
  const lunarShadowUniforms = {
    uEarthPosition: { value: new THREE.Vector3() },
    uSunPosition: { value: new THREE.Vector3() },
    uEarthRadius: { value: 1 },
    uSunRadius: { value: 1 },
    uEclipseStrength: { value: 0 },
  };
  const bodyScene = createBodyScene({ scene, host, renderer, resources, realScale: () => realScale, lunarShadowUniforms, focus: (name) => focus(name), onSelect, onLandmarkSelect, onError });
  const { paths, objects, objectByName, orbitLines, earth, moon, refreshOrbitLines } = bodyScene;
  const moonOrbitLine = orbitLines.find(({ body }) => body.name === 'Moon')!.line;
  const apophisOrbitLine = orbitLines.find(({ body }) => body.name === 'Apophis')!.line;
  let moonOrbitDay = Number.NaN;
  let apophisOrbitDay = Number.NaN;
  let apophisOrbitFixed = false;
  const bodyRadius = (body: (typeof objects)[number]['body']) => calculateBodyRadius(body, realScale);
  const focusCamera = createFocusCameraController({ camera, controls, bodyScene, home, origin, isRealScale: () => realScale, width: () => width, radiusFor: (name) => {
    const body = objectByName.get(name)!.body;
    const time = simulationDaysToDate(days).getTime();
    return time >= APOPHIS_EPHEMERIS_START && time <= APOPHIS_EPHEMERIS_END
      ? apophisEncounterBodyRadius(body, earth.group.position.distanceTo(objectByName.get('Apophis')!.group.position), realScale)
      : bodyRadius(body);
  } });
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
  const { sunGlow } = bodyScene;
  let options: Options = { paused: false, speed: 12, orbits: true, labels: true, realScale: false };
  let days = dateToSimulationDays(new Date());
  let selected: BodyName | null = null;
  const sceneNorth = new THREE.Vector3(0, Math.cos(23.44 * degrees), -Math.sin(23.44 * degrees));
  const celestialMapper = createCelestialMapper({ earthPosition: earth.group.position, sceneNorth, origin, sceneAU });
  const moonOrbitMapper = createMoonOrbitMapper(earth.group.position);
  const apophisMapper = createApophisSceneMapper();
  const exactMoonPosition = (target: THREE.Vector3) => celestialMapper.moonPosition(simulationDaysToDate(days), target);
  const displayMoonPosition = (target: THREE.Vector3) => moonOrbitMapper.moonPosition(simulationDaysToDate(days), target);
  const apophisPosition = (target: THREE.Vector3) => apophisMapper.positionAt(simulationDaysToDate(days), earth.group.position, target);
  const exactBodyPosition = (body: AstronomyBody, target: THREE.Vector3) => celestialMapper.bodyPosition(body, simulationDaysToDate(days), target);
  const astronomyBodyForObserverTarget = (name: string) => SKY_TARGETS.includes(name as SkyTarget) ? astronomyBodyForTarget(name as SkyTarget) : undefined;
  observerView = createEarthObserverView({ scene, host, resources, starMaterial, realScale: () => realScale, camera, controls, bodyScene, mapper: celestialMapper, sceneNorth, origin, width: () => width, height: () => height, onFreeLook: onObserverFreeLook, lunarEclipseStrength: () => lunarShadowUniforms.uEclipseStrength.value });
  function updateBodies() {
    const earthObserver = observerView!.current;
    return updateBodyScene(bodyScene, {
      days, realScale, earthObserver, selected, lunarCoordinates, exactMoonPosition: earthObserver ? exactMoonPosition : displayMoonPosition, apophisPosition, exactBodyPosition,
      astronomyBodyForTarget: astronomyBodyForObserverTarget,
      lunarShadowUniforms,
    });
  }
  function focus(name: BodyName | null) {
    if (observerView?.active) {
      observerView.exitForFocus();
      updateTouchAction();
    }
    selected = name;
    // Calendar actions may change the date and focus in the same browser tick.
    // Frame the new encounter geometry, not positions left from the previous date.
    updateBodies();
    focusCamera.focus(name);
  }
  function setEarthObserver(next: EarthObserver | null) {
    const wasObserving = observerView!.setObserver(next);
    updateTouchAction();
    focusCamera.cancel();
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
    observerView!.zoom(delta);
  }
  controls.addEventListener('start', focusCamera.cancel);
  function resize() {
    width = host.clientWidth; height = host.clientHeight;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  if (width < 700) camera.position.multiplyScalar(1.4);
  const sceneInput = bindSceneInput({
    canvas: renderer.domElement, host, camera, bodyScene, observerView: observerView!,
    focus, zoomObserver: zoomEarthObserver,
    onSelect: (name) => { selected = name; onSelect(name); },
    onLandmarkSelect, onContextLost: () => { options.paused = true; }, onError,
  });
  let previous = performance.now();
  let firstFrame = true;
  renderer.setAnimationLoop((now) => {
    const elapsed = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden && !options.paused) days += elapsed * options.speed;
    const earthObserver = observerView!.current;
    const selectedSystem = updateBodies();
    if (options.orbits && !earthObserver && (!Number.isFinite(moonOrbitDay) || Math.abs(days - moonOrbitDay) > 1 / 288)) {
      const date = simulationDaysToDate(days);
      const displayBlend = date.getTime() >= APOPHIS_EPHEMERIS_START && date.getTime() <= APOPHIS_EPHEMERIS_END
        ? apophisEncounterDisplayBlend(earth.group.position.distanceTo(objectByName.get('Apophis')!.group.position)) : 1;
      writeMoonOrbitPath(date, moonOrbitMapper, realScale ? null : orbitRadius(moon.body, false), moonOrbitLine.geometry.getAttribute('position') as THREE.BufferAttribute, displayBlend);
      moonOrbitLine.geometry.computeBoundingSphere();
      moonOrbitDay = days;
    }
    const apophisPathDate = simulationDaysToDate(days);
    const fixedApophisPath = usesFixedApophisFlybyPath(apophisPathDate);
    if (options.orbits && !earthObserver && (!Number.isFinite(apophisOrbitDay) || fixedApophisPath !== apophisOrbitFixed || (!fixedApophisPath && Math.abs(days - apophisOrbitDay) > 1 / 288))) {
      apophisMapper.writePath(apophisPathDate, realScale, apophisOrbitLine.geometry.getAttribute('position') as THREE.BufferAttribute);
      apophisOrbitLine.geometry.computeBoundingSphere();
      apophisOrbitDay = days;
      apophisOrbitFixed = fixedApophisPath;
    }
    sunGlow.scale.setScalar(bodyRadius(objects[0].body) / objects[0].body.radius);
    sunGlow.visible = !observerView!.active;
    const target = selected ? objectByName.get(selected)?.group.position ?? null : null;
    if (earthObserver) {
      observerView!.update(simulationDaysToDate(days));
    } else focusCamera.update(target, elapsed, now);
    paths.visible = options.orbits && !earthObserver;
    orbitLines.forEach(({ body, line }) => {
      line.visible = options.orbits && !earthObserver && (!isSatellite(body) || selectedSystem === body.parent);
    });
    if (!observerView!.active) controls.update();
    sunGlow.quaternion.copy(camera.quaternion); renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; onReady(); }
    observerView!.updateCompass();
    updateBodyLabels(bodyScene, { camera, observerMarkers: observerView!.markers, earthObserver, selectedSystem, labels: options.labels, realScale, width, height });
  });
  return {
    focus,
    setEarthObserver,
    zoomEarthObserver,
    setOptions(next: Options) {
      if (next.realScale !== options.realScale) {
        realScale = next.realScale;
        moonOrbitDay = Number.NaN;
        apophisOrbitDay = Number.NaN;
        refreshOrbitLines();
        if (observerView!.active) {
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
      sceneInput.dispose();
      observerView!.dispose();
      objects.forEach((item) => item.label.remove());
      resources.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
