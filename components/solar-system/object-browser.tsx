'use client';

import { Fragment } from 'react';
import { Orbit } from 'lucide-react';
import { bodies, type BodyName } from '@/lib/solar-data';

export type ObjectBrowserProps = { selected: BodyName | null; onSelect: (name: BodyName | null) => void };
const planetsAndSun = bodies.filter((body) => !('parent' in body) && body.kind !== 'DWARF PLANET' && body.kind !== 'NEAR-EARTH ASTEROID');
const dwarfPlanets = bodies.filter((body) => body.kind === 'DWARF PLANET');
const asteroids = bodies.filter((body) => body.kind === 'NEAR-EARTH ASTEROID');
const primaryBodies = [...planetsAndSun, ...dwarfPlanets, ...asteroids];

export function ObjectBrowser({ selected, onSelect }: ObjectBrowserProps) {
  const body = selected ? bodies.find((item) => item.name === selected) : null;
  const selectedSystem = body && 'parent' in body ? body.parent : body?.name;
  return <aside className="object-panel" aria-label="Explore celestial bodies">
    <div className="panel-heading"><span>EXPLORE</span><span>{bodies.length} OBJECTS</span></div>
    <button className={`object-row overview-row ${selected === null ? 'active' : ''}`} onClick={() => onSelect(null)} aria-pressed={selected === null}><Orbit size={17} /><span>Whole system</span><span className="row-index">↗</span></button>
    {primaryBodies.map((item, index) => <Fragment key={item.name}>
      {index === planetsAndSun.length && <div className="object-group-heading">DWARF PLANETS</div>}
      {index === planetsAndSun.length + dwarfPlanets.length && <div className="object-group-heading">ASTEROIDS</div>}
      <button className={`object-row ${selected === item.name ? 'active' : ''}`} onClick={() => onSelect(item.name)} aria-pressed={selected === item.name}><span className="body-dot" style={{ background: item.color }} /><span>{item.name}</span><span className="row-index">{String(index).padStart(2, '0')}</span></button>
      {selectedSystem === item.name && bodies.filter((candidate) => 'parent' in candidate && candidate.parent === item.name).map((satellite) => <button key={satellite.name} className={`object-row satellite-row ${selected === satellite.name ? 'active' : ''}`} onClick={() => onSelect(satellite.name)} aria-pressed={selected === satellite.name}><span className="body-dot" style={{ background: satellite.color }} /><span>{satellite.name}</span><span className="row-index">↳ {item.name.toUpperCase()}</span></button>)}
    </Fragment>)}
  </aside>;
}
