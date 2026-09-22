export type FocusCameraPlan = { near: number; distance: number; transitionThreshold: number; minDistance: number; offset: [number, number, number] };
export function calculateFocusCameraPlan(input: { selected: boolean; realScale: boolean; radius: number; displayRadius: number; currentDistance: number; homeVector: [number, number, number]; mobile: boolean }): FocusCameraPlan {
  const { selected, realScale, radius, displayRadius, currentDistance, homeVector, mobile } = input;
  const homeDistance = Math.hypot(...homeVector);
  const near = selected && realScale ? Math.max(radius * 0.08, 0.000000001) : 0.1;
  const preferredDistance = selected ? realScale ? Math.max(radius * 8, 0.000001) : Math.max(displayRadius * 7, 4) : homeDistance;
  const distance = selected ? Math.min(currentDistance, preferredDistance) : homeDistance;
  const transitionThreshold = Math.min(0.03, Math.max(distance * 0.005, 0.000000001));
  const minDistance = selected ? Math.max(radius * 1.8, near * 2.5) : 5;
  const scale = distance / Math.hypot(0.4, 0.6, 1);
  const offset: [number, number, number] = selected ? [0.4 * scale, 0.6 * scale, 1 * scale] : homeVector.map((value) => value * (mobile ? 1.4 : 1)) as [number, number, number];
  return { near, distance, transitionThreshold, minDistance, offset };
}
