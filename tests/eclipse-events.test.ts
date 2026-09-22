import { describe, expect, it } from 'vitest';
import { eventsForYear, sameLocalDay } from '../lib/astronomy/events';
import { moonPhaseFromAngle, lunarEclipseStrength, classifySceneEclipse } from '../lib/astronomy/moon';
import * as THREE from 'three';

describe('astronomy events and lunar state', () => {
  it('names cardinal lunar phases and classifies aligned scene eclipses', () => {
    expect([0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => moonPhaseFromAngle(angle).name)).toEqual(['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter']);
    expect(classifySceneEclipse(new THREE.Vector3(2, 0, 0), new THREE.Vector3(1, 0, 0))?.type).toBe('Solar eclipse');
    expect(classifySceneEclipse(new THREE.Vector3(2, 0, 0), new THREE.Vector3(3, 0, 0))?.type).toBe('Lunar eclipse');
    expect(classifySceneEclipse(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 2, 0))).toBeNull();
  });
  it('keeps penumbral shadow boundaries and ordered 2024 events', () => {
    expect(lunarEclipseStrength({ phaseAngle: Math.PI, latitude: 0 })).toBe(1);
    expect(lunarEclipseStrength({ phaseAngle: Math.PI - 0.42 * Math.PI / 180, latitude: 0 })).toBeCloseTo(1);
    expect(lunarEclipseStrength({ phaseAngle: Math.PI - 1.48 * Math.PI / 180, latitude: 0 })).toBeCloseTo(0);
    const events = eventsForYear(2024);
    expect(events.every((event, index) => index === 0 || events[index - 1].date <= event.date)).toBe(true);
    expect(events.filter((event) => ['equinox', 'solstice'].includes(event.kind))).toHaveLength(4);
    expect(events.some((event) => event.kind === 'solar-eclipse')).toBe(true);
    expect(events.some((event) => event.kind === 'lunar-eclipse')).toBe(true);
    expect(events.some((event) => event.kind === 'lunar-eclipse' && sameLocalDay(event.date, new Date(2024, 2, 25)))).toBe(true);
    expect(eventsForYear(2026).some((event) => event.kind === 'lunar-eclipse' && sameLocalDay(event.date, new Date(2026, 2, 3)))).toBe(true);
    expect(sameLocalDay(new Date(2024, 0, 2, 23), new Date(2024, 0, 2, 1))).toBe(true);
  });
});
