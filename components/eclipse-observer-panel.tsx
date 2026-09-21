'use client';

import { useEffect, useState } from 'react';
import { Crosshair, MapPin, X, ZoomIn, ZoomOut } from 'lucide-react';

export type ObserverLocation = { latitude: number; longitude: number; label: string };
export type SkyTarget = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';

type EclipseObserverPanelProps = {
  currentDate: Date;
  location: ObserverLocation;
  target: SkyTarget;
  freeLook: boolean;
  status: string;
  visible: boolean;
  onApply: (location: ObserverLocation) => void;
  onTargetChange: (target: SkyTarget) => void;
  onCenterTarget: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onClose: () => void;
};

const placePresets: ObserverLocation[] = [
  { label: 'Warsaw', latitude: 52.2297, longitude: 21.0122 },
  { label: 'New York', latitude: 40.7128, longitude: -74.006 },
  { label: 'Cairo', latitude: 30.0444, longitude: 31.2357 },
  { label: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { label: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
];

function sameCoordinates(first: ObserverLocation, second: ObserverLocation) {
  return Math.abs(first.latitude - second.latitude) < 0.0001 && Math.abs(first.longitude - second.longitude) < 0.0001;
}

const skyTargets: SkyTarget[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

export function EclipseObserverPanel({ currentDate, location, target, freeLook, status, visible, onApply, onTargetChange, onCenterTarget, onZoomIn, onZoomOut, onClose }: EclipseObserverPanelProps) {
  const presets = placePresets;
  const [latitude, setLatitude] = useState(String(location.latitude));
  const [longitude, setLongitude] = useState(String(location.longitude));
  const selectedPreset = presets.findIndex((preset) => sameCoordinates(preset, location));

  useEffect(() => {
    setLatitude(String(Number(location.latitude.toFixed(5))));
    setLongitude(String(Number(location.longitude.toFixed(5))));
  }, [location.latitude, location.longitude]);

  const choosePreset = (value: string) => {
    const preset = presets[Number(value)];
    if (!preset) return;
    setLatitude(String(Number(preset.latitude.toFixed(5))));
    setLongitude(String(Number(preset.longitude.toFixed(5))));
    onApply(preset);
  };

  const apply = () => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return;
    onApply({
      label: 'Custom location',
      latitude: Math.max(-90, Math.min(90, parsedLatitude)),
      longitude: ((parsedLongitude + 180) % 360 + 360) % 360 - 180,
    });
  };

  return <aside className="eclipse-observer-panel" aria-label="Earth sky observer controls">
    <div className="observer-heading">
      <div><span>EARTH SKY VIEW</span><strong>{freeLook ? 'Free camera' : `${target} from Earth`}</strong></div>
      <button onClick={onClose} aria-label="Exit Earth observer view"><X size={17} /></button>
    </div>
    <p className="observer-time">Simulation time · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(currentDate)}</p>
    <label className="observer-place"><span><MapPin size={13} /> Viewing location</span><select value={selectedPreset >= 0 ? String(selectedPreset) : 'custom'} onChange={(change) => choosePreset(change.target.value)}>
      {presets.map((preset, index) => <option key={`${preset.label}-${index}`} value={index}>{preset.label}</option>)}
      <option value="custom">Custom coordinates</option>
    </select></label>
    <label className="observer-target"><span>LOOK AT</span><div><select value={freeLook ? 'free' : target} onChange={(change) => onTargetChange(change.target.value as SkyTarget)}>
      {freeLook && <option value="free" disabled>Free camera</option>}
      {skyTargets.map((body) => <option key={body} value={body}>{body}</option>)}
    </select><button type="button" onClick={onCenterTarget}><Crosshair size={12} /> Center</button><button type="button" onClick={onZoomOut} aria-label="Zoom sky map out" title="Zoom out"><ZoomOut size={13} /></button><button type="button" onClick={onZoomIn} aria-label="Zoom sky map in" title="Zoom in"><ZoomIn size={13} /></button></div></label>
    <div className="observer-coordinates">
      <label><span>LATITUDE</span><input type="number" min="-90" max="90" step="0.0001" value={latitude} onChange={(change) => setLatitude(change.target.value)} /></label>
      <label><span>LONGITUDE</span><input type="number" min="-180" max="180" step="0.0001" value={longitude} onChange={(change) => setLongitude(change.target.value)} /></label>
      <button onClick={apply}><Crosshair size={13} /> Apply</button>
    </div>
    <p className={`observer-status ${visible ? 'visible' : 'not-visible'}`}><i /> {status}</p>
    <small>Drag to pan · Wheel or buttons to zoom · Dim markers are below the horizon</small>
  </aside>;
}
