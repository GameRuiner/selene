import * as THREE from 'three';
import meridianData from '../earth-meridian-lengths.json';
import type { Landmark } from './types';
import type { ResourceRegistry } from './resources';

const degrees = Math.PI / 180;
const WGS84_SEMI_MAJOR_METERS = 6_378_137;
const WGS84_INVERSE_FLATTENING = 298.257223563;
const WGS84_MERIDIONAL_CIRCUMFERENCE_KM = 40_007.863;
const terrainMeridianLengthKm = new Map(meridianData.loops.map((loop) => [loop.orientationDegrees, loop.lengthKm]));

export const EARTH_LANDMARKS: Landmark[] = [
  { name: 'Stonehenge', location: 'Wiltshire, England', latitude: 51.1789, longitude: -1.8262, description: 'A prehistoric stone circle built in stages between roughly 3000 and 1600 BCE.' },
  { name: 'Great Pyramid of Giza', location: 'Giza, Egypt', latitude: 29.9792, longitude: 31.1342, description: 'The largest pyramid at Giza, built as the tomb of Pharaoh Khufu around 2600 BCE.' },
  { name: 'Machu Picchu', location: 'Cusco Region, Peru', latitude: -13.1631, longitude: -72.5459, description: 'A 15th-century Inca citadel set high in the eastern Andes.' },
];
export type EarthGridReading = { label: string; className: string; measurement: string };

export function parallelCircumferenceKm(latitudeDegrees: number): number {
  const flattening = 1 / WGS84_INVERSE_FLATTENING;
  const eccentricitySquared = 2 * flattening - flattening ** 2;
  const latitude = latitudeDegrees * degrees;
  const primeVerticalRadius = WGS84_SEMI_MAJOR_METERS / Math.sqrt(1 - eccentricitySquared * Math.sin(latitude) ** 2);
  return 2 * Math.PI * primeVerticalRadius * Math.cos(latitude) / 1_000;
}

export function physicalMeridianLengthKm(longitudeDegrees: number): number {
  const orientation = THREE.MathUtils.euclideanModulo(longitudeDegrees, 180);
  return terrainMeridianLengthKm.get(orientation) ?? WGS84_MERIDIONAL_CIRCUMFERENCE_KM;
}

export function createEarthGrid(registry: ResourceRegistry): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  const colors: number[] = [];
  const radius = 1.008, segments = 72;
  const gridColor = 0x718ca5, largestColor = 0xf2c96d, smallestColor = 0x74dec0;
  const addLine = (pointAt: (step: number) => THREE.Vector3, color: number) => {
    const lineColor = new THREE.Color(color);
    for (let step = 0; step < segments; step++) {
      points.push(pointAt(step), pointAt(step + 1));
      lineColor.toArray(colors, colors.length); lineColor.toArray(colors, colors.length);
    }
  };
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const lat = latitude * degrees;
    addLine((step) => { const longitude = step / segments * Math.PI * 2; return new THREE.Vector3(Math.cos(lat) * Math.cos(longitude) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.sin(longitude) * radius); }, latitude === 0 ? largestColor : gridColor);
  }
  for (let longitude = 0; longitude < 360; longitude += 30) {
    const lon = longitude * degrees;
    addLine((step) => { const lat = -Math.PI / 2 + step / segments * Math.PI; return new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.sin(lon) * radius); }, longitude === 0 || longitude === 180 ? smallestColor : gridColor);
  }
  const geometry = registry.geometry(new THREE.BufferGeometry().setFromPoints(points));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = registry.material(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.48, depthWrite: false }));
  return new THREE.LineSegments(geometry, material);
}

export function createEarthLandmarks(registry: ResourceRegistry): { group: THREE.Group; meshes: THREE.Mesh[] } {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const geometry = registry.geometry(new THREE.SphereGeometry(0.035, 12, 8));
  const material = registry.material(new THREE.MeshBasicMaterial({ color: '#d9e895', depthTest: true }));
  EARTH_LANDMARKS.forEach((landmark) => {
    const lat = landmark.latitude * degrees, lon = landmark.longitude * degrees;
    const marker = new THREE.Mesh(geometry, material);
    // SphereGeometry mirrors the texture's east-west axis, so east longitudes use -z.
    marker.position.set(Math.cos(lat) * Math.cos(lon) * 1.035, Math.sin(lat) * 1.035, -Math.cos(lat) * Math.sin(lon) * 1.035);
    marker.userData.landmark = landmark;
    meshes.push(marker); group.add(marker);
  });
  return { group, meshes };
}

export function readEarthGridAt(localPoint: THREE.Vector3): EarthGridReading {
  const local = localPoint.clone().normalize();
  const latitude = Math.asin(THREE.MathUtils.clamp(local.y, -1, 1)) / degrees;
  const longitude = THREE.MathUtils.euclideanModulo(Math.atan2(-local.z, local.x) / degrees + 180, 360) - 180;
  const nearestLatitude = Math.round(latitude / 30) * 30;
  const nearestLongitude = Math.round(longitude / 30) * 30;
  const latitudeDelta = Math.abs(latitude - nearestLatitude), longitudeDelta = Math.abs(longitude - nearestLongitude);
  const showLatitude = Math.abs(nearestLatitude) <= 60 && latitudeDelta <= longitudeDelta;
  const value = showLatitude ? nearestLatitude : nearestLongitude;
  const suffix = value === 0 || (!showLatitude && Math.abs(value) === 180) ? '' : showLatitude ? value > 0 ? ' N' : ' S' : value > 0 ? ' E' : ' W';
  const isLargest = showLatitude && value === 0;
  const isSmallest = !showLatitude && THREE.MathUtils.euclideanModulo(value, 180) === 0;
  const measurement = showLatitude
    ? `${isLargest ? 'Largest circumference (equator)' : 'Parallel circumference'} · ${parallelCircumferenceKm(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} km`
    : `${isSmallest ? 'Smallest measured meridian loop' : 'Approx. terrain surface loop'} · ${physicalMeridianLengthKm(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
  return { label: `${Math.abs(value)}°${suffix} ${showLatitude ? 'latitude' : 'longitude'}`, className: isLargest ? 'largest' : isSmallest ? 'smallest' : '', measurement };
}
