'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { ArrowUpRight, Crosshair, Orbit, Pause, Play, RotateCcw, Telescope } from 'lucide-react';
import { Body as AstronomyBody, Equator, Horizon, Observer } from 'astronomy-engine';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { EclipseObserverPanel, type ObserverLocation, type SkyTarget } from '@/components/eclipse-observer-panel';
import { SimulationTimePicker } from '@/components/simulation-time-picker';
import { bodies, type BodyName } from '@/lib/solar-data';
import { createSolarSystem, type LandmarkSelection, type SolarSystem } from '@/lib/solar-system';
import { registerExplorerTool } from '@/lib/explorer-tool';

const speedStops = [
  { daysPerSecond: 1 / 86_400, label: '1×' },
  { daysPerSecond: 1 / 1_440, label: '1 MIN / SEC' },
  { daysPerSecond: 1 / 96, label: '15 MIN / SEC' },
  { daysPerSecond: 1 / 24, label: '1 HOUR / SEC' },
  { daysPerSecond: 0.125, label: '3 HOURS / SEC' },
  { daysPerSecond: 0.25, label: '6 HOURS / SEC' },
  { daysPerSecond: 0.5, label: '12 HOURS / SEC' },
  { daysPerSecond: 0.75, label: '18 HOURS / SEC' },
  { daysPerSecond: 1, label: '1 DAY / SEC' },
  { daysPerSecond: 2, label: '2 DAYS / SEC' },
  { daysPerSecond: 5, label: '5 DAYS / SEC' },
  { daysPerSecond: 12, label: '12 DAYS / SEC' },
  { daysPerSecond: 25, label: '25 DAYS / SEC' },
  { daysPerSecond: 50, label: '50 DAYS / SEC' },
  { daysPerSecond: 100, label: '100 DAYS / SEC' },
] as const;

const primaryBodies = bodies.filter((body) => !('parent' in body));

const superscriptDigits: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function formatMass(massKg: number) {
  const exponent = Math.floor(Math.log10(massKg));
  const coefficient = massKg / 10 ** exponent;
  const power = String(exponent).split('').map((digit) => superscriptDigits[digit]).join('');
  return `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 7 }).format(coefficient)} × 10${power} kg`;
}

function formatKilometers(kilometers: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(kilometers)} km`;
}

const defaultObserver: ObserverLocation = { label: 'Warsaw', latitude: 52.2297, longitude: 21.0122 };
const astronomyTargets: Record<SkyTarget, AstronomyBody> = {
  Sun: AstronomyBody.Sun,
  Moon: AstronomyBody.Moon,
  Mercury: AstronomyBody.Mercury,
  Venus: AstronomyBody.Venus,
  Mars: AstronomyBody.Mars,
  Jupiter: AstronomyBody.Jupiter,
  Saturn: AstronomyBody.Saturn,
  Uranus: AstronomyBody.Uranus,
  Neptune: AstronomyBody.Neptune,
};

function skyObservation(date: Date, location: ObserverLocation, target: SkyTarget) {
  const observer = new Observer(location.latitude, location.longitude, 0);
  const equator = Equator(astronomyTargets[target], date, observer, true, true);
  const altitude = Horizon(date, observer, equator.ra, equator.dec, 'normal').altitude;
  return altitude > 0
    ? { visible: true, status: `${target} is ${altitude.toFixed(1)}° above the horizon.` }
    : { visible: false, status: `${target} is ${Math.abs(altitude).toFixed(1)}° below the horizon.` };
}

export default function Home() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SolarSystem | null>(null);
  const [selected, setSelected] = useState<BodyName | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkSelection>(null);
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [simulationNow, setSimulationNow] = useState(() => new Date(0));
  const [moonPhase, setMoonPhase] = useState({ illumination: 0, name: 'New Moon' });
  const [eclipse, setEclipse] = useState<{ type: string; detail: string } | null>(null);
  const [orbits, setOrbits] = useState(true);
  const [labels, setLabels] = useState(true);
  const [realScale, setRealScale] = useState(false);
  const [observerActive, setObserverActive] = useState(false);
  const [observerFreeLook, setObserverFreeLook] = useState(false);
  const [observerLocation, setObserverLocation] = useState<ObserverLocation>(defaultObserver);
  const [observerTarget, setObserverTarget] = useState<SkyTarget>('Sun');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const speed = speedStops[speedIndex].daysPerSecond;

  useEffect(() => {
    if (!host.current) return;
    try {
      engine.current = createSolarSystem(host.current, setSelected, setSelectedLandmark, setError, () => {
        setSimulationNow(engine.current?.getDate() ?? new Date());
        setReady(true);
      }, () => setObserverFreeLook(true));
    } catch {
      // Renderer startup can fail synchronously; show its error in the interface.
      // oxlint-disable-next-line react/react-compiler
      setError('This browser could not start WebGL. Try a browser with hardware acceleration enabled.');
    }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.setOptions({ paused, speed, orbits, labels, realScale }); }, [paused, speed, orbits, labels, realScale]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDate = engine.current?.getDate();
      if (currentDate) setSimulationNow(currentDate);
      const currentMoonPhase = engine.current?.getMoonPhase();
      if (currentMoonPhase) setMoonPhase(currentMoonPhase);
      setEclipse(engine.current?.getEclipseState() ?? null);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => registerExplorerTool((name) => {
    if (!engine.current) throw new Error('The solar system is not ready.');
    engine.current.focus(name);
    setSelectedLandmark(null);
    setObserverActive(false);
    setObserverFreeLook(false);
    flushSync(() => setSelected(name));
  }), []);
  const stopSkyView = useCallback(() => {
    engine.current?.setEarthObserver(null);
    setObserverActive(false);
    setObserverFreeLook(false);
  }, []);
  const focus = (name: BodyName | null) => {
    stopSkyView();
    setSelected(name);
    setSelectedLandmark(null);
    engine.current?.focus(name);
  };
  const setSimulationDate = (date: Date) => {
    engine.current?.setDate(date);
    setSimulationNow(date);
  };
  const applyObserverLocation = (location: ObserverLocation, target: SkyTarget = observerTarget) => {
    setObserverLocation(location);
    setObserverFreeLook(false);
    engine.current?.setEarthObserver({ latitude: location.latitude, longitude: location.longitude, target });
  };
  const changeObserverTarget = (target: SkyTarget) => {
    setObserverTarget(target);
    setObserverFreeLook(false);
    engine.current?.setEarthObserver({ latitude: observerLocation.latitude, longitude: observerLocation.longitude, target });
  };
  const viewSkyFromEarth = () => {
    const target: SkyTarget = 'Sun';
    setObserverActive(true);
    setObserverFreeLook(false);
    setObserverTarget(target);
    setSelected('Earth');
    setSelectedLandmark(null);
    setRealScale(true);
    engine.current?.setEarthObserver({ latitude: observerLocation.latitude, longitude: observerLocation.longitude, target });
  };
  const body = selected ? bodies.find((item) => item.name === selected) : null;
  const selectedSystem = body && 'parent' in body ? body.parent : body?.name;
  const displayedObserverStatus = skyObservation(simulationNow, observerLocation, observerTarget);

  return (
    <main className={`observatory ${observerActive ? 'eclipse-observer-active' : ''}`}>
      <div className="space-viewport" ref={host} />
      {selectedLandmark && <dialog open className="landmark-popover" style={{ left: selectedLandmark.x, top: selectedLandmark.y }} aria-label={`${selectedLandmark.landmark.name} landmark details`}>
        <button className="landmark-close" onClick={() => setSelectedLandmark(null)} aria-label="Close landmark details">×</button>
        <span>EARTH LANDMARK</span>
        <h3>{selectedLandmark.landmark.name}</h3>
        <p>{selectedLandmark.landmark.location}</p>
        <p>{selectedLandmark.landmark.description}</p>
        <small>{Math.abs(selectedLandmark.landmark.latitude).toFixed(4)}° {selectedLandmark.landmark.latitude >= 0 ? 'N' : 'S'} · {Math.abs(selectedLandmark.landmark.longitude).toFixed(4)}° {selectedLandmark.landmark.longitude >= 0 ? 'E' : 'W'}</small>
      </dialog>}
      {observerActive && <EclipseObserverPanel
        currentDate={simulationNow}
        location={observerLocation}
        target={observerTarget}
        freeLook={observerFreeLook}
        status={displayedObserverStatus.status}
        visible={displayedObserverStatus.visible}
        onApply={(location) => applyObserverLocation(location)}
        onTargetChange={changeObserverTarget}
        onCenterTarget={() => changeObserverTarget(observerTarget)}
        onZoomIn={() => engine.current?.zoomEarthObserver(-8)}
        onZoomOut={() => engine.current?.zoomEarthObserver(8)}
        onClose={() => { stopSkyView(); engine.current?.focus('Earth'); }}
      />}
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="Selene's space home"><Orbit size={27} strokeWidth={1.4} /> SELENE&apos;S SPACE<span className="edition"> / 01</span></Link>
        <span className="live-status"><i /> Solar system explorer</span>
      </header>
      <section className="intro">
        <p className="eyebrow">OUR COSMIC NEIGHBORHOOD</p>
        <h1>The solar system<span>.</span></h1>
        <p>A star. Eight planets. Countless perspectives.</p>
        <button className="earth-shortcut" onClick={() => focus('Earth')}>Explore Earth & Moon <ArrowUpRight size={16} /></button>
      </section>
      <aside className="object-panel" aria-label="Explore celestial bodies">
        <div className="panel-heading"><span>EXPLORE</span><span>{bodies.length} OBJECTS</span></div>
        <button className={`object-row overview-row ${selected === null ? 'active' : ''}`} onClick={() => focus(null)} aria-pressed={selected === null}>
          <Orbit size={17} /><span>Whole system</span><span className="row-index">↗</span>
        </button>
        {primaryBodies.map((item, index) => <Fragment key={item.name}>
          <button className={`object-row ${selected === item.name ? 'active' : ''}`} onClick={() => focus(item.name)} aria-pressed={selected === item.name}>
            <span className="body-dot" style={{ background: item.color }} /><span>{item.name}</span><span className="row-index">{String(index).padStart(2, '0')}</span>
          </button>
          {selectedSystem === item.name && bodies.filter((candidate) => 'parent' in candidate && candidate.parent === item.name).map((satellite) => (
            <button key={satellite.name} className={`object-row satellite-row ${selected === satellite.name ? 'active' : ''}`} onClick={() => focus(satellite.name)} aria-pressed={selected === satellite.name}>
              <span className="body-dot" style={{ background: satellite.color }} /><span>{satellite.name}</span><span className="row-index">↳ {item.name.toUpperCase()}</span>
            </button>
          ))}
        </Fragment>)}
      </aside>
      <aside className="detail-panel" aria-live="polite">
        <p className="eyebrow">{body ? body.kind : 'THE BIG PICTURE'}</p>
        <h2>{body ? body.name : 'A little perspective.'}</h2>
        <p>{body ? body.description : 'Follow an orbit, find your home, or drift a little farther out. Select any world to take a closer look.'}</p>
        {body && <dl className="detail-facts">
          <div><dt>Orbit around</dt><dd>{body.name === 'Sun' ? '—' : 'parent' in body ? body.parent : 'Sun'}</dd></div>
          <div><dt>Orbital period</dt><dd>{body.periodLabel}</dd></div>
          <div><dt>Mass</dt><dd>{formatMass(body.massKg)}</dd></div>
          <div><dt>{body.radiusBasis} diameter</dt><dd>{formatKilometers(body.physicalRadiusKm * 2)}</dd></div>
          <div><dt>{body.radiusBasis} circumference</dt><dd>{formatKilometers(2 * Math.PI * body.physicalRadiusKm)}</dd></div>
          {body.name === 'Moon' && <><div><dt>Phase</dt><dd>{moonPhase.name}</dd></div><div><dt>Illumination</dt><dd>{Math.round(moonPhase.illumination * 100)}%</dd></div></>}
          {body.name === 'Earth' && <div><dt>Landmarks</dt><dd>3 marked sites</dd></div>}
        </dl>}
        {eclipse && (body?.name === 'Earth' || body?.name === 'Moon') && <div className="eclipse-alert"><strong>{eclipse.type}</strong><span>{eclipse.detail}</span></div>}
        {body?.name === 'Earth' && !observerActive && <button className="sky-view-button" onClick={viewSkyFromEarth}><Telescope size={15} /> View sky from Earth</button>}
        {body && <button className="recenter" onClick={() => focus(body.name)}><Crosshair size={15} /> Recenter {body.name}</button>}
        {!body && <div className="scale-note"><span>MODEL NOTES</span><p>Sizes and distances are compressed for visibility. Paths use each body’s eccentricity, orbital tilt, and relative period; positions are illustrative.</p></div>}
      </aside>
      {error && <div className="scene-message" role="alert">{error}</div>}
      {!ready && !error && <output className="scene-message">Preparing your solar system…</output>}
      <footer className="bottom-area">
        <div className="controls-bar">
          <button className="play-button" aria-label={paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => setPaused(!paused)}>{paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>
          <div className="speed-control"><div><span id="speed-label">TIME SPEED</span><output>{speedStops[speedIndex].label}</output></div><Slider aria-labelledby="speed-label" aria-valuetext={speedStops[speedIndex].label} value={[speedIndex]} min={0} max={speedStops.length - 1} step={1} onValueChange={(value) => setSpeedIndex(Array.isArray(value) ? value[0] : value)} /></div>
          {ready
            ? <SimulationTimePicker value={simulationNow} onChange={setSimulationDate} />
            : <div className="simulation-time-placeholder"><span>TIME</span><strong>Preparing…</strong></div>}
          <div className="control-divider" />
          <div className="toggle-control"><label htmlFor="orbit-toggle">Orbits</label><Switch id="orbit-toggle" checked={orbits} onCheckedChange={setOrbits} aria-label="Show orbits" /></div>
          <div className="toggle-control"><label htmlFor="label-toggle">Labels</label><Switch id="label-toggle" checked={labels} onCheckedChange={setLabels} aria-label="Show labels" /></div>
          <div className="toggle-control"><label htmlFor="scale-toggle">True scale</label><Switch id="scale-toggle" checked={realScale} disabled={observerActive} onCheckedChange={setRealScale} aria-label="Use real sizes and distances" /></div>
          <button className="reset-button" onClick={() => { const now = new Date(); focus(null); setPaused(false); setSpeedIndex(0); setSimulationNow(now); setOrbits(true); setLabels(true); setRealScale(false); engine.current?.reset(); }} aria-label="Reset simulation"><RotateCcw size={17} /></button>
        </div>
        <div className="footer-meta"><span>DRAG TO ORBIT <b>·</b> SCROLL TO ZOOM <b>·</b> CLICK TO EXPLORE</span><span>WEBGL <i /> LIVE SIMULATION</span></div>
      </footer>
    </main>
  );
}
