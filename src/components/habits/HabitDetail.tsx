import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { deleteHabit, setHabitValue } from '../../db/habits';
import { HABIT_SECTIONS, type Habit, type HabitLog } from '../../db/types';
import { addMonths, monthGrid } from '../../lib/calendar';
import { parseKey } from '../../lib/dates';
import { computeHabitStats, describeFrequency, goalAmount, isDoneValue, isScheduled, progressOf, type LogMap } from '../../lib/habitStats';
import { useBackHandler } from '../../lib/backStack';
import { clearDeliveredHabitReminders } from '../../lib/notifications';
import { startFocus, useFocusSnapshot } from '../../state/focusTimer';
import { useUI } from '../../state/ui';
import {
  ArrowLeftIcon,
  BoltIcon,
  CheckCircleIcon,
  ChevronIcon,
  ChevronLeftIcon,
  CloseIcon,
  FlameIcon,
  MinusIcon,
  MoreIcon,
  PlayIcon,
  PlusIcon,
  RateIcon,
  TimerIcon,
} from '../Icons';
import { Menu } from '../Menu';
import { Modal } from '../Modal';
import { CheckRing, HabitAvatar, plural, type RingState } from './parts';

interface Props {
  habit: Habit;
  logs: LogMap;
  today: string;
  onClose: () => void;
  onEdit: () => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HabitDetail({ habit, logs, today, onClose, onEdit }: Props) {
  useBackHandler(true, onClose);
  const { openDialog, setTab, showToast } = useUI();
  const { timer } = useFocusSnapshot();
  const doneToday = isDoneValue(habit, logs.get(today)?.value ?? 0);

  const startPomodoro = () => {
    if (timer) {
      showToast(`A session for "${timer.activity}" is already running`);
      setTab('focus');
      return;
    }
    startFocus({ activity: habit.name, mode: 'endless', habitId: habit.id });
    setTab('focus');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const stats = useMemo(() => computeHabitStats(habit, logs, today, month), [habit, logs, today, month]);
  const year = Number(month.slice(0, 4));
  const month0 = Number(month.slice(5, 7)) - 1;
  let grid = monthGrid(year, month0);
  if (!grid.slice(35).some((k) => k.startsWith(month))) grid = grid.slice(0, 35);
  const notes = [...logs.values()].filter((l) => l.date.startsWith(month) && l.note.trim()).sort((a, b) => b.date.localeCompare(a.date));
  const monthName = format(new Date(year, month0, 1), 'MMMM');
  const section = HABIT_SECTIONS.find((s) => s.id === habit.section)?.label ?? 'Others';

  const shiftMonth = (d: number) => {
    const n = addMonths(year, month0, d);
    setMonth(`${n.year}-${String(n.month0 + 1).padStart(2, '0')}`);
  };

  const confirmDelete = () =>
    openDialog({
      kind: 'confirm',
      title: `Delete "${habit.name}"?`,
      message: 'Its check-ins, streak and notes will be deleted too. This cannot be undone.',
      confirmLabel: 'Delete habit',
      danger: true,
      onConfirm: async () => {
        await deleteHabit(habit.id);
        onClose();
      },
    });

  const goal = stats.goal;
  const goalShare = goal ? goal.done / goal.target : 1;

  return (
    <aside className="detail habit-detail" aria-label={`${habit.name} details`}>
      <header className="detail-header">
        <button type="button" className="icon-btn detail-back" onClick={onClose} aria-label="Back to habits">
          <ArrowLeftIcon />
        </button>
        <span className="habit-detail-title">
          <HabitAvatar habit={habit} size={30} />
          <strong>{habit.name}</strong>
        </span>
        <div className="detail-actions">
          <Menu
            label="Habit options"
            trigger={<MoreIcon />}
            items={[
              { label: 'Start Pomodoro', icon: <TimerIcon size={16} />, onSelect: startPomodoro },
              { label: 'Edit habit', onSelect: onEdit },
              { label: 'Delete habit', danger: true, onSelect: confirmDelete },
            ]}
          />
          <button type="button" className="icon-btn detail-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="detail-scroll habit-detail-scroll">
        <p className="muted small habit-rule">
          {describeFrequency(habit.frequency)}
          {habit.goal.type === 'amount' && ` · ${habit.goal.amount} ${habit.goal.unit || 'times'} a day`} · {section} · since{' '}
          {format(parseKey(habit.startDate), 'MMM d, yyyy')}
        </p>
        <button type="button" className="btn primary pomodoro-btn" onClick={startPomodoro}>
          <PlayIcon size={16} /> Start Pomodoro
          <span className="pomodoro-btn-note">{doneToday ? 'already checked in today' : 'checks in when you end'}</span>
        </button>

        <div className="stat-grid">
          <StatCard tone="green" icon={<CheckCircleIcon size={14} />} label="Monthly check-ins" value={plural(stats.monthCheckIns, 'Day')} />
          <StatCard tone="blue" icon={<BoltIcon size={14} />} label="Total Check-Ins" value={plural(stats.totalCheckIns, 'Day')} />
          <StatCard
            tone="orange"
            icon={<RateIcon size={14} />}
            label="Monthly check-in rate"
            value={stats.monthRate === null ? '–' : `${Math.round(stats.monthRate * 100)} %`}
          />
          <StatCard tone="red" icon={<FlameIcon size={14} />} label="Current Streak" value={plural(stats.currentStreak, 'Day')} />
        </div>

        <div className="card goal-card">
          <div className="goal-text">
            {goal ? (
              <>
                <span className="goal-big">
                  {goal.done}/{goal.target}
                </span>
                <span className="muted small">{goal.left ? `${plural(goal.left, 'day')} left` : 'Goal reached'}</span>
              </>
            ) : (
              <>
                <span className="goal-big">{plural(stats.totalCheckIns, 'day')}</span>
                <span className="muted small">Goal: forever</span>
              </>
            )}
          </div>
          <Medal share={goalShare} reached={!!goal && goal.left === 0} />
        </div>

        <div className="card habit-cal">
          <div className="habit-cal-head">
            <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeftIcon size={16} />
            </button>
            <span className="habit-cal-title">{format(new Date(year, month0, 1), 'MMMM yyyy')}</span>
            <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronIcon size={16} />
            </button>
          </div>
          <div className="habit-cal-grid">
            {WEEKDAY_NAMES.map((d) => (
              <span key={d} className="hc-weekday" aria-hidden="true">
                {d}
              </span>
            ))}
            {grid.map((k) => {
              const inMonth = k.startsWith(month);
              const due = isScheduled(habit, k);
              const future = k > today;
              const value = logs.get(k)?.value ?? 0;
              const p = progressOf(habit, value);
              const state: RingState = !due ? 'off' : future ? 'future' : p >= 1 ? 'done' : p > 0 ? 'partial' : 'empty';
              return (
                <button
                  key={k}
                  type="button"
                  className={`hc-day${inMonth ? '' : ' out'}${k === today ? ' today' : ''}`}
                  disabled={!due || future}
                  onClick={() => setDayOpen(k)}
                  aria-label={`${format(parseKey(k), 'EEEE, MMMM d')}: ${!due ? 'not scheduled' : future ? 'upcoming' : state === 'done' ? 'done' : 'not done'}`}
                >
                  <span className="hc-num">{Number(k.slice(8))}</span>
                  <CheckRing state={state} progress={p} size={22} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="card habit-log">
          <h3 className="card-title">Habit Log on {monthName}</h3>
          {notes.length ? (
            <ul className="log-list">
              {notes.map((l) => (
                <li key={l.id}>
                  <button type="button" className="log-entry" onClick={() => setDayOpen(l.date)}>
                    <span className="log-date">{format(parseKey(l.date), 'EEE, MMM d')}</span>
                    <span className="log-note">{l.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No check-in thoughts to share this month yet</p>
          )}
          {today >= habit.startDate && (
            <button type="button" className="btn small" onClick={() => setDayOpen(today)}>
              Write about today
            </button>
          )}
        </div>
      </div>

      {dayOpen && <HabitDaySheet habit={habit} date={dayOpen} log={logs.get(dayOpen)} today={today} onClose={() => setDayOpen(null)} />}
    </aside>
  );
}

function StatCard({ tone, icon, label, value }: { tone: string; icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-label tone-${tone}`}>
        {icon} {label}
      </span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function Medal({ share, reached }: { share: number; reached: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`medal${reached ? ' reached' : ''}`} width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="medal-track" />
      <circle
        cx="32"
        cy="32"
        r={r}
        className="medal-arc"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, share)))}
        transform="rotate(-90 32 32)"
      />
      <circle cx="32" cy="32" r="19" className="medal-face" />
      <path d="M32 20.5l3.4 7 7.6 1-5.5 5.3 1.3 7.6L32 37.8l-6.8 3.6 1.3-7.6-5.5-5.3 7.6-1z" className="medal-star" />
    </svg>
  );
}

function HabitDaySheet({ habit, date, log, today, onClose }: { habit: Habit; date: string; log: HabitLog | undefined; today: string; onClose: () => void }) {
  const due = isScheduled(habit, date);
  const target = goalAmount(habit);
  const [value, setValue] = useState(log?.value ?? 0);
  const [note, setNote] = useState(log?.note ?? '');
  const done = isDoneValue(habit, value);

  const save = async () => {
    await setHabitValue(habit.id, date, due ? value : log?.value ?? 0, note);
    if (date === today && done) void clearDeliveredHabitReminders(habit);
    onClose();
  };

  return (
    <Modal
      title={format(parseKey(date), 'EEEE, MMM d')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      {due ? (
        habit.goal.type === 'amount' ? (
          <div className="field">
            <span className="field-label">Progress</span>
            <div className="stepper" role="group" aria-label="Amount done">
              <button type="button" className="icon-btn" onClick={() => setValue((v) => Math.max(0, v - 1))} disabled={value <= 0} aria-label="One less">
                <MinusIcon />
              </button>
              <output className="stepper-value">
                {value} / {target} {habit.goal.unit}
              </output>
              <button type="button" className="icon-btn" onClick={() => setValue((v) => v + 1)} aria-label="One more">
                <PlusIcon />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={`checkin-toggle${done ? ' on' : ''}`} onClick={() => setValue(done ? 0 : 1)} aria-pressed={done}>
            <CheckRing state={done ? 'done' : 'empty'} size={28} />
            {done ? 'Checked in' : 'Mark as done'}
          </button>
        )
      ) : (
        <p className="muted small">{habit.name} isn't scheduled on this day, but you can still write a note.</p>
      )}
      <label className="field">
        <span className="field-label">How did it go?</span>
        <textarea className="notes" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional thoughts for your habit log" maxLength={2000} />
      </label>
    </Modal>
  );
}
