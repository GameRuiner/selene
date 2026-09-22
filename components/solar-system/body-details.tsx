'use client';

import { Crosshair, Telescope } from 'lucide-react';
import { bodies, type BodyName } from '@/lib/solar-data';
import { formatKilometers, formatMass } from '@/lib/formatters';

export type BodyDetailsProps = { selected: BodyName | null; moonPhase: { name: string; illumination: number }; eclipse: { type: string; detail: string } | null; observerActive: boolean; onViewSky: () => void; onFocus: (name: BodyName | null) => void };
export function BodyDetails({ selected, moonPhase, eclipse, observerActive, onViewSky, onFocus }: BodyDetailsProps) {
  const body = selected ? bodies.find((item) => item.name === selected) : null;
  return <aside className="detail-panel" aria-live="polite">
    <p className="eyebrow">{body ? body.kind : 'THE BIG PICTURE'}</p><h2>{body ? body.name : 'A little perspective.'}</h2>
    <p>{body ? body.description : 'Follow an orbit, find your home, or drift a little farther out. Select any world to take a closer look.'}</p>
    {body && <dl className="detail-facts">
      <div><dt>Orbit around</dt><dd>{body.name === 'Sun' ? '—' : 'parent' in body ? body.parent : 'Sun'}</dd></div><div><dt>Orbital period</dt><dd>{body.periodLabel}</dd></div>
      <div><dt>Mass</dt><dd>{formatMass(body.massKg)}</dd></div><div><dt>{body.radiusBasis} diameter</dt><dd>{formatKilometers(body.physicalRadiusKm * 2)}</dd></div><div><dt>{body.radiusBasis} circumference</dt><dd>{formatKilometers(2 * Math.PI * body.physicalRadiusKm)}</dd></div>
      {body.name === 'Moon' && <><div><dt>Phase</dt><dd>{moonPhase.name}</dd></div><div><dt>Illumination</dt><dd>{Math.round(moonPhase.illumination * 100)}%</dd></div></>}{body.name === 'Earth' && <div><dt>Landmarks</dt><dd>3 marked sites</dd></div>}
    </dl>}
    {eclipse && (body?.name === 'Earth' || body?.name === 'Moon') && <div className="eclipse-alert"><strong>{eclipse.type}</strong><span>{eclipse.detail}</span></div>}
    {body?.name === 'Earth' && !observerActive && <button className="sky-view-button" onClick={onViewSky}><Telescope size={15} /> View sky from Earth</button>}
    {body && <button className="recenter" onClick={() => onFocus(body.name)}><Crosshair size={15} /> Recenter {body.name}</button>}
    {!body && <div className="scale-note"><span>MODEL NOTES</span><p>Sizes and distances are compressed for visibility. Paths use each body’s eccentricity, orbital tilt, and relative period; positions are illustrative.</p></div>}
  </aside>;
}
