import * as THREE from 'three';
import { Body, GeoVector, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine';
import { APOPHIS_EPHEMERIS_END, APOPHIS_EPHEMERIS_START, apophisGeocentricPosition } from '../astronomy/apophis';
import { DAY_MS, dateToSimulationDays } from '../astronomy/time';
import { findBody } from '../solar-data';
import { SCENE_AU, initialOrbitalPhase, orbitalAngle, orbitalPosition } from './orbit-math';

const earth = findBody('Earth');
const apophis = findBody('Apophis');
const earthPhase = initialOrbitalPhase(earth, 3);
const eclipticRotation = Rotation_EQJ_ECL();
const UP = new THREE.Vector3(0, 1, 0);
const PATH_HALF_SPAN_DAYS = 160;
const FLYBY_TIME = Date.parse('2029-04-13T21:46:00Z');
const FLYBY_PATH_WINDOW_DAYS = 30;

export function usesFixedApophisFlybyPath(date: Date): boolean {
  return Math.abs(date.getTime() - FLYBY_TIME) <= FLYBY_PATH_WINDOW_DAYS * DAY_MS;
}

// Keep ten-minute segments through closest approach, then widen the spacing
// outside the encounter. A moving, date-centered path cuts the sharp turn
// near Earth whenever the selected date drifts away from the flyby.
function flybyPathOffsetDays(fraction: number): number {
  const distance = Math.abs(fraction);
  let days: number;
  if (distance <= 0.5625) days = 0.5 * distance / 0.5625;
  else if (distance <= 0.8125) days = 0.5 + 1.5 * (distance - 0.5625) / 0.25;
  else days = 2 + (PATH_HALF_SPAN_DAYS - 2) * ((distance - 0.8125) / 0.1875) ** 2;
  return Math.sign(fraction) * days;
}

export function createApophisSceneMapper() {
  const geocentric = new THREE.Vector3();
  const sceneSun = new THREE.Vector3();
  const sceneTangential = new THREE.Vector3();
  const sampleEarth = new THREE.Vector3();
  const point = new THREE.Vector3();

  // Body display sizes must never change the trajectory or encounter timing.
  const positionAt = (date: Date, earthPosition: THREE.Vector3, target: THREE.Vector3): boolean => {
    if (!apophisGeocentricPosition(date, geocentric)) return false;
    const sun = RotateVector(eclipticRotation, GeoVector(Body.Sun, date, false));
    const sunLength = Math.hypot(sun.x, sun.y);
    const sunCos = sun.x / sunLength, sunSin = sun.y / sunLength;
    sceneSun.copy(earthPosition).negate().normalize();
    // orbitalPosition advances from +X toward +Z. Match that orientation;
    // reversing this cross product reflects the orbit in a moving Sun axis.
    sceneTangential.crossVectors(sceneSun, UP).normalize();
    const radial = geocentric.x * sunCos + geocentric.y * sunSin;
    const tangential = -geocentric.x * sunSin + geocentric.y * sunCos;
    target.copy(sceneSun).multiplyScalar(radial)
      .addScaledVector(sceneTangential, tangential)
      .addScaledVector(UP, geocentric.z).multiplyScalar(SCENE_AU);
    target.add(earthPosition);
    return true;
  };

  const writePath = (date: Date, realScale: boolean, attribute: THREE.BufferAttribute) => {
    const flybyPath = usesFixedApophisFlybyPath(date);
    const time = flybyPath ? FLYBY_TIME : date.getTime();
    const before = Math.min(PATH_HALF_SPAN_DAYS, (time - APOPHIS_EPHEMERIS_START) / DAY_MS);
    const after = Math.min(PATH_HALF_SPAN_DAYS, (APOPHIS_EPHEMERIS_END - time) / DAY_MS);
    for (let index = 0; index < attribute.count; index++) {
      if (before < 0 || after < 0) {
        orbitalPosition(apophis, index / (attribute.count - 1) * Math.PI * 2, realScale, point);
      } else {
        const fraction = index / (attribute.count - 1) * 2 - 1;
        const offsetDays = flybyPath
          ? flybyPathOffsetDays(fraction)
          : Math.sign(fraction) * fraction * fraction * (fraction < 0 ? before : after);
        const sampleDate = new Date(time + offsetDays * DAY_MS);
        const days = dateToSimulationDays(sampleDate);
        orbitalPosition(earth, orbitalAngle(earth, days, earthPhase), realScale, sampleEarth);
        positionAt(sampleDate, sampleEarth, point);
      }
      attribute.setXYZ(index, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true;
  };

  return { positionAt, writePath };
}
