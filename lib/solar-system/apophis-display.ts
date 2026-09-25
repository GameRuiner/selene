import { findBody, type SolarBody } from '../solar-data';
import { bodyRadius } from './orbit-math';

const earth = findBody('Earth');
const apophis = findBody('Apophis');
const enlargedRadii = earth.radius + apophis.radius;
const earthPhysicalRadius = bodyRadius(earth, true);

// Shrink the meshes before their enlarged silhouettes could overlap. The
// close-up uses Earth and Moon's physical radii and an enlarged asteroid marker.
// Positions, direction, speed, and the closest-approach date stay untouched.
export function apophisEncounterDisplayBlend(separation: number): number {
  const fraction = Math.max(0, Math.min(1, (separation / enlargedRadii - 1.2) / 0.8));
  return fraction * fraction * (3 - 2 * fraction);
}

export function apophisEncounterBodyRadius(body: SolarBody, separation: number, realScale: boolean): number {
  const normalRadius = bodyRadius(body, realScale);
  if (realScale || (body.name !== 'Earth' && body.name !== 'Moon' && body.name !== 'Apophis')) return normalRadius;
  const blend = apophisEncounterDisplayBlend(separation);
  const encounterRadius = body.name !== 'Apophis'
    ? bodyRadius(body, true)
    : Math.min(normalRadius, Math.max(earthPhysicalRadius * 0.08, separation * 0.015));
  return encounterRadius + (normalRadius - encounterRadius) * blend;
}
