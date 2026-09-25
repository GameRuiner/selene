import { describe, expect, it } from 'vitest';
import { bodies, findBody, isSatellite } from '../lib/solar-data';
import { formatKilometers } from '../lib/formatters';

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
  it('catalogs Apophis as a small near-Earth asteroid without an invented mass', () => {
    const apophis = findBody('Apophis');
    expect(apophis.kind).toBe('NEAR-EARTH ASTEROID');
    expect(isSatellite(apophis)).toBe(false);
    expect(apophis.massKg).toBeNull();
    expect(formatKilometers(apophis.physicalRadiusKm * 2)).toBe('340 m');
  });
});
