import { describe, expect, it } from 'vitest';
import { dateToSimulationDays, simulationDaysToDate } from '../lib/astronomy/time';

describe('simulation time conversion', () => {
  it('maps J2000 noon to day zero and round-trips dates without drift', () => {
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12));
    expect(dateToSimulationDays(j2000)).toBe(0);
    const dates = [new Date(1972, 2, 4, 5, 6, 7, 8), new Date(2026, 2, 3, 12, 34, 56, 789), new Date()];
    for (const date of dates) expect(simulationDaysToDate(dateToSimulationDays(date)).getTime()).toBe(date.getTime());
  });
});
