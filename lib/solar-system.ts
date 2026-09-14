import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bodies, type BodyName } from './solar-data';

export type SolarSystem = ReturnType<typeof createSolarSystem>;
type Options = { paused: boolean; speed: number; orbits: boolean; labels: boolean };
const J2000_EPOCH = Date.UTC(2000, 0, 1, 12);

export function createSolarSystem(host: HTMLDivElement, onSelect: (name: BodyName | null) => void, onError: (message: string) => void, onReady: () => void) {
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
  if (mobileMedia.addEventListener) mobileMedia.addEventListener('change', updateTouchAction);
  else mobileMedia.addListener(updateTouchAction);
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
  const orbitalPosition = (body: OrbitalBody, meanAnomaly: number, target = new THREE.Vector3()) => {
    // Kepler's equation preserves the faster sweep through periapsis.
    let eccentricAnomaly = meanAnomaly;
    for (let i = 0; i < 6; i++) eccentricAnomaly -= (eccentricAnomaly - body.eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - body.eccentricity * Math.cos(eccentricAnomaly));
    const x = body.distance * (Math.cos(eccentricAnomaly) - body.eccentricity);
    const z = body.distance * Math.sqrt(1 - body.eccentricity ** 2) * Math.sin(eccentricAnomaly);
    target.set(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), body.periapsis * degrees).applyAxisAngle(new THREE.Vector3(1, 0, 0), body.inclination * degrees);
    return target;
  };
  function orbit(body: OrbitalBody, parent: THREE.Object3D = paths) {
    const points = Array.from({ length: 256 }, (_, i) => orbitalPosition(body, i / 256 * Math.PI * 2));
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x75829c, transparent: true, opacity: 0.23 });
    const line = new THREE.LineLoop(geom, mat);
    parent.add(line); geometries.push(geom); materials.push(mat);
    return line;
  }
  const objects = bodies.map((body, index) => {
    const mat = new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.95 });
    if (body.name === 'Earth' || body.name === 'Moon') { mat.map = texture(body.name === 'Earth' ? '/earth.jpg' : '/moon.jpg'); mat.color.set('white'); }
    if (body.name === 'Sun') { mat.emissive.set('#ff9d25'); mat.emissiveIntensity = 2.2; }
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
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.scale.setScalar(body.radius);
    mesh.rotation.z = body.name === 'Earth' ? 0.409 : body.name === 'Uranus' ? 1.7 : 0;
    mesh.userData.name = body.name; group.add(mesh);
    const label = document.createElement('button');
    label.className = 'planet-label'; label.textContent = body.name;
    label.setAttribute('aria-label', `Focus ${body.name}`);
    label.onclick = () => { focus(body.name); onSelect(body.name); };
    host.appendChild(label);
    if (body.distance && body.name !== 'Moon') orbit(body);
    if (body.name === 'Saturn') {
      const ringGeom = new THREE.RingGeometry(2.15, 3.5, 128, 6);
      const ringMat = new THREE.MeshStandardMaterial({ color: '#bca67b', side: THREE.DoubleSide, transparent: true, opacity: 0.7, roughness: 1 });
      const ring = new THREE.Mesh(ringGeom, ringMat); ring.rotation.x = Math.PI / 2 - 0.4;
      group.add(ring); geometries.push(ringGeom); materials.push(ringMat);
    }
    return { body, group, mesh, label, phase: index * 2.399 + 0.6 };
  });
  const earth = objects.find((item) => item.body.name === 'Earth')!;
  const moon = objects.find((item) => item.body.name === 'Moon')!;
  const moonPath = orbit(moon.body, earth.group);
  const moonPhase = () => {
    const moonToSun = moon.group.position.clone().multiplyScalar(-1).normalize();
    const moonToEarth = earth.group.position.clone().sub(moon.group.position).normalize();
    const illumination = (1 + moonToSun.dot(moonToEarth)) / 2;
    const earthToSun = earth.group.position.clone().multiplyScalar(-1).normalize();
    const earthToMoon = moon.group.position.clone().sub(earth.group.position).normalize();
    const angle = (Math.atan2(-new THREE.Vector3(0, 1, 0).dot(earthToSun.cross(earthToMoon)), earthToSun.dot(earthToMoon)) + Math.PI * 2) % (Math.PI * 2);
    const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
    return { illumination, name: phaseNames[Math.round(angle / (Math.PI / 4)) % phaseNames.length] };
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
  let options: Options = { paused: false, speed: 12, orbits: true, labels: true };
  let days = (Date.now() - J2000_EPOCH) / 86_400_000;
  let selected: BodyName | null = null;
  let transition = false;
  const offset = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const destination = new THREE.Vector3();
  const delta = new THREE.Vector3();
  let width = 1, height = 1;
  function focus(name: BodyName | null) {
    selected = name;
    const item = objects.find((obj) => obj.body.name === name);
    const distance = item ? name === 'Earth' ? 10 : Math.max(item.body.radius * 7, 4) : home.length();
    controls.minDistance = item ? item.body.radius * 1.8 : 5;
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
  const pointerDown = (event: PointerEvent) => start.set(event.clientX, event.clientY);
  const pointerUp = (event: PointerEvent) => {
    if (start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(objects.map((obj) => obj.mesh))[0];
    if (hit) { const name = hit.object.userData.name as BodyName; focus(name); onSelect(name); }
  };
  const contextLost = (event: Event) => { event.preventDefault(); options.paused = true; onError('The graphics connection was interrupted. Reload the page to restart the model.'); };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  let previous = performance.now();
  let firstFrame = true;
  renderer.setAnimationLoop((now) => {
    const elapsed = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden && !options.paused) days += elapsed * options.speed;
    objects.forEach(({ body, group, mesh, phase, label }) => {
      const angle = body.period ? days / body.period * Math.PI * 2 + phase : 0;
      if (body.distance) group.position.copy(orbitalPosition(body, angle));
      if (body.name === 'Moon') { group.position.add(earth.group.position); mesh.rotation.y = -angle; }
      else mesh.rotation.y = days / body.rotationPeriod * Math.PI * 2;
      label.classList.toggle('selected', selected === body.name);
    });
    const target = objects.find((item) => item.body.name === selected)?.group.position;
    desired.copy(target ?? origin);
    if (transition) {
      const factor = 1 - Math.exp(-elapsed * 5);
      controls.target.lerp(desired, factor);
      destination.copy(desired).add(offset);
      camera.position.lerp(destination, factor);
      if (camera.position.distanceTo(destination) < 0.03) transition = false;
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
    setOptions(next: Options) { options = next; },
    setDate(date: Date) { days = (date.getTime() - J2000_EPOCH) / 86_400_000; },
    getDate() { return new Date(J2000_EPOCH + days * 86_400_000); },
    getMoonPhase: moonPhase,
    reset() { days = (Date.now() - J2000_EPOCH) / 86_400_000; focus(null); },
    dispose() {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose();
      if (mobileMedia.removeEventListener) mobileMedia.removeEventListener('change', updateTouchAction);
      else mobileMedia.removeListener(updateTouchAction);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); textures.forEach((item) => item.dispose());
      objects.forEach((item) => item.label.remove()); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
