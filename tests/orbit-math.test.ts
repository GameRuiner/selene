import { describe, expect, it } from 'vitest';
import { findBody } from '../lib/solar-data';
import { bodyRadius, orbitRadius, orbitalPosition } from '../lib/solar-system/orbit-math';

describe('orbit math', () => {
  it('converts compressed and true scale for Earth, Moon, and a dwarf planet', () => {
    expect(orbitRadius(findBody('Earth'), false)).toBe(14);
    expect(orbitRadius(findBody('Earth'), true)).toBe(14);
    expect(orbitRadius(findBody('Moon'), false)).toBe(2.3);
    expect(orbitRadius(findBody('Moon'), false)).toBeGreaterThan(2 * bodyRadius(findBody('Earth'), false));
    expect(orbitRadius(findBody('Moon'), true)).toBeCloseTo(0.03596, 4);
    expect(orbitRadius(findBody('Eris'), false)).toBe(91);
    expect(orbitRadius(findBody('Eris'), true)).toBeCloseTo(67.9 * 14, 8);
    expect(bodyRadius(findBody('Earth'), false)).toBe(0.9);
    expect(bodyRadius(findBody('Earth'), true)).toBeCloseTo(14 / 23_455);
  });
  it('solves periapsis and preserves inclined ascending node vectors', () => {
    const ceres = findBody('Ceres');
    const periapsis = orbitalPosition(ceres, 0);
    expect(periapsis.length()).toBeCloseTo(ceres.distance * (1 - ceres.eccentricity));
    const point = orbitalPosition(ceres, Math.PI / 3);
    expect(point.y).not.toBe(0);
    expect(point.length()).toBeGreaterThan(0);
  });
});
