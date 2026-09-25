'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { ArrowUpRight, Orbit } from 'lucide-react';
import { EclipseObserverPanel } from '@/components/eclipse-observer-panel';
import { ObjectBrowser } from '@/components/solar-system/object-browser';
import { BodyDetails } from '@/components/solar-system/body-details';
import { SimulationControls, SPEED_STOPS } from '@/components/solar-system/simulation-controls';
import { type BodyName } from '@/lib/solar-data';
import { createSolarSystem, type LandmarkSelection, type SolarSystem } from '@/lib/solar-system';
import { registerExplorerTool } from '@/lib/explorer-tool';
import { DEFAULT_OBSERVER, skyObservation, type ObserverLocation, type SkyTarget } from '@/lib/astronomy/observer';
import { eventPlaybackDate, type AstronomyEvent } from '@/lib/astronomy/events';

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
  const [observerLocation, setObserverLocation] = useState<ObserverLocation>(DEFAULT_OBSERVER);
  const [observerTarget, setObserverTarget] = useState<SkyTarget>('Sun');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const speed = SPEED_STOPS[speedIndex].daysPerSecond;

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
  const viewSolarEclipse = (event: AstronomyEvent) => {
    if (event.kind !== 'solar-eclipse' || !event.observation) return;
    const { date, location } = event.observation;
    setSimulationDate(date);
    setPaused(false);
    setSpeedIndex(1);
    setObserverActive(true);
    setObserverFreeLook(false);
    setObserverLocation(location);
    setObserverTarget('Sun');
    setSelected('Earth');
    setSelectedLandmark(null);
    setRealScale(true);
    engine.current?.setEarthObserver({ latitude: location.latitude, longitude: location.longitude, target: 'Sun' });
    engine.current?.setOptions({ paused: false, speed: SPEED_STOPS[1].daysPerSecond, orbits, labels, realScale: true });
    engine.current?.zoomEarthObserver(-43);
  };
  const viewCalendarEvent = (event: AstronomyEvent) => {
    if (event.kind === 'solar-eclipse' && event.observation) {
      viewSolarEclipse(event);
      return;
    }
    setSimulationDate(eventPlaybackDate(event));
    if (event.kind === 'asteroid-flyby') {
      stopSkyView();
      setRealScale(false);
      setPaused(false);
      setSpeedIndex(2);
      setOrbits(true);
      setLabels(true);
      engine.current?.setOptions({ paused: false, speed: SPEED_STOPS[2].daysPerSecond, orbits: true, labels: true, realScale: false });
      focus('Apophis');
    }
  };
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
      <ObjectBrowser selected={selected} onSelect={focus} />
      <BodyDetails selected={selected} simulationNow={simulationNow} moonPhase={moonPhase} eclipse={eclipse} observerActive={observerActive} onViewSky={viewSkyFromEarth} onFocus={focus} />
      {error && <div className="scene-message" role="alert">{error}</div>}
      {!ready && !error && <output className="scene-message">Preparing your solar system…</output>}
      <footer className="bottom-area">
        <SimulationControls paused={paused} speedIndex={speedIndex} setPaused={setPaused} setSpeedIndex={setSpeedIndex} simulationNow={simulationNow} setSimulationDate={setSimulationDate} onEventView={viewCalendarEvent} ready={ready} orbits={orbits} labels={labels} realScale={realScale} observerActive={observerActive} setOrbits={setOrbits} setLabels={setLabels} setRealScale={setRealScale} reset={() => { const now = new Date(); focus(null); setPaused(false); setSpeedIndex(0); setSimulationNow(now); setOrbits(true); setLabels(true); setRealScale(false); engine.current?.reset(); }} />
        <div className="footer-meta"><span>DRAG TO ORBIT <b>·</b> SCROLL TO ZOOM <b>·</b> CLICK TO EXPLORE</span><span>WEBGL <i /> LIVE SIMULATION</span></div>
      </footer>
    </main>
  );
}
