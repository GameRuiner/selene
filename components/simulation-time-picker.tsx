'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { eventPlaybackDate, eventsForYear, sameLocalDay, type AstronomyEvent } from '@/lib/astronomy/events';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type SimulationTimePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  onEventView: (event: AstronomyEvent) => void;
};

function timeInputValue(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
}

const CalendarEditor = memo(function CalendarEditor({ initialValue, onChange, onEventTime }: { initialValue: Date; onChange: (date: Date) => void; onEventTime: (event: AstronomyEvent) => void }) {
  const [month, setMonth] = useState(() => new Date(initialValue.getFullYear(), initialValue.getMonth(), 1));
  const [pickerDate, setPickerDate] = useState(() => initialValue);
  const [captionPicker, setCaptionPicker] = useState<'month' | 'year' | null>(null);
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(initialValue.getFullYear() / 20) * 20);
  const events = useMemo(() => eventsForYear(month.getFullYear()), [month]);
  const selectedEvents = events.filter((event) => sameLocalDay(event.date, pickerDate));
  const eventDates = (kind: AstronomyEvent['kind']) => events.filter((event) => event.kind === kind).map((event) => event.date);

  const selectEvent = (event: AstronomyEvent) => {
    const next = eventPlaybackDate(event);
    setPickerDate(next);
    onEventTime(event);
  };

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
        fixedWeeks
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
          asteroidFlyby: eventDates('asteroid-flyby'),
        }}
        modifiersClassNames={{
          equinox: 'calendar-equinox',
          solstice: 'calendar-solstice',
          solarEclipse: 'calendar-solar-eclipse',
          lunarEclipse: 'calendar-lunar-eclipse',
          asteroidFlyby: 'calendar-asteroid-flyby',
        }}
      />
      <div className="calendar-legend" aria-label="Astronomical event legend">
        <span><i className="equinox" /> Equinox</span><span><i className="solstice" /> Solstice</span>
        <span><i className="solar-eclipse" /> Solar eclipse (global)</span><span><i className="lunar-eclipse" /> Lunar eclipse</span>
        <span><i className="asteroid-flyby" /> Asteroid flyby</span>
      </div>
      <div className="selected-date-events" aria-live="polite">
        {selectedEvents.map((event) => {
          const isEclipse = event.kind === 'solar-eclipse' || event.kind === 'lunar-eclipse';
          const observation = event.kind === 'solar-eclipse' ? event.observation : undefined;
          const isFlyby = event.kind === 'asteroid-flyby';
          const action = isFlyby ? `View ${event.label}, six hours before closest approach` : observation ? `${event.label} from ${observation.location.label}, five minutes before local first contact` : `Set simulation to ${isEclipse ? `the ${event.approximateStart ? 'approximate ' : ''}start of ` : ''}${event.label}`;
          const timePrefix = observation || isFlyby ? 'View from ' : event.approximateStart ? 'Approx. start ' : isEclipse ? 'Starts ' : '';
          const eventTime = observation
            ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: observation.location.timeZone ?? 'UTC', timeZoneName: 'short' }).format(observation.date)
            : new Intl.DateTimeFormat(undefined, { timeStyle: 'short', ...(!sameLocalDay(event.date, eventPlaybackDate(event)) ? { dateStyle: 'medium' as const } : {}) }).format(eventPlaybackDate(event));

          return <div className="selected-date-event" key={`${event.kind}-${event.date.toISOString()}`}>
            <button className="event-time-button" onClick={() => selectEvent(event)} aria-label={observation ? `View ${action}` : action}><i className={event.kind} /><span>{event.label}</span><time>{timePrefix}{eventTime}{observation ? ` · ${observation.location.label}` : isFlyby ? ' · 6h before closest' : ''}</time></button>
          </div>;
        })}
      </div>
      <label className="simulation-time-input"><span>TIME</span><input type="time" step="1" value={timeInputValue(pickerDate)} onChange={(event) => selectTime(event.target.value)} /></label>
    </>
  );
});

export function SimulationTimePicker({ value, onChange, onEventView }: SimulationTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [editorValue, setEditorValue] = useState(() => value);
  const onChangeRef = useRef(onChange);
  const onEventViewRef = useRef(onEventView);
  useEffect(() => {
    onChangeRef.current = onChange;
    onEventViewRef.current = onEventView;
  }, [onChange, onEventView]);
  const changeEditorDate = useCallback((date: Date) => onChangeRef.current(date), []);
  const selectEventTime = useCallback((event: AstronomyEvent) => {
    onEventViewRef.current(event);
    setOpen(false);
  }, []);
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
        {open && <CalendarEditor initialValue={editorValue} onChange={changeEditorDate} onEventTime={selectEventTime} />}
      </PopoverContent>
    </Popover>
  );
}
