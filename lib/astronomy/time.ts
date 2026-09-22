export const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12);
export const DAY_MS = 86_400_000;

export function dateToSimulationDays(date: Date): number {
  return (date.getTime() - J2000_EPOCH_MS) / DAY_MS;
}

export function simulationDaysToDate(days: number): Date {
  return new Date(J2000_EPOCH_MS + days * DAY_MS);
}
