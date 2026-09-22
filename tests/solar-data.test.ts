import { describe, expect, it } from 'vitest';
import { bodies, findBody, isSatellite } from '../lib/solar-data';

describe('solar catalog', () => {
  it('keeps retrograde rotations and classifies satellites', () => {
    expect(findBody('Venus').rotationPeriod).toBeLessThan(0);
    expect(findBody('Uranus').rotationPeriod).toBeLessThan(0);
    expect(findBody('Pluto').rotationPeriod).toBeLessThan(0);
    expect(findBody('Triton').rotationPeriod).toBeLessThan(0);
    expect(isSatellite(findBody('Moon'))).toBe(true);
    expect(isSatellite(findBody('Earth'))).toBe(false);
    expect(bodies.length).toBeGreaterThan(30);
  });
});
