import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { findBody } from '../lib/solar-data';
import { dateToSimulationDays } from '../lib/astronomy/time';
import { createMoonOrbitMapper, writeMoonOrbitPath } from '../lib/solar-system/moon-orbit';
import { initialOrbitalPhase, orbitalAngle, orbitalPosition, orbitRadius } from '../lib/solar-system/orbit-math';

function orbitAt(date: Date, realScale: boolean) {
  const earth = findBody('Earth');
  const days = dateToSimulationDays(date);
  const earthPosition = orbitalPosition(earth, orbitalAngle(earth, days, initialOrbitalPhase(earth, 3)), realScale);
  const mapper = createMoonOrbitMapper(earthPosition);
  const attribute = new THREE.Float32BufferAttribute(256 * 3, 3);
  const compressedRadius = realScale ? null : orbitRadius(findBody('Moon'), false);
  writeMoonOrbitPath(date, mapper, compressedRadius, attribute);
  const moon = mapper.moonPosition(date, new THREE.Vector3()).sub(earthPosition);
  if (compressedRadius !== null) moon.setLength(compressedRadius);
  return { attribute, moon };
}

describe('Moon orbit path', () => {
  it.each(['2026-08-12T17:48:37Z', '2026-09-23T12:00:00Z'])('passes through the Moon on %s at both display scales', (value) => {
    for (const realScale of [false, true]) {
      const { attribute, moon } = orbitAt(new Date(value), realScale);
      const center = new THREE.Vector3().fromBufferAttribute(attribute, 128);
      expect(center.distanceTo(moon)).toBeLessThan(1e-6);
    }
  });

  it('uses a tilted, date-dependent lunar orbital plane', () => {
    const normals = ['2026-08-12T17:48:37Z', '2035-08-12T17:48:37Z'].map((value) => {
      const { attribute } = orbitAt(new Date(value), false);
      const quarter = new THREE.Vector3().fromBufferAttribute(attribute, 64);
      const center = new THREE.Vector3().fromBufferAttribute(attribute, 128);
      const later = new THREE.Vector3().fromBufferAttribute(attribute, 192);
      return quarter.sub(center).cross(later.sub(center)).normalize();
    });
    const tilt = Math.acos(Math.abs(normals[0].dot(new THREE.Vector3(0, 1, 0)))) * 180 / Math.PI;
    expect(tilt).toBeGreaterThan(3);
    expect(tilt).toBeLessThan(7);
    expect(normals[0].angleTo(normals[1])).toBeGreaterThan(0.05);
  });
});
