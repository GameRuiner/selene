'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import {
  NextGlobalSolarEclipse,
  NextLunarEclipse,
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
};

type SimulationTimePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
};

const DAY_MS = 86_400_000;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sameLocalDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
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
    if (solar.peak.date.getFullYear() === year) {
      events.push({ date: solar.peak.date, kind: 'solar-eclipse', label: `${capitalize(solar.kind)} solar eclipse` });
    }
    solar = NextGlobalSolarEclipse(solar.peak);
  }
  let lunar = SearchLunarEclipse(searchStart);
  while (lunar.peak.date < searchEnd) {
    if (lunar.peak.date.getFullYear() === year) {
      events.push({ date: lunar.peak.date, kind: 'lunar-eclipse', label: `${capitalize(lunar.kind)} lunar eclipse` });
    }
    lunar = NextLunarEclipse(lunar.peak);
  }
  return events.sort((first, second) => first.date.getTime() - second.date.getTime());
}

function timeInputValue(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
}

export function SimulationTimePicker({ value, onChange }: SimulationTimePickerProps) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const events = useMemo(() => eventsForYear(month.getFullYear()), [month]);
  const selectedEvents = events.filter((event) => sameLocalDay(event.date, value));
  const eventDates = (kind: AstronomyEvent['kind']) => events.filter((event) => event.kind === kind).map((event) => event.date);
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
  const timeLabel = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(value);

  const selectDay = (day: Date | undefined) => {
    if (!day) return;
    const astronomyEvent = events.find((event) => sameLocalDay(event.date, day));
    if (astronomyEvent) {
      onChange(astronomyEvent.date);
      return;
    }
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
    onChange(next);
  };
  const selectTime = (time: string) => {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const next = new Date(value);
    next.setHours(hours, minutes, seconds || 0, 0);
    onChange(next);
  };
  const setNow = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    onChange(now);
  };

  return (
    <Popover onOpenChange={(open) => { if (open) setMonth(new Date(value.getFullYear(), value.getMonth(), 1)); }}>
      <PopoverTrigger className="simulation-time-trigger" aria-label={`Simulation time: ${dateLabel}, ${timeLabel}`}>
        <CalendarDays size={17} />
        <span><small>SIMULATION TIME</small><strong>{dateLabel}</strong></span>
        <time dateTime={value.toISOString()}>{timeLabel}</time>
      </PopoverTrigger>
      <PopoverContent className="simulation-time-popover" align="center" side="top" sideOffset={10}>
        <div className="time-popover-heading"><span>SIMULATION DATE & TIME</span><button onClick={setNow}><RotateCcw size={13} /> Set to now</button></div>
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={value}
          onSelect={selectDay}
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
          {selectedEvents.map((event) => <button key={`${event.kind}-${event.date.toISOString()}`} onClick={() => onChange(event.date)} aria-label={`Set simulation to ${event.label}`}><i className={event.kind} /><span>{event.label}</span><time>{new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(event.date)}</time></button>)}
        </div>}
        <label className="simulation-time-input"><span>TIME</span><input type="time" step="1" value={timeInputValue(value)} onChange={(event) => selectTime(event.target.value)} /></label>
      </PopoverContent>
    </Popover>
  );
}
