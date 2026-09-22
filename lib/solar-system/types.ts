import type { BodyName } from '../solar-data';

export type Landmark = { name: string; location: string; latitude: number; longitude: number; description: string };
export type LandmarkSelection = { landmark: Landmark; x: number; y: number } | null;
export type EarthObserver = { latitude: number; longitude: number; target: BodyName };
export type SolarSystemOptions = { paused: boolean; speed: number; orbits: boolean; labels: boolean; realScale: boolean };
export type SolarSystemCallbacks = {
  onSelect: (name: BodyName | null) => void;
  onLandmarkSelect: (selection: LandmarkSelection) => void;
  onError: (message: string) => void;
  onReady: () => void;
  onObserverFreeLook: () => void;
};
export type MoonPhaseState = { illumination: number; name: string };
export type EclipseState = { type: string; detail: string } | null;
export interface SolarSystem {
  focus(name: BodyName | null): void;
  setEarthObserver(next: EarthObserver | null): void;
  zoomEarthObserver(delta: number): void;
  setOptions(next: SolarSystemOptions): void;
  setDate(date: Date): void;
  getDate(): Date;
  getMoonPhase(): MoonPhaseState;
  getEclipseState(): EclipseState;
  reset(): void;
  dispose(): void;
}
