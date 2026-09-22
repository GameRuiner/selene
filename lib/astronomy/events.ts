import {
  Body, GeoMoon, GeoVector, KM_PER_AU, NextGlobalSolarEclipse, NextLunarEclipse, Search, SearchGlobalSolarEclipse, SearchLunarEclipse, Seasons,
} from 'astronomy-engine';
import { DAY_MS } from './time';

export type AstronomyEventKind = 'equinox' | 'solstice' | 'solar-eclipse' | 'lunar-eclipse';
export type AstronomyEvent = { date: Date; kind: AstronomyEventKind; label: string; approximateStart?: boolean };
export type SolarEclipseStart = { date: Date; approximate: boolean };
const MINUTE_MS = 60_000;
const SUN_RADIUS_KM = 695_700;
const MOON_MEAN_RADIUS_KM = 1_737.4;
const EARTH_MEAN_RADIUS_KM = 6_371;

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

export function eventsForYear(year: number): AstronomyEvent[] {
  const seasons = Seasons(year);
  const events: AstronomyEvent[] = [
    { date: seasons.mar_equinox.date, kind: 'equinox', label: 'March equinox' },
    { date: seasons.jun_solstice.date, kind: 'solstice', label: 'June solstice' },
    { date: seasons.sep_equinox.date, kind: 'equinox', label: 'September equinox' },
    { date: seasons.dec_solstice.date, kind: 'solstice', label: 'December solstice' },
  ];
  const searchStart = new Date(Date.UTC(year, 0, 1) - DAY_MS);
  const searchEnd = new Date(Date.UTC(year + 1, 0, 1) + DAY_MS);
  let solar = SearchGlobalSolarEclipse(searchStart);
  while (solar.peak.date < searchEnd) {
    const start = solarEclipseStart(solar);
    if (start.date.getFullYear() === year) events.push({ date: start.date, kind: 'solar-eclipse', label: `${capitalize(solar.kind)} solar eclipse`, approximateStart: start.approximate });
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
