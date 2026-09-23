import { describe, expect, it } from 'vitest';
import { earthSkyLighting } from '../lib/solar-system/earth-sky-light';

describe('Earth observer sky lighting', () => {
  it('brightens by day and reveals stars at night', () => {
    const noon = earthSkyLighting(Math.PI / 2, 90);
    const midnight = earthSkyLighting(-Math.PI / 2, 90);
    const sunset = earthSkyLighting(0, 90);
    expect(noon.effectiveDaylight).toBe(1);
    expect(noon.starVisibility).toBe(0);
    expect(midnight.effectiveDaylight).toBe(0);
    expect(midnight.starVisibility).toBe(1);
    expect(sunset.effectiveDaylight).toBeGreaterThan(0);
    expect(sunset.effectiveDaylight).toBeLessThan(1);
  });

  it('darkens only a near aligned daytime solar eclipse', () => {
    const clearDay = earthSkyLighting(0.8, 90);
    const totality = earthSkyLighting(0.8, 0);
    const nighttimeAlignment = earthSkyLighting(-0.8, 0);
    expect(totality.effectiveDaylight).toBeLessThan(0.15);
    expect(totality.starVisibility).toBeGreaterThan(0.8);
    expect(clearDay.effectiveDaylight).toBe(1);
    expect(nighttimeAlignment.effectiveDaylight).toBe(0);
  });
});
