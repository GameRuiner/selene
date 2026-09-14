'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { ArrowUpRight, Crosshair, Orbit, Pause, Play, RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { bodies, type BodyName } from '@/lib/solar-data';
import { createSolarSystem, type SolarSystem } from '@/lib/solar-system';
import { registerExplorerTool } from '@/lib/explorer-tool';

export default function Home() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SolarSystem | null>(null);
  const [selected, setSelected] = useState<BodyName | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(12);
  const [orbits, setOrbits] = useState(true);
  const [labels, setLabels] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    try {
      engine.current = createSolarSystem(host.current, setSelected, setError, () => setReady(true));
    } catch {
      // Renderer startup can fail synchronously; show its error in the interface.
      // oxlint-disable-next-line react/react-compiler
      setError('This browser could not start WebGL. Try a browser with hardware acceleration enabled.');
    }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.setOptions({ paused, speed, orbits, labels }); }, [paused, speed, orbits, labels]);
  useEffect(() => registerExplorerTool((name) => {
    if (!engine.current) throw new Error('The solar system is not ready.');
    engine.current.focus(name);
    flushSync(() => setSelected(name));
  }), []);
  const focus = (name: BodyName | null) => { setSelected(name); engine.current?.focus(name); };
  const body = selected ? bodies.find((item) => item.name === selected) : null;

  return (
    <main className="observatory">
      <div className="space-viewport" ref={host} />
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="Selene's space home"><Orbit size={27} strokeWidth={1.4} /> SELENE'S SPACE<span className="edition"> / 01</span></Link>
        <span className="live-status"><i /> Solar system explorer</span>
      </header>
      <section className="intro">
        <p className="eyebrow">OUR COSMIC NEIGHBORHOOD</p>
        <h1>The solar system<span>.</span></h1>
        <p>A star. Eight planets. Countless perspectives.</p>
        <button className="earth-shortcut" onClick={() => focus('Earth')}>Explore Earth & Moon <ArrowUpRight size={16} /></button>
      </section>
      <aside className="object-panel" aria-label="Explore celestial bodies">
        <div className="panel-heading"><span>EXPLORE</span><span>10 OBJECTS</span></div>
        <button className={`object-row overview-row ${selected === null ? 'active' : ''}`} onClick={() => focus(null)} aria-pressed={selected === null}>
          <Orbit size={17} /><span>Whole system</span><span className="row-index">↗</span>
        </button>
        {bodies.map((item, index) => (
          <button key={item.name} className={`object-row ${selected === item.name ? 'active' : ''} ${item.name === 'Moon' ? 'moon-row' : ''}`} onClick={() => focus(item.name)} aria-pressed={selected === item.name}>
            <span className="body-dot" style={{ background: item.color }} /><span>{item.name}</span><span className="row-index">{item.name === 'Moon' ? '↳ EARTH' : String(index > 4 ? index - 1 : index).padStart(2, '0')}</span>
          </button>
        ))}
      </aside>
      <aside className="detail-panel" aria-live="polite">
        <p className="eyebrow">{body ? body.kind : 'THE BIG PICTURE'}</p>
        <h2>{body ? body.name : 'A little perspective.'}</h2>
        <p>{body ? body.description : 'Follow an orbit, find your home, or drift a little farther out. Select any world to take a closer look.'}</p>
        {body && <dl><div><dt>Orbit around</dt><dd>{body.name === 'Sun' ? '—' : body.name === 'Moon' ? 'Earth' : 'Sun'}</dd></div><div><dt>Orbital period</dt><dd>{body.periodLabel}</dd></div></dl>}
        {body && <button className="recenter" onClick={() => focus(body.name)}><Crosshair size={15} /> Recenter {body.name}</button>}
        <div className="scale-note"><span>MODEL NOTES</span><p>Sizes and distances are compressed for visibility. Circular orbits use relative orbital periods; positions are illustrative.</p></div>
      </aside>
      {error && <div className="scene-message" role="alert">{error}</div>}
      {!ready && !error && <output className="scene-message">Preparing your solar system…</output>}
      <footer className="bottom-area">
        <div className="controls-bar">
          <button className="play-button" aria-label={paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => setPaused(!paused)}>{paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>
          <div className="speed-control"><div><span id="speed-label">TIME SPEED</span><output>{speed} days / sec</output></div><Slider aria-labelledby="speed-label" value={[speed]} min={1} max={100} step={1} onValueChange={(value) => setSpeed(Array.isArray(value) ? value[0] : value)} /></div>
          <div className="control-divider" />
          <div className="toggle-control"><label htmlFor="orbit-toggle">Orbits</label><Switch id="orbit-toggle" checked={orbits} onCheckedChange={setOrbits} aria-label="Show orbits" /></div>
          <div className="toggle-control"><label htmlFor="label-toggle">Labels</label><Switch id="label-toggle" checked={labels} onCheckedChange={setLabels} aria-label="Show labels" /></div>
          <button className="reset-button" onClick={() => { focus(null); setPaused(false); setSpeed(12); setOrbits(true); setLabels(true); engine.current?.reset(); }} aria-label="Reset simulation"><RotateCcw size={17} /></button>
        </div>
        <div className="footer-meta"><span>DRAG TO ORBIT <b>·</b> SCROLL TO ZOOM <b>·</b> CLICK TO EXPLORE</span><span>WEBGL <i /> LIVE SIMULATION</span></div>
      </footer>
    </main>
  );
}
