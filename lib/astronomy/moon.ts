import * as THREE from 'three';
import { EclipticGeoMoon, MoonPhase } from 'astronomy-engine';

const degrees = Math.PI / 180;
const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];

export type LunarCoordinates = { phaseAngle: number; latitude: number };
export type MoonPhaseState = { illumination: number; name: string };
export type EclipseState = { type: string; detail: string } | null;

export function lunarCoordinates(date: Date): LunarCoordinates {
  return { phaseAngle: MoonPhase(date) * degrees, latitude: EclipticGeoMoon(date).lat * degrees };
}

export function moonPhaseFromAngle(angle: number): MoonPhaseState {
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return { illumination: (1 - Math.cos(normalized)) / 2, name: phaseNames[Math.round(normalized / (Math.PI / 4)) % phaseNames.length] };
}

export function moonPhaseAt(date: Date): MoonPhaseState {
  return moonPhaseFromAngle(MoonPhase(date) * degrees);
}

export function lunarEclipseStrength(coordinates: LunarCoordinates): number {
  const separation = Math.acos(THREE.MathUtils.clamp(Math.cos(coordinates.latitude) * Math.cos(coordinates.phaseAngle - Math.PI), -1, 1)) / degrees;
  return 1 - THREE.MathUtils.smoothstep(separation, 0.42, 1.48);
}

export function classifySceneEclipse(earthPosition: THREE.Vector3, moonPosition: THREE.Vector3): EclipseState {
  const earthToSun = earthPosition.clone().multiplyScalar(-1).normalize();
  const earthToMoon = moonPosition.clone().sub(earthPosition).normalize();
  const moonToSun = moonPosition.clone().multiplyScalar(-1).normalize();
  const moonToEarth = earthPosition.clone().sub(moonPosition).normalize();
  if (earthToSun.angleTo(earthToMoon) < 0.025) return { type: 'Solar eclipse', detail: 'The Moon is crossing between Earth and the Sun.' };
  if (moonToSun.angleTo(moonToEarth) < 0.025) return { type: 'Lunar eclipse', detail: 'Earth is crossing between the Moon and the Sun.' };
  return null;
}
