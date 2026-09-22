import * as THREE from 'three';
import type { Body as AstronomyBody } from 'astronomy-engine';
import { bodies, type BodyName, type SolarBody, isSatellite } from '../solar-data';
import { bodyRadius, initialOrbitalPhase, orbitalAngle, orbitalPosition, orbitRadius } from './orbit-math';
import { createEarthGrid, createEarthLandmarks } from './earth-overlays';
import { loadSrgbTexture, type ResourceRegistry } from './resources';
import type { EarthObserver, LandmarkSelection } from './types';
import { lunarEclipseStrength, type LunarCoordinates } from '../astronomy/moon';

export type SceneBody = { body: SolarBody; group: THREE.Group; mesh: THREE.Mesh; ring: THREE.Mesh | null; label: HTMLButtonElement; phase: number };
export type BodyScene = {
  paths: THREE.Group;
  geometry: THREE.SphereGeometry;
  objects: SceneBody[];
  objectByName: Map<BodyName, SceneBody>;
  orbitLines: { body: SolarBody; line: THREE.LineLoop }[];
  earth: SceneBody;
  moon: SceneBody;
  sunGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  lunarAxis: THREE.Vector3;
  projected: THREE.Vector3;
  earthGridLine: THREE.LineSegments;
  earthLandmarkMeshes: THREE.Mesh[];
  refreshOrbitLines: () => void;
};
export type LunarShadowUniforms = {
  uEarthPosition: { value: THREE.Vector3 };
  uSunPosition: { value: THREE.Vector3 };
  uEarthRadius: { value: number };
  uSunRadius: { value: number };
  uEclipseStrength: { value: number };
};

const surfaceTexturePaths: Partial<Record<BodyName, string>> = {
  Sun: '/textures/sun.jpg', Mercury: '/textures/mercury.jpg', Venus: '/textures/venus.jpg', Earth: '/earth.jpg', Moon: '/moon.jpg',
  Mars: '/textures/mars.jpg', Jupiter: '/textures/jupiter.jpg', Saturn: '/textures/saturn.jpg', Uranus: '/textures/uranus.jpg', Neptune: '/textures/neptune.jpg',
  Io: '/textures/io.jpg', Europa: '/textures/europa.jpg', Ganymede: '/textures/ganymede.jpg', Callisto: '/textures/callisto.jpg',
};
const missionMosaicBodies = new Set<BodyName>(['Io', 'Europa', 'Ganymede', 'Callisto']);
const degrees = Math.PI / 180;

export function createBodyScene(options: {
  scene: THREE.Scene;
  host: HTMLDivElement;
  renderer: THREE.WebGLRenderer;
  resources: ResourceRegistry;
  realScale: () => boolean;
  lunarShadowUniforms: Record<string, { value: THREE.Vector3 | number }>;
  focus: (name: BodyName) => void;
  onSelect: (name: BodyName) => void;
  onLandmarkSelect: (selection: LandmarkSelection) => void;
  onError: (message: string) => void;
}): BodyScene {
  const { scene, host, renderer, resources, realScale, lunarShadowUniforms, focus, onSelect, onLandmarkSelect, onError } = options;
  const loader = new THREE.TextureLoader();
  const texture = (url: string) => loadSrgbTexture(loader, renderer, resources, url, () => onError('A surface texture could not load. Reload the page to try again.'));
  const paths = new THREE.Group();
  scene.add(paths);
  const geometry = resources.geometry(new THREE.SphereGeometry(1, 64, 40));
  const earthLandmarkMeshes: THREE.Mesh[] = [];
  const lunarAxis = new THREE.Vector3(0, 1, 0);
  let earthGridLine: THREE.LineSegments | undefined;

  const objects = bodies.map((body, index): SceneBody => {
    const material = new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.95 });
    const texturePath = surfaceTexturePaths[body.name];
    if (texturePath) {
      material.map = texture(texturePath);
      if (!missionMosaicBodies.has(body.name)) material.color.set('white');
    }
    if (body.name === 'Sun') {
      material.emissive.set('white'); material.emissiveMap = material.map; material.emissiveIntensity = 1.65;
    }
    if (body.name === 'Moon') {
      material.onBeforeCompile = (shader) => {
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
      material.customProgramCacheKey = () => 'moon-earth-shadow-v1';
    }
    if (missionMosaicBodies.has(body.name)) {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          float mosaicCoverage = smoothstep(0.012, 0.05, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
          diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, mosaicCoverage);
        `);
      };
      material.customProgramCacheKey = () => `mission-mosaic-${body.name}`;
    }
    resources.material(material);
    const group = new THREE.Group(); scene.add(group);
    const axialTilt = new THREE.Group(); group.add(axialTilt);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(bodyRadius(body, realScale()));
    if (body.name === 'Earth') axialTilt.rotation.x = -23.44 * degrees;
    else if (body.name === 'Uranus') axialTilt.rotation.z = 1.7;
    mesh.userData.name = body.name; axialTilt.add(mesh);
    if (body.name === 'Earth') {
      earthGridLine = createEarthGrid(resources); mesh.add(earthGridLine);
      const landmarks = createEarthLandmarks(resources);
      earthLandmarkMeshes.push(...landmarks.meshes); mesh.add(landmarks.group);
    }
    const label = document.createElement('button');
    label.className = 'planet-label'; label.textContent = body.name;
    label.setAttribute('aria-label', `Focus ${body.name}`);
    label.onclick = () => { focus(body.name); onSelect(body.name); onLandmarkSelect(null); };
    host.appendChild(label);
    let ring: THREE.Mesh | null = null;
    if (body.name === 'Saturn') {
      const ringGeometry = resources.geometry(new THREE.RingGeometry(2.15, 3.5, 128, 6));
      const ringMaterial = resources.material(new THREE.MeshStandardMaterial({ color: '#bca67b', side: THREE.DoubleSide, transparent: true, opacity: 0.7, roughness: 1 }));
      ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = Math.PI / 2 - 0.4; group.add(ring);
    }
    // Keep the lunar offset anchored to the 2000-01-06 18:14 UTC new moon.
    const phase = body.name === 'Moon' ? 0.9573515073 : initialOrbitalPhase(body, index);
    return { body, group, mesh, ring, label, phase };
  });
  const objectByName = new Map(objects.map((item) => [item.body.name, item]));
  const orbitLines = objects.flatMap(({ body }) => {
    if (!body.distance) return [];
    const parent = isSatellite(body) ? objectByName.get(body.parent)?.group : paths;
    const points = Array.from({ length: 256 }, (_, i) => orbitalPosition(body, i / 256 * Math.PI * 2, realScale()));
    const orbitGeometry = resources.geometry(new THREE.BufferGeometry().setFromPoints(points));
    const orbitMaterial = resources.material(new THREE.LineBasicMaterial({ color: 0x75829c, transparent: true, opacity: 0.23 }));
    const line = new THREE.LineLoop(orbitGeometry, orbitMaterial);
    line.userData.orbitBody = body; parent?.add(line);
    return [{ body, line }];
  });
  const sunGlowMaterial = resources.material(new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#ff9c38') } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform vec3 tint; void main(){float d=length(vUv-0.5)*2.0;float a=pow(max(0.0,1.0-d),3.5)*0.8;gl_FragColor=vec4(tint,a);}',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const sunGlowGeometry = resources.geometry(new THREE.PlaneGeometry(23, 23));
  const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
  scene.add(sunGlow);
  return {
    paths, geometry, objects, objectByName, orbitLines,
    sunGlow,
    earth: objectByName.get('Earth')!, moon: objectByName.get('Moon')!, lunarAxis, projected: new THREE.Vector3(),
    earthGridLine: earthGridLine!, earthLandmarkMeshes,
    refreshOrbitLines() {
      orbitLines.forEach(({ body, line }) => {
        const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < 256; i++) {
          const point = orbitalPosition(body, i / 256 * Math.PI * 2, realScale());
          attribute.setXYZ(i, point.x, point.y, point.z);
        }
        attribute.needsUpdate = true; line.geometry.computeBoundingSphere();
      });
    },
  };
}

export function updateBodyScene(bodyScene: BodyScene, frame: {
  days: number;
  realScale: boolean;
  earthObserver: EarthObserver | null;
  selected: BodyName | null;
  lunarCoordinates: () => LunarCoordinates;
  exactMoonPosition: (target: THREE.Vector3) => THREE.Vector3;
  exactBodyPosition: (body: AstronomyBody, target: THREE.Vector3) => THREE.Vector3;
  astronomyBodyForTarget: (name: BodyName) => AstronomyBody | undefined;
  lunarShadowUniforms: LunarShadowUniforms;
}): BodyName | null {
  const { days, realScale, earthObserver, selected, lunarCoordinates, exactMoonPosition, exactBodyPosition, astronomyBodyForTarget, lunarShadowUniforms } = frame;
  const { objects, objectByName, earth } = bodyScene;
  const selectedBody = selected ? objectByName.get(selected)?.body : undefined;
  const selectedSystem = selectedBody && isSatellite(selectedBody) ? selectedBody.parent as BodyName : selected;
  objects.forEach(({ body, group, mesh, ring, phase, label }) => {
    const angle = orbitalAngle(body, days, phase);
    if (body.name === 'Moon') {
      const { phaseAngle, latitude } = lunarCoordinates();
      if (realScale) exactMoonPosition(group.position);
      else {
        const radius = orbitRadius(body, realScale);
        group.position.copy(earth.group.position).multiplyScalar(-1).normalize().applyAxisAngle(bodyScene.lunarAxis, -phaseAngle);
        group.position.multiplyScalar(Math.cos(latitude));
        group.position.y = Math.sin(latitude);
        group.position.multiplyScalar(radius).add(earth.group.position);
      }
      mesh.rotation.y = -phaseAngle;
    } else {
      if (body.distance) {
        const astronomyBody = astronomyBodyForTarget(body.name);
        if (earthObserver && astronomyBody && !isSatellite(body)) exactBodyPosition(astronomyBody, group.position);
        else group.position.copy(orbitalPosition(body, angle, realScale));
        if (isSatellite(body)) {
          const parent = objectByName.get(body.parent);
          if (parent) group.position.add(parent.group.position);
        }
      }
      mesh.rotation.y = days / body.rotationPeriod * Math.PI * 2;
    }
    mesh.scale.setScalar(bodyRadius(body, realScale));
    mesh.visible = !earthObserver;
    ring?.scale.setScalar(bodyRadius(body, realScale) / body.radius);
    if (ring) ring.visible = !earthObserver;
    label.classList.toggle('selected', earthObserver ? earthObserver.target === body.name : selected === body.name);
  });
  lunarShadowUniforms.uEarthPosition.value.copy(earth.group.position);
  lunarShadowUniforms.uEarthRadius.value = bodyRadius(earth.body, realScale);
  lunarShadowUniforms.uSunRadius.value = bodyRadius(objects[0].body, realScale);
  lunarShadowUniforms.uEclipseStrength.value = lunarEclipseStrength(lunarCoordinates());
  return selectedSystem;
}

export function updateBodyLabels(bodyScene: BodyScene, frame: {
  camera: THREE.Camera;
  observerMarkers: Map<BodyName, THREE.Sprite>;
  earthObserver: EarthObserver | null;
  selectedSystem: BodyName | null;
  labels: boolean;
  realScale: boolean;
  width: number;
  height: number;
}): void {
  const { camera, observerMarkers, earthObserver, selectedSystem, labels, realScale, width, height } = frame;
  bodyScene.objects.forEach(({ body, group, label }) => {
    const labelOffset = realScale ? bodyRadius(body, realScale) * 0.25 : 0.55;
    const observerMarker = observerMarkers.get(body.name);
    const projected = bodyScene.projected.copy(observerMarker?.visible ? observerMarker.position : group.position);
    if (!earthObserver) projected.y += bodyRadius(body, realScale) + labelOffset;
    projected.project(camera);
    const inSelectedSystem = !isSatellite(body) || selectedSystem === body.parent;
    const visibleInObserver = Boolean(earthObserver && observerMarker?.visible && !observerMarker.userData.eclipseHidden);
    const visible = labels && (visibleInObserver || (!earthObserver && inSelectedSystem)) && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
    label.classList.toggle('below-horizon', Boolean(earthObserver && observerMarker && observerMarker.userData.aboveHorizon === false));
    label.hidden = !visible;
    if (visible) {
      const labelAnchor = earthObserver && width < 700 ? 'translate(-50%, 8px)' : 'translate(-50%, -100%)';
      label.style.transform = `${labelAnchor} translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px)`;
    }
  });
}
