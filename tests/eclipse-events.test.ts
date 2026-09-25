import { describe, expect, it } from 'vitest';
import { eventPlaybackDate, eventsForYear, sameLocalDay } from '../lib/astronomy/events';
import { moonPhaseFromAngle, lunarEclipseStrength, classifySceneEclipse } from '../lib/astronomy/moon';
import * as THREE from 'three';
import { Observer, SearchLocalSolarEclipse } from 'astronomy-engine';
import { findBody } from '../lib/solar-data';
import { dateToSimulationDays } from '../lib/astronomy/time';
import { bodyRadius, initialOrbitalPhase, orbitalAngle, orbitalPosition } from '../lib/solar-system/orbit-math';
import { createCelestialMapper } from '../lib/solar-system/celestial-mapper';

describe('astronomy events and lunar state', () => {
  it('lists the Apophis encounter once with a six-hour playback lead-in', () => {
    const events = eventsForYear(2029);
    const flybys = events.filter((event) => event.kind === 'asteroid-flyby');
    expect(flybys).toHaveLength(1);
    const flyby = flybys[0];
    expect(flyby.label).toBe('Apophis Earth flyby');
    expect(flyby.date.toISOString()).toBe('2029-04-13T21:46:00.000Z');
    expect(eventPlaybackDate(flyby).toISOString()).toBe('2029-04-13T15:46:00.000Z');
    expect(flyby.date.getTime() - eventPlaybackDate(flyby).getTime()).toBe(6 * 3_600_000);
    expect(sameLocalDay(flyby.date, new Date(flyby.date.getFullYear(), flyby.date.getMonth(), flyby.date.getDate()))).toBe(true);
    expect(events.every((event, index) => index === 0 || events[index - 1].date <= event.date)).toBe(true);
    for (const year of [2028, 2030]) expect(eventsForYear(year).some((event) => event.kind === 'asteroid-flyby')).toBe(false);
    const equinox = events.find((event) => event.kind === 'equinox')!;
    expect(eventPlaybackDate(equinox)).toBe(equinox.date);
  });
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
  it('opens the August 2026 total eclipse before local first contact in Reykjavík', () => {
    const event = eventsForYear(2026).find((item) => item.kind === 'solar-eclipse' && item.date.getUTCMonth() === 7);
    expect(event?.observation?.location.label).toBe('Reykjavík');
    expect(event?.observation?.location.timeZone).toBe('Atlantic/Reykjavik');
    const location = event!.observation!.location;
    const local = SearchLocalSolarEclipse(new Date('2026-08-01T00:00:00Z'), new Observer(location.latitude, location.longitude, 0));
    expect(event!.observation!.date.getTime()).toBe(local.partial_begin.time.date.getTime() - 5 * 60_000);
    expect(eventPlaybackDate(event!).getTime()).toBe(local.partial_begin.time.date.getTime() - 5 * 60_000);
    expect(event!.observation!.date.getTime()).toBeLessThan(local.peak.time.date.getTime());
    expect(local.partial_end.time.date.getTime()).toBeGreaterThan(local.peak.time.date.getTime());
    expect(Math.abs(local.peak.time.date.getTime() - Date.parse('2026-08-12T17:48:30Z'))).toBeLessThan(120_000);
    const warsaw = SearchLocalSolarEclipse(new Date('2026-08-01T00:00:00Z'), new Observer(52.2297, 21.0122, 0));
    expect(warsaw.kind).toBe('partial');

    const earth = findBody('Earth');
    const date = local.peak.time.date;
    const days = dateToSimulationDays(date);
    const earthPosition = orbitalPosition(earth, orbitalAngle(earth, days, initialOrbitalPhase(earth, 3)), true);
    const sceneNorth = new THREE.Vector3(0, Math.cos(23.44 * Math.PI / 180), -Math.sin(23.44 * Math.PI / 180));
    const origin = new THREE.Vector3();
    const mapper = createCelestialMapper({ earthPosition, sceneNorth, origin, sceneAU: 14 });
    const surfaceNormal = mapper.observerPosition(date, location.latitude, location.longitude, new THREE.Vector3());
    const cameraPosition = earthPosition.clone().addScaledVector(surfaceNormal, bodyRadius(earth, true) * 1.002);
    const moonPosition = mapper.moonPosition(date, new THREE.Vector3());
    const sunDirection = origin.clone().sub(cameraPosition).normalize();
    const moonDirection = moonPosition.sub(cameraPosition).normalize();
    expect(sunDirection.angleTo(moonDirection) * 180 / Math.PI).toBeLessThan(0.15);
  });
});
