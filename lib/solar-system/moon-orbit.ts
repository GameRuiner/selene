import * as THREE from 'three';
import { Body, GeoMoon, GeoVector, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine';
import { DAY_MS } from '../astronomy/time';
import { SCENE_AU } from './orbit-math';

// A sidereal revolution keeps the ends of the ephemeris trace nearly together.
const SIDEREAL_MONTH_DAYS = 27.321661;

export type MoonOrbitMapper = {
  updateBasis(date: Date): void;
  moonOffset(date: Date, target: THREE.Vector3): THREE.Vector3;
  moonPosition(date: Date, target: THREE.Vector3): THREE.Vector3;
};

export function createMoonOrbitMapper(earthPosition: THREE.Vector3): MoonOrbitMapper {
  const sceneSun = new THREE.Vector3();
  const sceneTangential = new THREE.Vector3();
  const sceneUp = new THREE.Vector3(0, 1, 0);
  // Match the geometric J2000 ecliptic frame used by Apophis's Horizons data.
  const rotation = Rotation_EQJ_ECL();
  let sunCos = 1;
  let sunSin = 0;

  const updateBasis = (date: Date) => {
    const sun = RotateVector(rotation, GeoVector(Body.Sun, date, false));
    const sunLongitude = Math.atan2(sun.y, sun.x);
    sunCos = Math.cos(sunLongitude);
    sunSin = Math.sin(sunLongitude);
    sceneSun.copy(earthPosition).negate().normalize();
    sceneTangential.crossVectors(sceneSun, sceneUp).normalize();
  };
  const moonOffset = (date: Date, target: THREE.Vector3) => {
    const moon = RotateVector(rotation, GeoMoon(date));
    const radial = moon.x * sunCos + moon.y * sunSin;
    const tangential = -moon.x * sunSin + moon.y * sunCos;
    return target.copy(sceneSun).multiplyScalar(radial)
      .addScaledVector(sceneTangential, tangential)
      .addScaledVector(sceneUp, moon.z).multiplyScalar(SCENE_AU);
  };
  return {
    updateBasis,
    moonOffset,
    moonPosition(date, target) { updateBasis(date); return moonOffset(date, target).add(earthPosition); },
  };
}

export function moonDisplayDistance(physicalDistance: number, compressedRadius: number, displayBlend: number): number {
  return physicalDistance + (compressedRadius - physicalDistance) * displayBlend;
}

export function writeMoonOrbitPath(date: Date, mapper: MoonOrbitMapper, compressedRadius: number | null, attribute: THREE.BufferAttribute, displayBlend = 1): void {
  const point = new THREE.Vector3();
  const count = attribute.count;
  mapper.updateBasis(date);
  for (let index = 0; index < count; index++) {
    const sampleDate = new Date(date.getTime() + (index / count - 0.5) * SIDEREAL_MONTH_DAYS * DAY_MS);
    mapper.moonOffset(sampleDate, point);
    if (compressedRadius !== null) point.setLength(moonDisplayDistance(point.length(), compressedRadius, displayBlend));
    attribute.setXYZ(index, point.x, point.y, point.z);
  }
  attribute.needsUpdate = true;
}
