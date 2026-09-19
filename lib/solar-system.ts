import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EclipticGeoMoon, MoonPhase } from 'astronomy-engine';
import { bodies, type BodyName } from './solar-data';
import meridianData from './earth-meridian-lengths.json';

export type SolarSystem = ReturnType<typeof createSolarSystem>;
export type Landmark = { name: string; location: string; latitude: number; longitude: number; description: string };
export type LandmarkSelection = { landmark: Landmark; x: number; y: number } | null;
type Options = { paused: boolean; speed: number; orbits: boolean; labels: boolean; realScale: boolean };
const J2000_EPOCH = Date.UTC(2000, 0, 1, 12);
const semiMajorAxisAU: Record<BodyName, number> = { Sun: 0, Mercury: 0.387, Venus: 0.723, Earth: 1, Moon: 0.00257, Mars: 1.524, Jupiter: 5.203, Saturn: 9.537, Uranus: 19.191, Neptune: 30.07 };
const radiusInEarths: Record<BodyName, number> = { Sun: 109.1, Mercury: 0.383, Venus: 0.949, Earth: 1, Moon: 0.273, Mars: 0.532, Jupiter: 11.21, Saturn: 9.45, Uranus: 4.01, Neptune: 3.88 };
const sceneAU = 14;
const earthRadiiPerAU = 23_455;
const WGS84_SEMI_MAJOR_METERS = 6_378_137;
const WGS84_INVERSE_FLATTENING = 298.257223563;
const WGS84_MERIDIONAL_CIRCUMFERENCE_KM = 40_007.863;
const terrainMeridianLengthKm = new Map(
  meridianData.loops.map((loop) => [loop.orientationDegrees, loop.lengthKm]),
);

function parallelCircumferenceKm(latitudeDegrees: number) {
  const flattening = 1 / WGS84_INVERSE_FLATTENING;
  const eccentricitySquared = 2 * flattening - flattening ** 2;
  const latitude = latitudeDegrees * Math.PI / 180;
  const primeVerticalRadius = WGS84_SEMI_MAJOR_METERS / Math.sqrt(1 - eccentricitySquared * Math.sin(latitude) ** 2);
  return 2 * Math.PI * primeVerticalRadius * Math.cos(latitude) / 1_000;
}

function physicalMeridianLengthKm(longitudeDegrees: number) {
  const orientation = THREE.MathUtils.euclideanModulo(longitudeDegrees, 180);
  return terrainMeridianLengthKm.get(orientation) ?? WGS84_MERIDIONAL_CIRCUMFERENCE_KM;
}

export function createSolarSystem(host: HTMLDivElement, onSelect: (name: BodyName | null) => void, onLandmarkSelect: (selection: LandmarkSelection) => void, onError: (message: string) => void, onReady: () => void) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Three-dimensional solar system. Use the object list to select a world, or drag and scroll on this view.');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1500);
  const controls = new OrbitControls(camera, renderer.domElement);
  // OrbitControls writes touch-action: none inline. Restore vertical page scrolling on phones.
  const mobileMedia = window.matchMedia('(max-width: 700px)');
  const updateTouchAction = () => { renderer.domElement.style.touchAction = mobileMedia.matches ? 'pan-y' : 'none'; };
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
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geometry = new THREE.SphereGeometry(1, 64, 40);
  geometries.push(geometry);
  const paths = new THREE.Group();
  scene.add(paths);
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
  geometries.push(starGeometry); materials.push(starMaterial);
  const loader = new THREE.TextureLoader();
  function texture(url: string) {
    const result = loader.load(url, undefined, undefined, () => onError('A surface texture could not load. Reload the page to try again.'));
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    textures.push(result);
    return result;
  }
  type OrbitalBody = (typeof bodies)[number];
  const degrees = Math.PI / 180;
  let realScale = false;
  const orbitRadius = (body: OrbitalBody) => realScale ? semiMajorAxisAU[body.name] * sceneAU : body.distance;
  const bodyRadius = (body: OrbitalBody) => realScale ? radiusInEarths[body.name] * sceneAU / earthRadiiPerAU : body.radius;
  const orbitalPosition = (body: OrbitalBody, meanAnomaly: number, target = new THREE.Vector3()) => {
    // Kepler's equation preserves the faster sweep through periapsis.
    let eccentricAnomaly = meanAnomaly;
    for (let i = 0; i < 6; i++) eccentricAnomaly -= (eccentricAnomaly - body.eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - body.eccentricity * Math.cos(eccentricAnomaly));
    const radius = orbitRadius(body);
    const x = radius * (Math.cos(eccentricAnomaly) - body.eccentricity);
    const z = radius * Math.sqrt(1 - body.eccentricity ** 2) * Math.sin(eccentricAnomaly);
    target.set(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), body.periapsis * degrees).applyAxisAngle(new THREE.Vector3(1, 0, 0), body.inclination * degrees);
    return target;
  };
  function orbit(body: OrbitalBody, parent: THREE.Object3D = paths) {
    const points = Array.from({ length: 256 }, (_, i) => orbitalPosition(body, i / 256 * Math.PI * 2));
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x75829c, transparent: true, opacity: 0.23 });
    const line = new THREE.LineLoop(geom, mat);
    line.userData.orbitBody = body;
    parent.add(line); geometries.push(geom); materials.push(mat);
    return line;
  }
  function earthGrid() {
    const points: THREE.Vector3[] = [];
    const colors: number[] = [];
    const radius = 1.008;
    const segments = 72;
    const gridColor = 0x718ca5;
    const largestColor = 0xf2c96d;
    const smallestColor = 0x74dec0;
    const addLine = (pointAt: (step: number) => THREE.Vector3, color: number) => {
      const lineColor = new THREE.Color(color);
      for (let step = 0; step < segments; step++) {
        points.push(pointAt(step), pointAt(step + 1));
        lineColor.toArray(colors, colors.length);
        lineColor.toArray(colors, colors.length);
      }
    };
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const lat = latitude * degrees;
      addLine((step) => {
        const longitude = step / segments * Math.PI * 2;
        return new THREE.Vector3(Math.cos(lat) * Math.cos(longitude) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.sin(longitude) * radius);
      }, latitude === 0 ? largestColor : gridColor);
    }
    for (let longitude = 0; longitude < 360; longitude += 30) {
      const lon = longitude * degrees;
      addLine((step) => {
        const lat = -Math.PI / 2 + step / segments * Math.PI;
        return new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.sin(lon) * radius);
      }, longitude === 0 || longitude === 180 ? smallestColor : gridColor);
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.48, depthWrite: false });
    geometries.push(geom); materials.push(mat);
    return new THREE.LineSegments(geom, mat);
  }
  const earthLandmarkMeshes: THREE.Mesh[] = [];
  function earthLandmarks() {
    const locations: Landmark[] = [
      { name: 'Stonehenge', location: 'Wiltshire, England', latitude: 51.1789, longitude: -1.8262, description: 'A prehistoric stone circle built in stages between roughly 3000 and 1600 BCE.' },
      { name: 'Great Pyramid of Giza', location: 'Giza, Egypt', latitude: 29.9792, longitude: 31.1342, description: 'The largest pyramid at Giza, built as the tomb of Pharaoh Khufu around 2600 BCE.' },
      { name: 'Machu Picchu', location: 'Cusco Region, Peru', latitude: -13.1631, longitude: -72.5459, description: 'A 15th-century Inca citadel set high in the eastern Andes.' },
    ];
    const markers = new THREE.Group();
    const markerGeometry = new THREE.SphereGeometry(0.035, 12, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: '#d9e895', depthTest: true });
    geometries.push(markerGeometry); materials.push(markerMaterial);
    locations.forEach((landmark) => {
      const { latitude, longitude } = landmark;
      const lat = latitude * degrees;
      const lon = longitude * degrees;
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      // SphereGeometry mirrors the texture's east-west axis, so east longitudes use -z.
      marker.position.set(Math.cos(lat) * Math.cos(lon) * 1.035, Math.sin(lat) * 1.035, -Math.cos(lat) * Math.sin(lon) * 1.035);
      marker.userData.landmark = landmark;
      earthLandmarkMeshes.push(marker);
      markers.add(marker);
    });
    return markers;
  }
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
    if (body.name === 'Earth' || body.name === 'Moon') { mat.map = texture(body.name === 'Earth' ? '/earth.jpg' : '/moon.jpg'); mat.color.set('white'); }
    if (body.name === 'Sun') { mat.emissive.set('#ff9d25'); mat.emissiveIntensity = 2.2; }
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
    // Procedural variation gives the gas giants their cloud bands.
    if (body.name === 'Jupiter' || body.name === 'Saturn' || body.name === 'Mars' || body.name === 'Sun') {
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSurface;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSurface;').replace('#include <color_fragment>', `#include <color_fragment>\nfloat wave = sin(vSurface.y * ${body.name === 'Jupiter' ? '48.0' : '32.0'} + sin(vSurface.x * 15.0) * 0.9 + sin(vSurface.z * 18.0) * 0.7);\ndiffuseColor.rgb *= 0.8 + wave * 0.18;`);
      };
      mat.customProgramCacheKey = () => body.name;
    }
    materials.push(mat);
    const group = new THREE.Group(); scene.add(group);
    const axialTilt = new THREE.Group(); group.add(axialTilt);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.scale.setScalar(bodyRadius(body));
    if (body.name === 'Earth') axialTilt.rotation.x = -23.44 * degrees;
    else if (body.name === 'Uranus') axialTilt.rotation.z = 1.7;
    mesh.userData.name = body.name; axialTilt.add(mesh);
    if (body.name === 'Earth') {
      earthGridLine = earthGrid();
      mesh.add(earthGridLine);
      mesh.add(earthLandmarks());
    }
    const label = document.createElement('button');
    label.className = 'planet-label'; label.textContent = body.name;
    label.setAttribute('aria-label', `Focus ${body.name}`);
    label.onclick = () => { focus(body.name); onSelect(body.name); onLandmarkSelect(null); };
    host.appendChild(label);
    if (body.distance && body.name !== 'Moon') orbit(body);
    let ring: THREE.Mesh | null = null;
    if (body.name === 'Saturn') {
      const ringGeom = new THREE.RingGeometry(2.15, 3.5, 128, 6);
      const ringMat = new THREE.MeshStandardMaterial({ color: '#bca67b', side: THREE.DoubleSide, transparent: true, opacity: 0.7, roughness: 1 });
      ring = new THREE.Mesh(ringGeom, ringMat); ring.rotation.x = Math.PI / 2 - 0.4;
      group.add(ring); geometries.push(ringGeom); materials.push(ringMat);
    }
    // The lunar offset is anchored to the 2000-01-06 18:14 UTC new moon.
    const phase = body.name === 'Moon' ? 0.9573515073 : body.name === 'Earth' ? 357.529 * degrees : index * 2.399 + 0.6;
    return { body, group, mesh, ring, label, phase };
  });
  const earth = objects.find((item) => item.body.name === 'Earth')!;
  const moon = objects.find((item) => item.body.name === 'Moon')!;
  const moonPath = orbit(moon.body, earth.group);
  let lunarCoordinateDay = Number.NaN;
  let cachedLunarPhaseAngle = 0;
  let cachedLunarLatitude = 0;
  const lunarCoordinates = () => {
    if (days !== lunarCoordinateDay) {
      const date = new Date(J2000_EPOCH + days * 86_400_000);
      cachedLunarPhaseAngle = MoonPhase(date) * degrees;
      cachedLunarLatitude = EclipticGeoMoon(date).lat * degrees;
      lunarCoordinateDay = days;
    }
    return { phaseAngle: cachedLunarPhaseAngle, latitude: cachedLunarLatitude };
  };
  const moonPhase = () => {
    const angle = lunarCoordinates().phaseAngle;
    const illumination = (1 - Math.cos(angle)) / 2;
    const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
    return { illumination, name: phaseNames[Math.round(angle / (Math.PI / 4)) % phaseNames.length] };
  };
  const eclipseState = () => {
    const earthToSun = earth.group.position.clone().multiplyScalar(-1).normalize();
    const earthToMoon = moon.group.position.clone().sub(earth.group.position).normalize();
    const moonToSun = moon.group.position.clone().multiplyScalar(-1).normalize();
    const moonToEarth = earth.group.position.clone().sub(moon.group.position).normalize();
    const solarSeparation = earthToSun.angleTo(earthToMoon);
    const lunarSeparation = moonToSun.angleTo(moonToEarth);
    if (solarSeparation < 0.025) return { type: 'Solar eclipse', detail: 'The Moon is crossing between Earth and the Sun.' };
    if (lunarSeparation < 0.025) return { type: 'Lunar eclipse', detail: 'Earth is crossing between the Moon and the Sun.' };
    return null;
  };
  const sunGlowMat = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#ff9c38') } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform vec3 tint; void main(){float d=length(vUv-0.5)*2.0;float a=pow(max(0.0,1.0-d),3.5)*0.8;gl_FragColor=vec4(tint,a);}',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glowGeometry = new THREE.PlaneGeometry(23, 23);
  const glow = new THREE.Mesh(glowGeometry, sunGlowMat);
  scene.add(glow); geometries.push(glowGeometry); materials.push(sunGlowMat);
  let options: Options = { paused: false, speed: 12, orbits: true, labels: true, realScale: false };
  let days = (Date.now() - J2000_EPOCH) / 86_400_000;
  let selected: BodyName | null = null;
  let transition = false;
  let transitionThreshold = 0.03;
  const offset = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const destination = new THREE.Vector3();
  const delta = new THREE.Vector3();
  let width = 1, height = 1;
  function refreshOrbitLines() {
    paths.traverse((item) => {
      const body = item.userData.orbitBody as OrbitalBody | undefined;
      if (!body || !(item instanceof THREE.LineLoop)) return;
      const attribute = item.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 256; i++) {
        const point = orbitalPosition(body, i / 256 * Math.PI * 2);
        attribute.setXYZ(i, point.x, point.y, point.z);
      }
      attribute.needsUpdate = true; item.geometry.computeBoundingSphere();
    });
    const moonAttribute = moonPath.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 256; i++) {
      const point = orbitalPosition(moon.body, i / 256 * Math.PI * 2);
      moonAttribute.setXYZ(i, point.x, point.y, point.z);
    }
    moonAttribute.needsUpdate = true; moonPath.geometry.computeBoundingSphere();
  }
  function focus(name: BodyName | null) {
    selected = name;
    const item = objects.find((obj) => obj.body.name === name);
    const radius = item ? bodyRadius(item.body) : 0;
    camera.near = item && realScale ? Math.max(radius * 0.08, 0.00001) : 0.1;
    camera.updateProjectionMatrix();
    const preferredDistance = item
      ? realScale
        ? Math.max(radius * 8, 0.001)
        : Math.max(item.body.radius * 7, 4)
      : home.length();
    const distance = item ? Math.min(camera.position.distanceTo(controls.target), preferredDistance) : home.length();
    transitionThreshold = Math.min(0.03, Math.max(distance * 0.005, 0.000001));
    controls.minDistance = item ? Math.max(radius * 1.8, camera.near * 2.5) : 5;
    offset.set(0.4, 0.6, 1).normalize().multiplyScalar(distance);
    if (!item) offset.copy(home).multiplyScalar(width < 700 ? 1.4 : 1);
    transition = true;
    lastTarget.copy(item ? item.group.position : origin);
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
  const pointerDown = (event: PointerEvent) => start.set(event.clientX, event.clientY);
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const rect = setPointerFromEvent(event);
    const hit = earthGridLine ? raycaster.intersectObject(earthGridLine, false)[0] : undefined;
    if (!hit) { gridTooltip.hidden = true; return; }
    const local = earth.mesh.worldToLocal(hit.point.clone()).normalize();
    const cameraDirection = earth.mesh.worldToLocal(camera.position.clone()).sub(local).normalize();
    if (local.dot(cameraDirection) <= 0) { gridTooltip.hidden = true; return; }
    const latitude = Math.asin(THREE.MathUtils.clamp(local.y, -1, 1)) / degrees;
    const longitude = THREE.MathUtils.euclideanModulo(Math.atan2(-local.z, local.x) / degrees + 180, 360) - 180;
    const nearestLatitude = Math.round(latitude / 30) * 30;
    const nearestLongitude = Math.round(longitude / 30) * 30;
    const latitudeDelta = Math.abs(latitude - nearestLatitude);
    const longitudeDelta = Math.abs(longitude - nearestLongitude);
    const showLatitude = Math.abs(nearestLatitude) <= 60 && latitudeDelta <= longitudeDelta;
    const value = showLatitude ? nearestLatitude : nearestLongitude;
    const suffix = value === 0 || (!showLatitude && Math.abs(value) === 180) ? '' : showLatitude ? value > 0 ? ' N' : ' S' : value > 0 ? ' E' : ' W';
    gridTooltip.textContent = `${Math.abs(value)}°${suffix} ${showLatitude ? 'latitude' : 'longitude'}`;
    const measurement = document.createElement('span');
    const isLargest = showLatitude && value === 0;
    const isSmallest = !showLatitude && THREE.MathUtils.euclideanModulo(value, 180) === 0;
    measurement.className = isLargest ? 'largest' : isSmallest ? 'smallest' : '';
    measurement.textContent = showLatitude
      ? `${isLargest ? 'Largest circumference (equator)' : 'Parallel circumference'} · ${parallelCircumferenceKm(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} km`
      : `${isSmallest ? 'Smallest measured meridian loop' : 'Approx. terrain surface loop'} · ${physicalMeridianLengthKm(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
    gridTooltip.appendChild(measurement);
    gridTooltip.style.left = `${event.clientX - rect.left + 14}px`;
    gridTooltip.style.top = `${event.clientY - rect.top + 14}px`;
    gridTooltip.hidden = false;
  };
  const pointerLeave = () => { gridTooltip.hidden = true; };
  const pointerUp = (event: PointerEvent) => {
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
  const contextLost = (event: Event) => { event.preventDefault(); options.paused = true; onError('The graphics connection was interrupted. Reload the page to restart the model.'); };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerleave', pointerLeave);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  let previous = performance.now();
  let firstFrame = true;
  renderer.setAnimationLoop((now) => {
    const elapsed = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden && !options.paused) days += elapsed * options.speed;
    objects.forEach(({ body, group, mesh, ring, phase, label }) => {
      const angle = body.period ? days / body.period * Math.PI * 2 + phase : 0;
      if (body.distance) group.position.copy(orbitalPosition(body, angle));
      if (body.name === 'Moon') {
        const { phaseAngle, latitude } = lunarCoordinates();
        const radius = orbitRadius(body);
        group.position.copy(earth.group.position).multiplyScalar(-1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -phaseAngle);
        group.position.multiplyScalar(Math.cos(latitude));
        group.position.y = Math.sin(latitude);
        group.position.multiplyScalar(radius).add(earth.group.position);
        mesh.rotation.y = -phaseAngle;
      } else mesh.rotation.y = days / body.rotationPeriod * Math.PI * 2;
      mesh.scale.setScalar(bodyRadius(body));
      ring?.scale.setScalar(bodyRadius(body) / body.radius);
      label.classList.toggle('selected', selected === body.name);
    });
    lunarShadowUniforms.uEarthPosition.value.copy(earth.group.position);
    lunarShadowUniforms.uEarthRadius.value = bodyRadius(earth.body);
    lunarShadowUniforms.uSunRadius.value = bodyRadius(objects[0].body);
    const { phaseAngle, latitude } = lunarCoordinates();
    const eclipseSeparation = Math.acos(THREE.MathUtils.clamp(Math.cos(latitude) * Math.cos(phaseAngle - Math.PI), -1, 1));
    // Physical angular limits as seen from the Moon: the inner value covers a
    // total eclipse of the lunar disc; the outer value includes the penumbra.
    const eclipseBlend = THREE.MathUtils.smoothstep(eclipseSeparation / degrees, 0.42, 1.48);
    lunarShadowUniforms.uEclipseStrength.value = 1 - eclipseBlend;
    const target = objects.find((item) => item.body.name === selected)?.group.position;
    desired.copy(target ?? origin);
    if (transition) {
      const factor = 1 - Math.exp(-elapsed * 5);
      controls.target.lerp(desired, factor);
      destination.copy(desired).add(offset);
      camera.position.lerp(destination, factor);
      if (camera.position.distanceTo(destination) < transitionThreshold) transition = false;
    } else if (target) {
      camera.position.add(delta.copy(desired).sub(lastTarget)); controls.target.copy(desired);
    }
    lastTarget.copy(desired);
    paths.visible = options.orbits; moonPath.visible = options.orbits;
    controls.update(); glow.quaternion.copy(camera.quaternion); renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; onReady(); }
    objects.forEach(({ body, group, label }) => {
      projected.copy(group.position); projected.y += body.radius + 0.55; projected.project(camera);
      const visible = options.labels && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
      label.hidden = !visible;
      if (visible) label.style.transform = `translate(-50%, -100%) translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px)`;
    });
  });
  return {
    focus,
    setOptions(next: Options) { if (next.realScale !== options.realScale) { realScale = next.realScale; refreshOrbitLines(); focus(null); } options = next; },
    setDate(date: Date) { days = (date.getTime() - J2000_EPOCH) / 86_400_000; },
    getDate() { return new Date(J2000_EPOCH + days * 86_400_000); },
    getMoonPhase: moonPhase,
    getEclipseState: eclipseState,
    reset() { days = (Date.now() - J2000_EPOCH) / 86_400_000; focus(null); },
    dispose() {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose();
      mobileMedia.removeEventListener('change', updateTouchAction);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); textures.forEach((item) => item.dispose());
      objects.forEach((item) => item.label.remove()); gridTooltip.remove(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
