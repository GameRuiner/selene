import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BodyName } from '../solar-data';
import { SKY_TARGETS } from '../astronomy/observer';
import { moonPhaseFromAngle } from '../astronomy/moon';
import type { EarthObserver } from './types';
import type { CelestialMapper } from './celestial-mapper';
import type { BodyScene } from './body-scene';
import type { ResourceRegistry } from './resources';
import { earthSkyLighting } from './earth-sky-light';
import { bodyRadius, orbitRadius } from './orbit-math';

const degrees = Math.PI / 180;
const observerFov = 55;
const markerDistance = 10;
const referenceFovTangent = Math.tan(observerFov * degrees / 2);

export function observerMarkerWorldSize(fov: number, viewportHeight: number, referencePixels: number): number {
  const fovTangent = Math.tan(fov * degrees / 2);
  // Screen size grows with zoom, but less than a physical disc so guide markers stay readable.
  return 2 * markerDistance * referenceFovTangent * Math.sqrt(fovTangent / referenceFovTangent)
    * referencePixels / Math.max(viewportHeight, 1);
}

const observerMarkerColors: Record<string, string> = {
  Sun: '#ffd06d', Moon: '#e4ecff', Mercury: '#c7c1b8', Venus: '#f0c78d', Mars: '#e1805f',
  Jupiter: '#e2c09e', Saturn: '#e8d49c', Uranus: '#9bdbe5', Neptune: '#7fa5ff',
};

export type EarthObserverView = {
  readonly active: boolean;
  readonly current: EarthObserver | null;
  readonly markers: Map<BodyName, THREE.Sprite>;
  setObserver(next: EarthObserver | null): boolean;
  exitForFocus(): void;
  zoom(delta: number): void;
  beginDrag(x: number, y: number): void;
  moveDrag(x: number, y: number): void;
  endDrag(): void;
  update(date: Date): void;
  updateCompass(): void;
  dispose(): void;
};

export function createEarthObserverView(options: {
  scene: THREE.Scene;
  host: HTMLDivElement;
  resources: ResourceRegistry;
  starMaterial: THREE.PointsMaterial;
  realScale: () => boolean;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  bodyScene: BodyScene;
  mapper: CelestialMapper;
  sceneNorth: THREE.Vector3;
  origin: THREE.Vector3;
  width: () => number;
  height: () => number;
  onFreeLook: () => void;
  lunarEclipseStrength: () => number;
}): EarthObserverView {
  const { scene, host, resources, starMaterial, realScale, camera, controls, bodyScene, mapper, sceneNorth, origin, width, height, onFreeLook, lunarEclipseStrength } = options;
  const normalStarOpacity = starMaterial.opacity;
  const skyGeometry = resources.geometry(new THREE.SphereGeometry(1, 64, 32));
  const skyMaterial = resources.material(new THREE.ShaderMaterial({
    uniforms: {
      horizonUp: { value: new THREE.Vector3(0, 1, 0) },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      daylight: { value: 0 },
      twilight: { value: 0 },
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
      uniform vec3 sunDirection;
      uniform float daylight;
      uniform float twilight;
      void main() {
        vec3 direction = normalize(vSkyDirection);
        float elevation = max(dot(direction, normalize(horizonUp)), 0.0);
        float zenith = smoothstep(0.0, 0.85, elevation);
        vec3 nightSky = mix(vec3(0.012, 0.025, 0.065), vec3(0.003, 0.010, 0.035), zenith);
        vec3 daySky = mix(vec3(0.43, 0.66, 0.78), vec3(0.055, 0.27, 0.58), sqrt(elevation));
        vec3 color = mix(nightSky, daySky, daylight);
        float sunward = pow(max(dot(direction, normalize(sunDirection)), 0.0), 10.0);
        float nearHorizon = exp(-8.0 * elevation);
        color = mix(color, vec3(0.91, 0.38, 0.17), twilight * sunward * nearHorizon * 0.72);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.visible = false; sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const nightGroundColor = new THREE.Color('#30342f');
  const dayGroundColor = new THREE.Color('#647c72');
  const nightHorizonColor = new THREE.Color('#89939a');
  const dayHorizonColor = new THREE.Color('#c1d1c5');
  const horizonGeometry = resources.geometry(new THREE.SphereGeometry(1, 96, 48));
  const horizonMaterial = resources.material(new THREE.ShaderMaterial({
    uniforms: { horizonUp: { value: new THREE.Vector3(0, 1, 0) }, groundColor: { value: new THREE.Color('#30342f') }, lineColor: { value: new THREE.Color('#89939a') } },
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
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
  horizon.visible = false; horizon.frustumCulled = false; horizon.renderOrder = 10; scene.add(horizon);

  const markerCanvas = document.createElement('canvas'); markerCanvas.width = 64; markerCanvas.height = 64;
  const markerContext = markerCanvas.getContext('2d');
  if (markerContext) {
    const markerGlow = markerContext.createRadialGradient(32, 32, 2, 32, 32, 31);
    markerGlow.addColorStop(0, '#ffffff'); markerGlow.addColorStop(0.28, '#ffffff'); markerGlow.addColorStop(0.52, '#ffffffcc'); markerGlow.addColorStop(1, '#ffffff00');
    markerContext.fillStyle = markerGlow; markerContext.fillRect(0, 0, 64, 64);
  }
  const markerTexture = resources.texture(new THREE.CanvasTexture(markerCanvas)); markerTexture.colorSpace = THREE.SRGBColorSpace;
  const markers = new Map<BodyName, THREE.Sprite>();
  const sunBody = bodyScene.objectByName.get('Sun')!;
  SKY_TARGETS.forEach((name) => {
    const material = resources.material(new THREE.SpriteMaterial({ map: markerTexture, color: observerMarkerColors[name] ?? '#ffffff', transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const marker = new THREE.Sprite(material); marker.visible = false; marker.renderOrder = 20; scene.add(marker); markers.set(name, marker);
  });

  const coronaCanvas = document.createElement('canvas'); coronaCanvas.width = 256; coronaCanvas.height = 256;
  const coronaContext = coronaCanvas.getContext('2d');
  if (coronaContext) {
    const coronaGlow = coronaContext.createRadialGradient(128, 128, 24, 128, 128, 124);
    coronaGlow.addColorStop(0, '#ffffff00'); coronaGlow.addColorStop(0.22, '#ffffff00'); coronaGlow.addColorStop(0.28, '#ffffffee'); coronaGlow.addColorStop(0.38, '#ffffff88'); coronaGlow.addColorStop(0.68, '#ffffff22'); coronaGlow.addColorStop(1, '#ffffff00');
    coronaContext.fillStyle = coronaGlow; coronaContext.fillRect(0, 0, 256, 256); coronaContext.save(); coronaContext.translate(128, 128);
    for (let ray = 0; ray < 40; ray++) {
      const angle = ray / 40 * Math.PI * 2, inner = 42 + (ray % 4) * 2, outer = 82 + (ray * 29 % 42), width = ray % 5 === 0 ? 2.2 : 0.85;
      const gradient = coronaContext.createLinearGradient(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
      gradient.addColorStop(0, '#ffffffa8'); gradient.addColorStop(1, '#ffffff00'); coronaContext.strokeStyle = gradient; coronaContext.lineWidth = width;
      coronaContext.beginPath(); coronaContext.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner); coronaContext.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); coronaContext.stroke();
    }
    coronaContext.restore();
  }
  const coronaTexture = resources.texture(new THREE.CanvasTexture(coronaCanvas)); coronaTexture.colorSpace = THREE.SRGBColorSpace;
  const discCanvas = document.createElement('canvas'); discCanvas.width = 128; discCanvas.height = 128;
  const discContext = discCanvas.getContext('2d');
  if (discContext) {
    const edge = discContext.createRadialGradient(64, 64, 48, 64, 64, 62);
    edge.addColorStop(0, '#ffffff'); edge.addColorStop(0.82, '#ffffff'); edge.addColorStop(0.96, '#ffffffdd'); edge.addColorStop(1, '#ffffff00');
    discContext.fillStyle = edge; discContext.fillRect(0, 0, 128, 128);
  }
  const discTexture = resources.texture(new THREE.CanvasTexture(discCanvas)); discTexture.colorSpace = THREE.SRGBColorSpace;
  const coronaMaterial = resources.material(new THREE.SpriteMaterial({ map: coronaTexture, color: '#fff0ba', transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const corona = new THREE.Sprite(coronaMaterial); corona.visible = false; corona.renderOrder = 18; scene.add(corona);
  const sunDiscMaterial = resources.material(new THREE.SpriteMaterial({ map: discTexture, color: '#fff2d2', transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  const sunDisc = new THREE.Sprite(sunDiscMaterial); sunDisc.visible = false; sunDisc.renderOrder = 21; scene.add(sunDisc);
  const moonDiscMaterial = resources.material(new THREE.SpriteMaterial({ map: discTexture, color: '#060a10', transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  const moonDisc = new THREE.Sprite(moonDiscMaterial); moonDisc.visible = false; moonDisc.renderOrder = 22; scene.add(moonDisc);
  const darkMoonColor = new THREE.Color('#060a10');
  const brightMoonColor = new THREE.Color('#e4ecff');
  const eclipsedMoonColor = new THREE.Color('#b94c32');

  const compass = [
    { label: 'N', azimuth: 0 }, { label: 'NE', azimuth: 45 }, { label: 'E', azimuth: 90 }, { label: 'SE', azimuth: 135 },
    { label: 'S', azimuth: 180 }, { label: 'SW', azimuth: 225 }, { label: 'W', azimuth: 270 }, { label: 'NW', azimuth: 315 },
  ].map(({ label, azimuth }) => {
    const element = document.createElement('span'); element.className = 'compass-label'; element.textContent = label; element.hidden = true; host.appendChild(element);
    return { element, azimuth: azimuth * degrees };
  });

  const observerNorth = new THREE.Vector3(), observerEast = new THREE.Vector3(), observerNormal = new THREE.Vector3();
  const observerUp = new THREE.Vector3(), viewDirection = new THREE.Vector3(), lookDirection = new THREE.Vector3();
  const markerDirection = new THREE.Vector3(), sunDirection = new THREE.Vector3(), moonDirection = new THREE.Vector3();
  const compassDirection = new THREE.Vector3(), compassPoint = new THREE.Vector3(), compassProjected = new THREE.Vector3();
  let observer: EarthObserver | null = null;
  let tracking = true, dragging = false, azimuth = 0, altitude = 0, fov = observerFov;
  let pointerX = 0, pointerY = 0;

  const setObserver = (next: EarthObserver | null): boolean => {
    const wasActive = observer !== null;
    if (next && !wasActive) fov = observerFov;
    observer = next; tracking = Boolean(next); dragging = false;
    sky.visible = Boolean(next); horizon.visible = Boolean(next);
    bodyScene.earthGridLine.visible = !next;
    bodyScene.earthLandmarkMeshes.forEach((marker) => { marker.visible = !next; });
    if (!next) { markers.forEach((marker) => { marker.visible = false; }); corona.visible = false; sunDisc.visible = false; moonDisc.visible = false; starMaterial.opacity = normalStarOpacity; }
    controls.enabled = !next;
    camera.fov = next ? fov : 42;
    if (!next) camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    return wasActive;
  };
  const update = (date: Date) => {
    if (!observer) return;
    mapper.observerPosition(date, observer.latitude, observer.longitude, observerNormal);
    observerNorth.copy(sceneNorth).addScaledVector(observerNormal, -sceneNorth.dot(observerNormal));
    if (observerNorth.lengthSq() < 0.000001) {
      const eastDirection = mapper.sceneEastDirection(); observerNorth.copy(eastDirection).addScaledVector(observerNormal, -eastDirection.dot(observerNormal));
    }
    observerNorth.normalize(); observerEast.crossVectors(observerNorth, observerNormal).normalize();
    const cameraRadius = bodyScene.earth.mesh.scale.x * 1.002;
    camera.position.copy(bodyScene.earth.group.position).addScaledVector(observerNormal, cameraRadius);
    if (tracking) {
      controls.target.copy(bodyScene.objectByName.get(observer.target)?.group.position ?? origin);
      viewDirection.copy(controls.target).sub(camera.position).normalize();
      altitude = Math.asin(THREE.MathUtils.clamp(viewDirection.dot(observerNormal), -1, 1));
      azimuth = Math.atan2(viewDirection.dot(observerEast), viewDirection.dot(observerNorth));
    }
    const altitudeCosine = Math.cos(altitude);
    lookDirection.copy(observerNorth).multiplyScalar(altitudeCosine * Math.cos(azimuth));
    lookDirection.addScaledVector(observerEast, altitudeCosine * Math.sin(azimuth));
    lookDirection.addScaledVector(observerNormal, Math.sin(altitude)).normalize();
    controls.target.copy(camera.position).add(lookDirection);
    observerUp.copy(observerNormal);
    if (Math.abs(observerUp.dot(lookDirection)) > 0.98) observerUp.copy(observerNorth).addScaledVector(lookDirection, -observerNorth.dot(lookDirection));
    camera.up.copy(observerUp.normalize()); camera.lookAt(controls.target);
    sky.position.copy(camera.position); sky.scale.setScalar(40);
    horizon.position.copy(camera.position); horizon.scale.setScalar(40);
    (skyMaterial.uniforms.horizonUp.value as THREE.Vector3).copy(observerNormal);
    (horizonMaterial.uniforms.horizonUp.value as THREE.Vector3).copy(observerNormal);

    markers.forEach((marker, name) => {
      const bodyPosition = bodyScene.objectByName.get(name as BodyName)?.group.position;
      if (!bodyPosition) { marker.visible = false; return; }
      markerDirection.copy(bodyPosition).sub(camera.position).normalize(); marker.position.copy(camera.position).addScaledVector(markerDirection, markerDistance);
      marker.scale.setScalar(observerMarkerWorldSize(camera.fov, height(), name === 'Sun' ? 18 : 10));
      const aboveHorizon = markerDirection.dot(observerNormal) > 0;
      marker.visible = true; marker.userData.aboveHorizon = aboveHorizon; marker.userData.eclipseHidden = false;
      const material = marker.material as THREE.SpriteMaterial; material.color.set(observerMarkerColors[name] ?? '#ffffff'); material.opacity = name === 'Moon' ? 0 : aboveHorizon ? 1 : 0.42;
    });
    const sun = markers.get('Sun'), moon = markers.get('Moon'); corona.visible = false;
    sunDisc.visible = Boolean(sun?.visible); moonDisc.visible = Boolean(moon?.visible);
    // Both discs follow their actual angular size; the Sun's separate halo makes it look brighter and larger.
    const sunDiscSize = 20 * bodyRadius(sunBody.body, true) / Math.max(sunBody.group.position.distanceTo(camera.position), 0.000001);
    const moonDistance = realScale() ? bodyScene.moon.group.position.distanceTo(camera.position) : orbitRadius(bodyScene.moon.body, true);
    const moonDiscSize = 20 * bodyRadius(bodyScene.moon.body, true) / Math.max(moonDistance, 0.000001);
    if (sun) { sunDisc.position.copy(sun.position); sunDisc.scale.setScalar(sunDiscSize); sunDiscMaterial.opacity = sun.userData.aboveHorizon === false ? 0.42 : 1; }
    if (moon) { moonDisc.position.copy(moon.position); moonDisc.scale.setScalar(moonDiscSize); moonDiscMaterial.opacity = moon.userData.aboveHorizon === false ? 0.42 : 1; }
    let solarSeparation = 180;
    if (sun?.visible && moon?.visible) {
      sunDirection.copy(sun.position).sub(camera.position).normalize(); moonDirection.copy(moon.position).sub(camera.position).normalize();
      solarSeparation = sunDirection.angleTo(moonDirection) / degrees;
    } else if (sun?.visible) sunDirection.copy(sun.position).sub(camera.position).normalize();
    const lighting = earthSkyLighting(Math.asin(THREE.MathUtils.clamp(sunDirection.dot(observerNormal), -1, 1)), solarSeparation);
    (skyMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(sunDirection);
    skyMaterial.uniforms.daylight.value = lighting.effectiveDaylight;
    skyMaterial.uniforms.twilight.value = lighting.twilight;
    (horizonMaterial.uniforms.groundColor.value as THREE.Color).lerpColors(nightGroundColor, dayGroundColor, lighting.effectiveDaylight);
    (horizonMaterial.uniforms.lineColor.value as THREE.Color).lerpColors(nightHorizonColor, dayHorizonColor, lighting.effectiveDaylight);
    starMaterial.opacity = normalStarOpacity * lighting.starVisibility;
    if (sun?.visible && moon?.visible) {
      const moonAboveHorizon = moon.userData.aboveHorizon !== false;
      const illumination = moonPhaseFromAngle(solarSeparation * degrees).illumination;
      moonDiscMaterial.color.lerpColors(darkMoonColor, brightMoonColor, illumination);
      if (lighting.solarCoverage > 0.015) {
        corona.position.copy(sun.position); corona.scale.setScalar(sunDiscSize * (4.5 + lighting.solarCoverage * 2.5)); coronaMaterial.color.set('#fff0ba');
        coronaMaterial.opacity = lighting.solarCoverage * (0.45 + lighting.solarCoverage * 0.55) * (moonAboveHorizon ? 1 : 0.35); corona.visible = true;
        moon.userData.eclipseHidden = true;
      } else {
        const strength = lunarEclipseStrength();
        if (strength > 0.015) {
          corona.position.copy(moon.position); corona.scale.setScalar(moonDiscSize * (3.5 + strength * 2)); coronaMaterial.color.set('#c94424');
          coronaMaterial.opacity = strength * (moonAboveHorizon ? 0.72 : 0.25); corona.visible = true;
          moonDiscMaterial.color.lerp(eclipsedMoonColor, strength * 0.8);
        }
      }
    }
  };
  const updateCompass = () => {
    compass.forEach(({ element, azimuth: compassAzimuth }) => {
      if (!observer) { element.hidden = true; return; }
      compassDirection.copy(observerNorth).multiplyScalar(Math.cos(compassAzimuth));
      compassDirection.addScaledVector(observerEast, Math.sin(compassAzimuth)).normalize();
      compassPoint.copy(camera.position).addScaledVector(compassDirection, 10); compassProjected.copy(compassPoint).project(camera);
      const visible = compassProjected.z > -1 && compassProjected.z < 1 && Math.abs(compassProjected.x) < 1.05 && Math.abs(compassProjected.y) < 1.05;
      element.hidden = !visible;
      if (visible) element.style.transform = `translate(-50%, -100%) translate(${(compassProjected.x * 0.5 + 0.5) * width()}px, ${(-compassProjected.y * 0.5 + 0.5) * height() - 7}px)`;
    });
  };
  return {
    get active() { return observer !== null; }, get current() { return observer; }, markers,
    setObserver,
    exitForFocus() { setObserver(null); },
    zoom(delta) { if (!observer) return; fov = THREE.MathUtils.clamp(fov + delta, 8, 90); camera.fov = fov; camera.updateProjectionMatrix(); },
    beginDrag(x, y) { if (!observer) return; dragging = true; pointerX = x; pointerY = y; },
    moveDrag(x, y) {
      if (!observer || !dragging) return;
      const deltaX = x - pointerX, deltaY = y - pointerY; pointerX = x; pointerY = y;
      azimuth -= deltaX * 0.0012; altitude = THREE.MathUtils.clamp(altitude + deltaY * 0.001, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      if (tracking) { tracking = false; onFreeLook(); }
    },
    endDrag() { dragging = false; },
    update, updateCompass,
    dispose() { compass.forEach(({ element }) => element.remove()); },
  };
}
