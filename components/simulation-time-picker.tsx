'use client';

import { memo, useMemo, useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import {
  Body,
  GeoMoon,
  GeoVector,
  KM_PER_AU,
  NextGlobalSolarEclipse,
  NextLunarEclipse,
  Search,
  SearchGlobalSolarEclipse,
  SearchLunarEclipse,
  Seasons,
} from 'astronomy-engine';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type AstronomyEvent = {
  date: Date;
  kind: 'equinox' | 'solstice' | 'solar-eclipse' | 'lunar-eclipse';
  label: string;
  approximateStart?: boolean;
};

type SimulationTimePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
};

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const SUN_RADIUS_KM = 695_700;
const MOON_MEAN_RADIUS_KM = 1_737.4;
const EARTH_MEAN_RADIUS_KM = 6_371;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sameLocalDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function solarEclipseStart(eclipse: ReturnType<typeof SearchGlobalSolarEclipse>) {
  // Find first contact anywhere on Earth: the instant the Moon's penumbra
  // first touches the mean Earth sphere. Search expects a rising zero crossing.
  const contact = Search((time) => {
    const sun = GeoVector(Body.Sun, time, true);
    const moon = GeoMoon(time);
    const targetX = -moon.x;
    const targetY = -moon.y;
    const targetZ = -moon.z;
    const directionX = moon.x - sun.x;
    const directionY = moon.y - sun.y;
    const directionZ = moon.z - sun.z;
    const directionSquared = directionX ** 2 + directionY ** 2 + directionZ ** 2;
    const projection = (directionX * targetX + directionY * targetY + directionZ * targetZ) / directionSquared;
    const shadowDistance = KM_PER_AU * Math.hypot(
      projection * directionX - targetX,
      projection * directionY - targetY,
      projection * directionZ - targetZ,
    );
    const penumbraRadius = -SUN_RADIUS_KM + (1 + projection) * (SUN_RADIUS_KM + MOON_MEAN_RADIUS_KM);
    return penumbraRadius + EARTH_MEAN_RADIUS_KM - shadowDistance;
  }, eclipse.peak.AddDays(-0.3), eclipse.peak);

  return contact
    ? { date: contact.date, approximate: false }
    : { date: new Date(eclipse.peak.date.getTime() - 150 * MINUTE_MS), approximate: true };
}

function eventsForYear(year: number): AstronomyEvent[] {
  const seasons = Seasons(year);
  const events: AstronomyEvent[] = [
    { date: seasons.mar_equinox.date, kind: 'equinox', label: 'March equinox' },
    { date: seasons.jun_solstice.date, kind: 'solstice', label: 'June solstice' },
    { date: seasons.sep_equinox.date, kind: 'equinox', label: 'September equinox' },
    { date: seasons.dec_solstice.date, kind: 'solstice', label: 'December solstice' },
  ];
  const searchStart = new Date(Date.UTC(year, 0, 1) - DAY_MS);
  const searchEnd = new Date(Date.UTC(year + 1, 0, 1) + DAY_MS);
  let solar = SearchGlobalSolarEclipse(searchStart);
  while (solar.peak.date < searchEnd) {
    const start = solarEclipseStart(solar);
    if (start.date.getFullYear() === year) {
      const label = `${capitalize(solar.kind)} solar eclipse`;
      events.push({
        date: start.date,
        kind: 'solar-eclipse',
        label,
        approximateStart: start.approximate,
      });
    }
    solar = NextGlobalSolarEclipse(solar.peak);
  }
  let lunar = SearchLunarEclipse(searchStart);
  while (lunar.peak.date < searchEnd) {
    const start = new Date(lunar.peak.date.getTime() - lunar.sd_penum * MINUTE_MS);
    if (start.getFullYear() === year) {
      const label = `${capitalize(lunar.kind)} lunar eclipse`;
      events.push({ date: start, kind: 'lunar-eclipse', label });
    }
    lunar = NextLunarEclipse(lunar.peak);
  }
  return events.sort((first, second) => first.date.getTime() - second.date.getTime());
}

function timeInputValue(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
}

const CalendarEditor = memo(function CalendarEditor({ initialValue, onChange }: { initialValue: Date; onChange: (date: Date) => void }) {
  const [month, setMonth] = useState(() => new Date(initialValue.getFullYear(), initialValue.getMonth(), 1));
  const [pickerDate, setPickerDate] = useState(() => initialValue);
  const [captionPicker, setCaptionPicker] = useState<'month' | 'year' | null>(null);
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(initialValue.getFullYear() / 20) * 20);
  const events = useMemo(() => eventsForYear(month.getFullYear()), [month]);
  const selectedEvents = events.filter((event) => sameLocalDay(event.date, pickerDate));
  const eventDates = (kind: AstronomyEvent['kind']) => events.filter((event) => event.kind === kind).map((event) => event.date);

  const selectDay = (day: Date | undefined) => {
    if (!day) return;
    const astronomyEvent = events.find((event) => sameLocalDay(event.date, day));
    if (astronomyEvent) {
      setPickerDate(astronomyEvent.date);
      onChange(astronomyEvent.date);
      return;
    }
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), pickerDate.getHours(), pickerDate.getMinutes(), pickerDate.getSeconds());
    setPickerDate(next);
    onChange(next);
  };
  const selectTime = (time: string) => {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const next = new Date(pickerDate);
    next.setHours(hours, minutes, seconds || 0, 0);
    setPickerDate(next);
    onChange(next);
  };
  const setNow = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setPickerDate(now);
    onChange(now);
  };

  return (
    <>
      <div className="time-popover-heading"><span>DATE & TIME</span><button onClick={setNow}><RotateCcw size={13} /> Set to now</button></div>
      <Calendar
        mode="single"
        month={month}
        onMonthChange={(nextMonth) => {
          setMonth(nextMonth);
          setCaptionPicker(null);
          setYearPageStart(Math.floor(nextMonth.getFullYear() / 20) * 20);
        }}
        selected={pickerDate}
        onSelect={selectDay}
        components={{
          MonthCaption: ({ className }) => <div className={`${className ?? ''} calendar-grid-caption`}>
            <button type="button" onClick={() => setCaptionPicker(captionPicker === 'month' ? null : 'month')} aria-expanded={captionPicker === 'month'}>{new Intl.DateTimeFormat(undefined, { month: 'long' }).format(month)}</button>
            <button type="button" onClick={() => { setYearPageStart(Math.floor(month.getFullYear() / 20) * 20); setCaptionPicker(captionPicker === 'year' ? null : 'year'); }} aria-expanded={captionPicker === 'year'}>{month.getFullYear()}</button>
            {captionPicker === 'month' && <div className="calendar-picker-panel month-grid" aria-label="Choose month">
              {Array.from({ length: 12 }, (_, index) => <button type="button" key={index} className={index === month.getMonth() ? 'selected' : ''} onClick={() => { setMonth(new Date(month.getFullYear(), index, 1)); setCaptionPicker(null); }}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2020, index, 1))}</button>)}
            </div>}
            {captionPicker === 'year' && <div className="calendar-picker-panel year-picker" aria-label="Choose year">
              <div><button type="button" disabled={yearPageStart <= 1900} onClick={() => setYearPageStart((year) => Math.max(1900, year - 20))}>←</button><span>{yearPageStart}–{Math.min(yearPageStart + 19, 2100)}</span><button type="button" disabled={yearPageStart + 20 > 2100} onClick={() => setYearPageStart((year) => Math.min(2080, year + 20))}>→</button></div>
              <section>{Array.from({ length: Math.min(20, 2101 - yearPageStart) }, (_, index) => yearPageStart + index).map((year) => <button type="button" key={year} className={year === month.getFullYear() ? 'selected' : ''} onClick={() => { setMonth(new Date(year, month.getMonth(), 1)); setCaptionPicker(null); }}>{year}</button>)}</section>
            </div>}
          </div>,
        }}
        modifiers={{
          equinox: eventDates('equinox'),
          solstice: eventDates('solstice'),
          solarEclipse: eventDates('solar-eclipse'),
          lunarEclipse: eventDates('lunar-eclipse'),
        }}
        modifiersClassNames={{
          equinox: 'calendar-equinox',
          solstice: 'calendar-solstice',
          solarEclipse: 'calendar-solar-eclipse',
          lunarEclipse: 'calendar-lunar-eclipse',
        }}
      />
      <div className="calendar-legend" aria-label="Astronomical event legend">
        <span><i className="equinox" /> Equinox</span><span><i className="solstice" /> Solstice</span>
        <span><i className="solar-eclipse" /> Solar eclipse (global)</span><span><i className="lunar-eclipse" /> Lunar eclipse</span>
      </div>
      {selectedEvents.length > 0 && <div className="selected-date-events" aria-live="polite">
        {selectedEvents.map((event) => {
          const isEclipse = event.kind === 'solar-eclipse' || event.kind === 'lunar-eclipse';
          const action = isEclipse ? `the ${event.approximateStart ? 'approximate ' : ''}start of ` : '';
          const timePrefix = event.approximateStart ? 'Approx. start ' : isEclipse ? 'Starts ' : '';

          return <div className="selected-date-event" key={`${event.kind}-${event.date.toISOString()}`}>
            <button className="event-time-button" onClick={() => { setPickerDate(event.date); onChange(event.date); }} aria-label={`Set simulation to ${action}${event.label}`}><i className={event.kind} /><span>{event.label}</span><time>{timePrefix}{new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(event.date)}</time></button>
          </div>;
        })}
      </div>}
      <label className="simulation-time-input"><span>TIME</span><input type="time" step="1" value={timeInputValue(pickerDate)} onChange={(event) => selectTime(event.target.value)} /></label>
    </>
  );
});

export function SimulationTimePicker({ value, onChange }: SimulationTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [editorValue, setEditorValue] = useState(() => value);
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
  const timeLabel = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(value);

  return (
    <Popover open={open} onOpenChange={(nextOpen, details) => {
      if (!nextOpen && details.reason === 'focus-out') return;
      setOpen(nextOpen);
      if (nextOpen) setEditorValue(value);
    }}>
      <PopoverTrigger className="simulation-time-trigger" aria-label={`Time: ${dateLabel}, ${timeLabel}`}>
        <CalendarDays size={17} />
        <span><small>TIME</small><strong>{dateLabel}</strong></span>
        <time dateTime={value.toISOString()}>{timeLabel}</time>
      </PopoverTrigger>
      <PopoverContent className="simulation-time-popover" align="center" side="top" sideOffset={10}>
        {open && <CalendarEditor initialValue={editorValue} onChange={onChange} />}
      </PopoverContent>
    </Popover>
  );
}
