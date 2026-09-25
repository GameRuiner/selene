import * as THREE from 'three';
import data from './apophis-ephemeris.json';
import { DAY_MS } from './time';

// Bundled Horizons vectors are Earth-centered, geometric, J2000 ecliptic,
// in AU and AU/day. Hermite interpolation uses the supplied velocities.
const samples = data.samples;
export const APOPHIS_EPHEMERIS_START = samples[0][0];
export const APOPHIS_EPHEMERIS_END = samples[samples.length - 1][0];

export function apophisGeocentricPosition(date: Date, target: THREE.Vector3): boolean {
  const time = date.getTime();
  if (time < APOPHIS_EPHEMERIS_START || time > APOPHIS_EPHEMERIS_END) return false;
  let low = 0, high = samples.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle][0] < time) low = middle + 1;
    else high = middle;
  }
  if (samples[low][0] === time) {
    target.set(samples[low][1], samples[low][2], samples[low][3]);
    return true;
  }
  const before = samples[low - 1], after = samples[low];
  const span = (after[0] - before[0]) / DAY_MS;
  const fraction = (time - before[0]) / (after[0] - before[0]);
  const square = fraction * fraction, cube = square * fraction;
  const p0 = 2 * cube - 3 * square + 1;
  const v0 = (cube - 2 * square + fraction) * span;
  const p1 = -2 * cube + 3 * square;
  const v1 = (cube - square) * span;
  target.set(
    p0 * before[1] + v0 * before[4] + p1 * after[1] + v1 * after[4],
    p0 * before[2] + v0 * before[5] + p1 * after[2] + v1 * after[5],
    p0 * before[3] + v0 * before[6] + p1 * after[3] + v1 * after[6],
  );
  return true;
}
