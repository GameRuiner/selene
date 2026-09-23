const smoothstep = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export function earthSkyLighting(sunAltitude: number, solarSeparationDegrees: number) {
  // The atmosphere brightens before sunrise and fades after sunset.
  const daylight = smoothstep(-0.12, 0.10, sunAltitude);
  const twilight = smoothstep(-0.25, -0.04, sunAltitude) * (1 - smoothstep(0.05, 0.26, sunAltitude));
  const solarCoverage = 1 - smoothstep(0.16, 1.15, solarSeparationDegrees);
  // Only an almost aligned, above-horizon Moon darkens the daytime sky.
  const eclipseDarkness = smoothstep(-0.01, 0.045, sunAltitude) * Math.pow(solarCoverage, 4) * 0.9;
  const effectiveDaylight = daylight * (1 - eclipseDarkness);
  const starVisibility = 1 - Math.min(1, effectiveDaylight * 1.2);
  return { effectiveDaylight, twilight, solarCoverage, starVisibility };
}
