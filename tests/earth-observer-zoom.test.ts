import { describe, expect, it } from 'vitest';
import { observerMarkerWorldSize } from '../lib/solar-system/earth-observer-view';

describe('Earth sky zoom', () => {
  it('makes guide markers larger on screen when zooming in', () => {
    const screenPixels = (fov: number) => {
      const worldSize = observerMarkerWorldSize(fov, 800, 10);
      return worldSize * 800 / (20 * Math.tan(fov * Math.PI / 360));
    };
    expect(screenPixels(8)).toBeGreaterThan(screenPixels(55));
    expect(screenPixels(55)).toBeGreaterThan(screenPixels(90));
    expect(screenPixels(55)).toBeCloseTo(10);
  });
});
