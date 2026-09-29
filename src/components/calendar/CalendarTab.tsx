import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { Folder, List, Task } from '../../db/types';
import { useToday } from '../../hooks/useToday';
import { addMonths, keyParts, monthGrid, weekKeys } from '../../lib/calendar';
import { formatDayHeading, parseKey } from '../../lib/dates';
import { daysInMonth, shiftKey } from '../../lib/daynum';
import { useUI } from '../../state/ui';
import { ChevronIcon, ChevronLeftIcon } from '../Icons';
import { QuickAdd } from '../QuickAdd';
import { TaskDetail } from '../TaskDetail';
import { TaskRow } from '../TaskRow';

type Mode = 'month' | 'week' | 'day';
const MODE_KEY = 'tt.calendarMode';
const MODES: { id: Mode; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

function readMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'week' || v === 'day' ? v : 'month';
  } catch {
    return 'month';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Open before done; timed tasks by time, then by priority. */
function calendarOrder(a: Task, b: Task): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  if ((a.dueTime ?? '') !== (b.dueTime ?? '')) {
    if (!a.dueTime) return 1;
    if (!b.dueTime) return -1;
    return a.dueTime < b.dueTime ? -1 : 1;
  }
  return b.priority - a.priority || a.sortOrder - b.sortOrder;
}

interface Props {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  inbox: List;
}

export function CalendarTab({ tasks, lists, folders, inbox }: Props) {
  const today = useToday();
  const [mode, setModeState] = useState<Mode>(readMode);
  const [cursor, setCursor] = useState(today);
  const { selectedTaskId, selectTask } = useUI();

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.parentId || !t.dueDate) continue;
      const arr = m.get(t.dueDate);
      if (arr) arr.push(t);
      else m.set(t.dueDate, [t]);
    }
    for (const arr of m.values()) arr.sort(calendarOrder);
    return m;
  }, [tasks]);
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);

  const move = (dir: -1 | 1) => {
    if (mode === 'month') {
      const { year, month0, day } = keyParts(cursor);
      const n = addMonths(year, month0, dir);
      setCursor(`${n.year}-${pad(n.month0 + 1)}-${pad(Math.min(day, daysInMonth(n.year, n.month0)))}`);
    } else {
      setCursor(shiftKey(cursor, mode === 'week' ? 7 * dir : dir));
    }
  };

  const week = weekKeys(cursor);
  const title =
    mode === 'month'
      ? format(parseKey(cursor), 'MMMM yyyy')
      : mode === 'week'
        ? `${format(parseKey(week[0]), 'MMM d')} – ${format(parseKey(week[6]), week[0].slice(5, 7) === week[6].slice(5, 7) ? 'd' : 'MMM d')}`
        : format(parseKey(cursor), 'EEEE, MMM d');

  const rowProps = { listById, selectedTaskId, onSelect: selectTask };

  return (
    <div className={`calendar-layout${selectedTaskId ? ' has-detail' : ''}`}>
      <main className="calendar-main" aria-label="Calendar">
        <header className="page-header">
          <h1>{title}</h1>
          <div className="header-actions">
            <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label={`Previous ${mode}`}>
              <ChevronLeftIcon />
            </button>
            <button type="button" className="btn small" onClick={() => setCursor(today)} disabled={cursor === today}>
              Today
            </button>
            <button type="button" className="icon-btn" onClick={() => move(1)} aria-label={`Next ${mode}`}>
              <ChevronIcon />
            </button>
          </div>
        </header>
        <div className="segmented full cal-modes" role="radiogroup" aria-label="Calendar view">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <QuickAdd
          listId={inbox.id}
          defaults={{ dueDate: cursor }}
          placeholder={`Add a task on ${cursor === today ? 'today' : format(parseKey(cursor), 'EEE, MMM d')}…`}
        />
        <div className="calendar-body">
          {mode === 'month' && <MonthView cursor={cursor} today={today} byDate={byDate} onPick={setCursor} {...rowProps} />}
          {mode === 'week' && <WeekView days={week} cursor={cursor} today={today} byDate={byDate} onPick={setCursor} {...rowProps} />}
          {mode === 'day' && <DayView date={cursor} today={today} items={byDate.get(cursor) ?? []} {...rowProps} />}
        </div>
      </main>
      {selectedTaskId && <TaskDetail key={selectedTaskId} taskId={selectedTaskId} lists={lists} folders={folders} />}
    </div>
  );
}

interface RowProps {
  listById: Map<string, List>;
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
}

function Agenda({ items, empty, listById, selectedTaskId, onSelect }: RowProps & { items: Task[]; empty: string }) {
  if (!items.length) return <div className="section-empty">{empty}</div>;
  return (
    <>
      {items.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          list={listById.get(t.listId)}
          showList
          selected={selectedTaskId === t.id}
          onSelect={onSelect}
          dueStyle="time"
        />
      ))}
    </>
  );
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function MonthView({
  cursor,
  today,
  byDate,
  onPick,
  ...rowProps
}: RowProps & { cursor: string; today: string; byDate: Map<string, Task[]>; onPick: (k: string) => void }) {
  const { year, month0 } = keyParts(cursor);
  const month = cursor.slice(0, 7);
  let grid = monthGrid(year, month0);
  // Drop a trailing week that belongs entirely to the next month.
  if (!grid.slice(35).some((k) => k.startsWith(month))) grid = grid.slice(0, 35);
  const items = byDate.get(cursor) ?? [];
  const openCount = items.filter((t) => t.status === 'open').length;

  return (
    <div className="calendar-scroll">
      <div className="month-grid">
        {WEEKDAY_LETTERS.map((d, i) => (
          <div key={i} className="month-weekday" aria-hidden="true">
            {d}
          </div>
        ))}
        {grid.map((k) => {
          const dayItems = byDate.get(k) ?? [];
          const open = dayItems.filter((t) => t.status === 'open').length;
          const cls = [
            'month-cell',
            k.startsWith(month) ? '' : 'out',
            k === today ? 'today' : '',
            k === cursor ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={k}
              type="button"
              className={cls}
              onClick={() => onPick(k)}
              aria-label={`${format(parseKey(k), 'EEEE, MMMM d')}${open ? `, ${open} task${open === 1 ? '' : 's'}` : ''}`}
              aria-pressed={k === cursor}
            >
              <span className="month-daynum">{Number(k.slice(8))}</span>
              <span className="month-items" aria-hidden="true">
                {dayItems.slice(0, 2).map((t) => (
                  <span key={t.id} className={`month-chip p${t.priority}${t.status === 'done' ? ' done' : ''}`}>
                    {t.title}
                  </span>
                ))}
                {dayItems.length > 2 && <span className="month-more">+{dayItems.length - 2}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <section className="agenda">
        <h3 className="section-title">
          {formatDayHeading(cursor)}
          {openCount > 0 && <span className="section-count">{openCount}</span>}
        </h3>
        <Agenda items={items} empty="No tasks on this day." {...rowProps} />
      </section>
    </div>
  );
}

function WeekView({
  days,
  cursor,
  today,
  byDate,
  onPick,
  ...rowProps
}: RowProps & { days: string[]; cursor: string; today: string; byDate: Map<string, Task[]>; onPick: (k: string) => void }) {
  return (
    <div className="calendar-scroll">
      <div className="week-strip" role="radiogroup" aria-label="Day of the week">
        {days.map((k) => {
          const open = (byDate.get(k) ?? []).filter((t) => t.status === 'open').length;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={k === cursor}
              className={`week-day${k === today ? ' today' : ''}${k === cursor ? ' selected' : ''}`}
              onClick={() => onPick(k)}
            >
              <span className="week-day-name">{format(parseKey(k), 'EEE')}</span>
              <span className="week-day-num">{Number(k.slice(8))}</span>
              <span className="week-day-count">{open ? open : ''}</span>
            </button>
          );
        })}
      </div>
      {days.map((k) => (
        <section key={k} className={`agenda${k === cursor ? ' selected' : ''}`}>
          <h3 className={`section-title${k === today ? ' is-today' : ''}`}>
            <button type="button" className="linklike" onClick={() => onPick(k)}>
              {formatDayHeading(k)}
            </button>
          </h3>
          <Agenda items={byDate.get(k) ?? []} empty="Nothing planned." {...rowProps} />
        </section>
      ))}
    </div>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function DayView({ date, today, items, ...rowProps }: RowProps & { date: string; today: string; items: Task[] }) {
  const hoursRef = useRef<HTMLDivElement>(null);
  const allDay = items.filter((t) => !t.dueTime);
  const byHour = new Map<number, Task[]>();
  for (const t of items) {
    if (!t.dueTime) continue;
    const h = Number(t.dueTime.slice(0, 2));
    const arr = byHour.get(h);
    if (arr) arr.push(t);
    else byHour.set(h, [t]);
  }
  const nowHour = new Date().getHours();
  const isToday = date === today;
  const firstTimed = items.find((t) => t.dueTime)?.dueTime;

  // Start the timeline near "now" on today, or at the first timed task / 8 AM.
  useEffect(() => {
    const box = hoursRef.current;
    if (!box) return;
    const target = isToday ? Math.max(0, nowHour - 1) : firstTimed ? Number(firstTimed.slice(0, 2)) : 8;
    const row = box.querySelector<HTMLElement>(`[data-hour="${target}"]`);
    if (row) box.scrollTop = row.offsetTop - box.offsetTop;
  }, [date, isToday, nowHour, firstTimed]);

  return (
    <div className="day-view">
      <section className="agenda all-day">
        <h3 className="section-title">All day</h3>
        <Agenda items={allDay} empty="No all-day tasks." {...rowProps} />
      </section>
      <div className="hours" ref={hoursRef} aria-label="Timeline">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} data-hour={h} className={`hour-row${isToday && h === nowHour ? ' now' : ''}`}>
            <div className="hour-label">{hourLabel(h)}</div>
            <div className="hour-items">
              {(byHour.get(h) ?? []).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  list={rowProps.listById.get(t.listId)}
                  showList
                  selected={rowProps.selectedTaskId === t.id}
                  onSelect={rowProps.onSelect}
                  dueStyle="time"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
