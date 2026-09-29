import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { db } from '../../db/db';
import { setHabitValue } from '../../db/habits';
import { HABIT_SECTIONS, MAX_HABITS, type Habit, type HabitSection } from '../../db/types';
import { useToday } from '../../hooks/useToday';
import { lastDays } from '../../lib/calendar';
import { parseKey } from '../../lib/dates';
import {
  computeHabitStats,
  dayAggregate,
  groupLogs,
  isDoneValue,
  isScheduled,
  nextValueOnTap,
  progressOf,
  type LogMap,
} from '../../lib/habitStats';
import { clearDeliveredHabitReminders } from '../../lib/notifications';
import { useUI } from '../../state/ui';
import { BoltIcon, ChevronIcon, FlameIcon, PlusIcon } from '../Icons';
import { HabitDetail } from './HabitDetail';
import { HabitDialog } from './HabitDialog';
import { CheckRing, HabitAvatar, plural, type RingState } from './parts';

export function HabitsTab() {
  const habits = useLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []);
  const logs = useLiveQuery(() => db.habitLogs.toArray(), []);
  const today = useToday();
  const { showToast } = useUI();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<HabitSection>>(() => new Set());

  const byHabit = useMemo(() => groupLogs(logs ?? []), [logs]);
  const days = lastDays(today, 7);
  const detail = habits?.find((h) => h.id === detailId) ?? null;

  if (!habits || !logs) return <div className="page"><div className="empty">Loading…</div></div>;

  const openNew = () => {
    if (habits.length >= MAX_HABITS) {
      showToast(`You can track up to ${MAX_HABITS} habits. Delete one to add another.`);
      return;
    }
    setEditing('new');
  };

  const tap = async (h: Habit, key: string) => {
    const current = byHabit.get(h.id)?.get(key)?.value ?? 0;
    const next = nextValueOnTap(h, current);
    await setHabitValue(h.id, key, next);
    if (isDoneValue(h, next)) {
      try {
        navigator.vibrate?.(15);
      } catch {
        /* ignore */
      }
      if (key === today) void clearDeliveredHabitReminders(h);
    }
  };

  const toggleSection = (s: HabitSection) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className={`habits-layout${detail ? ' has-detail' : ''}`}>
      <main className="page habits-main" aria-label="Habits">
        <header className="page-header">
          <h1>
            Habits <span className="title-count">{habits.length}/{MAX_HABITS}</span>
          </h1>
          <button type="button" className="icon-btn" onClick={openNew} aria-label="Create habit">
            <PlusIcon />
          </button>
        </header>

        <div className="page-scroll">
          <div className="habit-week" role="list" aria-label="Last 7 days">
            {days.map((k) => {
              const agg = dayAggregate(habits, byHabit, k);
              const state: RingState = agg.state === 'none' ? 'off' : agg.state;
              return (
                <div key={k} role="listitem" className={`habit-week-day${k === today ? ' today' : ''}`}>
                  <span className="hw-name">{format(parseKey(k), 'EEE')}</span>
                  <span className="hw-num">{Number(k.slice(8))}</span>
                  <CheckRing state={state} progress={agg.progress} size={26} />
                </div>
              );
            })}
          </div>

          {habits.length === 0 && (
            <div className="habit-empty">
              <p className="habit-empty-title">No habits yet</p>
              <p className="muted">Track up to {MAX_HABITS} habits. Each one gets its own streak, calendar and reminders.</p>
              <button type="button" className="btn primary" onClick={openNew}>
                <PlusIcon size={16} /> Create habit
              </button>
            </div>
          )}

          {HABIT_SECTIONS.map(({ id, label }) => {
            const inSection = habits.filter((h) => h.section === id);
            if (!inSection.length) return null;
            const isCollapsed = collapsed.has(id);
            return (
              <section key={id} className="habit-section">
                <button type="button" className="section-toggle" onClick={() => toggleSection(id)} aria-expanded={!isCollapsed}>
                  <span className={`chevron${isCollapsed ? '' : ' open'}`}>
                    <ChevronIcon size={14} />
                  </span>
                  {label} <span className="section-count">{inSection.length}</span>
                </button>
                {!isCollapsed &&
                  inSection.map((h) => (
                    <HabitRow
                      key={h.id}
                      habit={h}
                      logs={byHabit.get(h.id) ?? new Map()}
                      days={days}
                      today={today}
                      selected={detailId === h.id}
                      onOpen={() => setDetailId(h.id)}
                      onTap={(k) => void tap(h, k)}
                    />
                  ))}
              </section>
            );
          })}
        </div>
      </main>

      {detail && (
        <HabitDetail
          key={detail.id}
          habit={detail}
          logs={byHabit.get(detail.id) ?? new Map()}
          today={today}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detail)}
        />
      )}

      {editing && <HabitDialog habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface RowProps {
  habit: Habit;
  logs: LogMap;
  days: string[];
  today: string;
  selected: boolean;
  onOpen: () => void;
  onTap: (key: string) => void;
}

function HabitRow({ habit, logs, days, today, selected, onOpen, onTap }: RowProps) {
  const stats = useMemo(() => computeHabitStats(habit, logs, today, today.slice(0, 7)), [habit, logs, today]);
  return (
    <div className={`habit-row${selected ? ' selected' : ''}`}>
      <button type="button" className="habit-open" onClick={onOpen} aria-label={`${habit.name}: details`}>
        <HabitAvatar habit={habit} size={40} />
        <span className="habit-text">
          <span className="habit-name">{habit.name}</span>
          <span className="habit-stats">
            <span className="hs total" title="Total check-ins">
              <BoltIcon size={12} /> {plural(stats.totalCheckIns, 'Day')}
            </span>
            <span className="hs streak" title="Current streak">
              <FlameIcon size={12} /> {plural(stats.currentStreak, 'Day')}
            </span>
          </span>
        </span>
      </button>
      <div className="habit-days">
        {days.map((k) => {
          const due = isScheduled(habit, k);
          const future = k > today;
          const value = logs.get(k)?.value ?? 0;
          const p = progressOf(habit, value);
          const state: RingState = !due ? 'off' : future ? 'future' : p >= 1 ? 'done' : p > 0 ? 'partial' : 'empty';
          const dayName = format(parseKey(k), 'EEEE, MMM d');
          return (
            <button
              key={k}
              type="button"
              className="habit-day"
              disabled={!due || future}
              onClick={() => onTap(k)}
              aria-label={`${habit.name}, ${dayName}: ${!due ? 'not scheduled' : state === 'done' ? 'done' : state === 'partial' ? `${value} of goal` : 'not done'}`}
            >
              <CheckRing state={state} progress={p} size={24} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
