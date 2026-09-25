// Run with Node 22+ to refresh the bundled, offline Apophis trajectory.
// Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
import { writeFile } from 'node:fs/promises';

const endpoint = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const output = new URL('../lib/astronomy/apophis-ephemeris.json', import.meta.url);
const windows = [
  ['2026-01-01', '2032-01-01', '2 d'],
  ['2029-04-01', '2029-05-01', '1 h'],
  ['2029-04-13', '2029-04-15', '5 min'],
];
const months = new Map(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => [month, index]));

async function fetchWindow(start, stop, step) {
  const params = new URLSearchParams({
    format: 'text', COMMAND: "'99942;'", OBJ_DATA: "'NO'", EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'", START_TIME: `'${start}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: `'${step}'`,
    TIME_TYPE: "'UT'", REF_PLANE: "'ECLIPTIC'", OUT_UNITS: "'AU-D'", VEC_TABLE: "'2'", CSV_FORMAT: "'YES'",
  });
  const response = await fetch(`${endpoint}?${params}`);
  if (!response.ok) throw new Error(`Horizons ${response.status}: ${start} to ${stop}`);
  const result = await response.text();
  const section = result.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!section) throw new Error(`Horizons returned no vector table for ${start} to ${stop}: ${result.slice(0, 500)}`);
  return section.trim().split('\n').map((line) => {
    const fields = line.split(',').map((field) => field.trim());
    const match = fields[1]?.match(/^A\.D\. (\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!match) throw new Error(`Unexpected Horizons date: ${fields[1]}`);
    const [, year, month, day, hour, minute, second] = match;
    const monthIndex = months.get(month);
    if (monthIndex === undefined) throw new Error(`Unknown Horizons month: ${month}`);
    const timestamp = Date.UTC(Number(year), monthIndex, Number(day), Number(hour), Number(minute), Number(second));
    const state = fields.slice(2, 8).map(Number);
    if (state.length !== 6 || state.some((value) => !Number.isFinite(value))) throw new Error(`Invalid Horizons vector: ${line}`);
    return [timestamp, ...state];
  });
}

const byTime = new Map();
for (const [start, stop, step] of windows) {
  for (const sample of await fetchWindow(start, stop, step)) byTime.set(sample[0], sample);
}
const samples = [...byTime.values()].sort((left, right) => left[0] - right[0]);
await writeFile(output, `${JSON.stringify({
  source: 'NASA/JPL Horizons, 99942 Apophis relative to Earth center, J2000 ecliptic, geometric vectors, UTC, AU and AU/day; retrieved 2026-09-24',
  samples,
})}\n`);
console.log(`Wrote ${samples.length} Horizons samples to ${output.pathname}`);
