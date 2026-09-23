import * as THREE from 'three';
import { Body, Ecliptic, GeoMoon, GeoVector } from 'astronomy-engine';
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
  let sunCos = 1;
  let sunSin = 0;

  const updateBasis = (date: Date) => {
    const sun = Ecliptic(GeoVector(Body.Sun, date, true)).vec;
    const sunLongitude = Math.atan2(sun.y, sun.x);
    sunCos = Math.cos(sunLongitude);
    sunSin = Math.sin(sunLongitude);
    sceneSun.copy(earthPosition).negate().normalize();
    sceneTangential.crossVectors(sceneUp, sceneSun).normalize();
  };
  const moonOffset = (date: Date, target: THREE.Vector3) => {
    const moon = Ecliptic(GeoMoon(date)).vec;
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

export function writeMoonOrbitPath(date: Date, mapper: MoonOrbitMapper, compressedRadius: number | null, attribute: THREE.BufferAttribute): void {
  const point = new THREE.Vector3();
  const count = attribute.count;
  mapper.updateBasis(date);
  for (let index = 0; index < count; index++) {
    const sampleDate = new Date(date.getTime() + (index / count - 0.5) * SIDEREAL_MONTH_DAYS * DAY_MS);
    mapper.moonOffset(sampleDate, point);
    if (compressedRadius !== null) point.setLength(compressedRadius);
    attribute.setXYZ(index, point.x, point.y, point.z);
  }
  attribute.needsUpdate = true;
}
