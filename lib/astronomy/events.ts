import {
  Body, GeoMoon, GeoVector, KM_PER_AU, NextGlobalSolarEclipse, NextLunarEclipse, Observer, Search, SearchGlobalSolarEclipse, SearchLocalSolarEclipse, SearchLunarEclipse, Seasons,
} from 'astronomy-engine';
import { DAY_MS } from './time';
import type { ObserverLocation } from './observer';

export type AstronomyEventKind = 'equinox' | 'solstice' | 'solar-eclipse' | 'lunar-eclipse' | 'asteroid-flyby';
export type SolarEclipseObservation = { date: Date; location: ObserverLocation };
export type AstronomyEvent = { date: Date; kind: AstronomyEventKind; label: string; approximateStart?: boolean; observation?: SolarEclipseObservation; playbackDate?: Date };
export type SolarEclipseStart = { date: Date; approximate: boolean };
const MINUTE_MS = 60_000;
const SUN_RADIUS_KM = 695_700;
const MOON_MEAN_RADIUS_KM = 1_737.4;
const EARTH_MEAN_RADIUS_KM = 6_371;

export function eventPlaybackDate(event: AstronomyEvent): Date {
  return event.observation?.date ?? event.playbackDate ?? event.date;
}

export function sameLocalDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

export function solarEclipseStart(eclipse: ReturnType<typeof SearchGlobalSolarEclipse>): SolarEclipseStart {
  const contact = Search((time) => {
    const sun = GeoVector(Body.Sun, time, true);
    const moon = GeoMoon(time);
    const targetX = -moon.x, targetY = -moon.y, targetZ = -moon.z;
    const directionX = moon.x - sun.x, directionY = moon.y - sun.y, directionZ = moon.z - sun.z;
    const directionSquared = directionX ** 2 + directionY ** 2 + directionZ ** 2;
    const projection = (directionX * targetX + directionY * targetY + directionZ * targetZ) / directionSquared;
    const shadowDistance = KM_PER_AU * Math.hypot(projection * directionX - targetX, projection * directionY - targetY, projection * directionZ - targetZ);
    const penumbraRadius = -SUN_RADIUS_KM + (1 + projection) * (SUN_RADIUS_KM + MOON_MEAN_RADIUS_KM);
    return penumbraRadius + EARTH_MEAN_RADIUS_KM - shadowDistance;
  }, eclipse.peak.AddDays(-0.3), eclipse.peak);
  return contact ? { date: contact.date, approximate: false } : { date: new Date(eclipse.peak.date.getTime() - 150 * MINUTE_MS), approximate: true };
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

function solarEclipseObservation(eclipse: ReturnType<typeof SearchGlobalSolarEclipse>): SolarEclipseObservation | undefined {
  const peak = eclipse.peak.date;
  // NASA lists Reykjavík within the August 2026 path of totality; the Sun is well above the horizon there.
  // https://science.nasa.gov/eclipses/future-eclipses/total-solar-eclipse-on-august-12-2026/
  const reykjavik = peak.getUTCFullYear() === 2026 && peak.getUTCMonth() === 7 && peak.getUTCDate() === 12 && eclipse.kind === 'total';
  const location: ObserverLocation | undefined = reykjavik
    ? { label: 'Reykjavík', latitude: 64.1466, longitude: -21.9426, timeZone: 'Atlantic/Reykjavik' }
    : eclipse.latitude !== undefined && eclipse.longitude !== undefined
      ? { label: 'Eclipse center', latitude: eclipse.latitude, longitude: eclipse.longitude }
      : undefined;
  if (!location) return undefined;
  const local = SearchLocalSolarEclipse(eclipse.peak.AddDays(-1), new Observer(location.latitude, location.longitude, 0));
  if (local.kind !== eclipse.kind || local.peak.altitude <= 0 || Math.abs(local.peak.time.date.getTime() - peak.getTime()) > DAY_MS) return undefined;
  // Give the observer a moment before first contact so the whole local eclipse can play out.
  return { date: new Date(local.partial_begin.time.date.getTime() - 5 * MINUTE_MS), location };
}

export function eventsForYear(year: number): AstronomyEvent[] {
  const seasons = Seasons(year);
  const events: AstronomyEvent[] = [
    { date: seasons.mar_equinox.date, kind: 'equinox', label: 'March equinox' },
    { date: seasons.jun_solstice.date, kind: 'solstice', label: 'June solstice' },
    { date: seasons.sep_equinox.date, kind: 'equinox', label: 'September equinox' },
    { date: seasons.dec_solstice.date, kind: 'solstice', label: 'December solstice' },
  ];
  // Closest approach from JPL; six hours is a viewing lead-in, not a physical contact time.
  // https://ssd-api.jpl.nasa.gov/cad.api?des=99942&date-min=2029-04-13&date-max=2029-04-14
  const apophisClosest = new Date('2029-04-13T21:46:00Z');
  if (apophisClosest.getFullYear() === year) events.push({
    date: apophisClosest, kind: 'asteroid-flyby', label: 'Apophis Earth flyby',
    playbackDate: new Date(apophisClosest.getTime() - 6 * 60 * MINUTE_MS),
  });
  const searchStart = new Date(Date.UTC(year, 0, 1) - DAY_MS);
  const searchEnd = new Date(Date.UTC(year + 1, 0, 1) + DAY_MS);
  let solar = SearchGlobalSolarEclipse(searchStart);
  while (solar.peak.date < searchEnd) {
    const start = solarEclipseStart(solar);
    if (start.date.getFullYear() === year) events.push({ date: start.date, kind: 'solar-eclipse', label: `${capitalize(solar.kind)} solar eclipse`, approximateStart: start.approximate, observation: solarEclipseObservation(solar) });
    solar = NextGlobalSolarEclipse(solar.peak);
  }
  let lunar = SearchLunarEclipse(searchStart);
  while (lunar.peak.date < searchEnd) {
    const start = new Date(lunar.peak.date.getTime() - lunar.sd_penum * MINUTE_MS);
    if (start.getFullYear() === year) events.push({ date: start, kind: 'lunar-eclipse', label: `${capitalize(lunar.kind)} lunar eclipse` });
    lunar = NextLunarEclipse(lunar.peak);
  }
  return events.sort((first, second) => first.date.getTime() - second.date.getTime());
}
