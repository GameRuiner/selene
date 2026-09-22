import { describe, expect, it } from 'vitest';
import { calculateFocusCameraPlan } from '../lib/solar-system/camera-controller';

describe('focus camera planning', () => {
  it('keeps closer distances and computes desktop/mobile overview plans', () => {
    const body = calculateFocusCameraPlan({ selected: true, realScale: false, radius: 0.9, displayRadius: 0.9, currentDistance: 2, homeVector: [0, 64, 89], mobile: false });
    expect(body.distance).toBe(2);
    expect(body.offset[0]).toBeCloseTo(0.4 * 2 / Math.hypot(0.4, 0.6, 1));
    const desktop = calculateFocusCameraPlan({ selected: false, realScale: false, radius: 0, displayRadius: 0, currentDistance: 100, homeVector: [0, 64, 89], mobile: false });
    const mobile = calculateFocusCameraPlan({ selected: false, realScale: false, radius: 0, displayRadius: 0, currentDistance: 100, homeVector: [0, 64, 89], mobile: true });
    expect(desktop.offset).toEqual([0, 64, 89]);
    expect(mobile.offset).toEqual([0, 89.6, 124.6]);
  });
  it('uses true-scale near plane, distance, and transition formulas', () => {
    const plan = calculateFocusCameraPlan({ selected: true, realScale: true, radius: 0.0004, displayRadius: 0.9, currentDistance: 1, homeVector: [0, 64, 89], mobile: false });
    expect(plan.near).toBeCloseTo(0.000032);
    expect(plan.distance).toBeCloseTo(0.0032);
    expect(plan.transitionThreshold).toBeCloseTo(0.000016);
  });
});
