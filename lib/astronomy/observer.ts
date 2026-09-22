import { Body as AstronomyBody, Equator, Horizon, Observer } from 'astronomy-engine';

export type SkyTarget = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';
export type ObserverLocation = { latitude: number; longitude: number; label: string };
export type SkyObservation = { visible: boolean; status: string };
export const SKY_TARGETS: SkyTarget[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
export const DEFAULT_OBSERVER: ObserverLocation = { label: 'Warsaw', latitude: 52.2297, longitude: 21.0122 };
const targets: Record<SkyTarget, AstronomyBody> = {
  Sun: AstronomyBody.Sun, Moon: AstronomyBody.Moon, Mercury: AstronomyBody.Mercury, Venus: AstronomyBody.Venus,
  Mars: AstronomyBody.Mars, Jupiter: AstronomyBody.Jupiter, Saturn: AstronomyBody.Saturn, Uranus: AstronomyBody.Uranus, Neptune: AstronomyBody.Neptune,
};
export function astronomyBodyForTarget(target: SkyTarget): AstronomyBody { return targets[target]; }
export function skyObservation(date: Date, location: ObserverLocation, target: SkyTarget): SkyObservation {
  const observer = new Observer(location.latitude, location.longitude, 0);
  const equator = Equator(astronomyBodyForTarget(target), date, observer, true, true);
  const altitude = Horizon(date, observer, equator.ra, equator.dec, 'normal').altitude;
  return altitude > 0
    ? { visible: true, status: `${target} is ${altitude.toFixed(1)}° above the horizon.` }
    : { visible: false, status: `${target} is ${Math.abs(altitude).toFixed(1)}° below the horizon.` };
}
