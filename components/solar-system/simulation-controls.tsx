'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SimulationTimePicker } from '@/components/simulation-time-picker';

export const SPEED_STOPS = [
  { daysPerSecond: 1 / 86_400, label: '1×' }, { daysPerSecond: 1 / 1_440, label: '1 MIN / SEC' }, { daysPerSecond: 1 / 96, label: '15 MIN / SEC' },
  { daysPerSecond: 1 / 24, label: '1 HOUR / SEC' }, { daysPerSecond: 0.125, label: '3 HOURS / SEC' }, { daysPerSecond: 0.25, label: '6 HOURS / SEC' },
  { daysPerSecond: 0.5, label: '12 HOURS / SEC' }, { daysPerSecond: 0.75, label: '18 HOURS / SEC' }, { daysPerSecond: 1, label: '1 DAY / SEC' },
  { daysPerSecond: 2, label: '2 DAYS / SEC' }, { daysPerSecond: 5, label: '5 DAYS / SEC' }, { daysPerSecond: 12, label: '12 DAYS / SEC' },
  { daysPerSecond: 25, label: '25 DAYS / SEC' }, { daysPerSecond: 50, label: '50 DAYS / SEC' }, { daysPerSecond: 100, label: '100 DAYS / SEC' },
] as const;
export type SimulationControlsProps = { paused: boolean; speedIndex: number; setPaused: (value: boolean) => void; setSpeedIndex: (value: number) => void; simulationNow: Date; setSimulationDate: (date: Date) => void; ready: boolean; orbits: boolean; labels: boolean; realScale: boolean; observerActive: boolean; setOrbits: (value: boolean) => void; setLabels: (value: boolean) => void; setRealScale: (value: boolean) => void; reset: () => void };
export function SimulationControls(props: SimulationControlsProps) {
  const { paused, speedIndex, setPaused, setSpeedIndex, simulationNow, setSimulationDate, ready, orbits, labels, realScale, observerActive, setOrbits, setLabels, setRealScale, reset } = props;
  return <div className="controls-bar">
    <button className="play-button" aria-label={paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => setPaused(!paused)}>{paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>
    <div className="speed-control"><div><span id="speed-label">TIME SPEED</span><output>{SPEED_STOPS[speedIndex].label}</output></div><Slider aria-labelledby="speed-label" aria-valuetext={SPEED_STOPS[speedIndex].label} value={[speedIndex]} min={0} max={SPEED_STOPS.length - 1} step={1} onValueChange={(value) => setSpeedIndex(Array.isArray(value) ? value[0] : value)} /></div>
    {ready ? <SimulationTimePicker value={simulationNow} onChange={setSimulationDate} /> : <div className="simulation-time-placeholder"><span>TIME</span><strong>Preparing…</strong></div>}
    <div className="control-divider" />
    <div className="toggle-control"><label htmlFor="orbit-toggle">Orbits</label><Switch id="orbit-toggle" checked={orbits} onCheckedChange={setOrbits} aria-label="Show orbits" /></div>
    <div className="toggle-control"><label htmlFor="label-toggle">Labels</label><Switch id="label-toggle" checked={labels} onCheckedChange={setLabels} aria-label="Show labels" /></div>
    <div className="toggle-control"><label htmlFor="scale-toggle">True scale</label><Switch id="scale-toggle" checked={realScale} disabled={observerActive} onCheckedChange={setRealScale} aria-label="Use real sizes and distances" /></div>
    <button className="reset-button" onClick={reset} aria-label="Reset simulation"><RotateCcw size={17} /></button>
  </div>;
}
