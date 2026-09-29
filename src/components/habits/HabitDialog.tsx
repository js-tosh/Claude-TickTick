import { useState } from 'react';
import { createHabit, defaultHabitInput, HabitLimitError, updateHabit, type HabitInput } from '../../db/habits';
import {
  GOAL_DAY_OPTIONS,
  HABIT_COLORS,
  HABIT_ICONS,
  HABIT_SECTIONS,
  MAX_REMINDERS,
  type Habit,
  type HabitSection,
  type WeekdayIndex,
} from '../../db/types';
import { describeFrequency } from '../../lib/habitStats';
import { notificationPermission } from '../../lib/notifications';
import { isNative } from '../../lib/platform';
import { useUI } from '../../state/ui';
import { ChevronDownIcon, CloseIcon, HelpIcon, PencilIcon, PlusIcon } from '../Icons';
import { Modal } from '../Modal';
import { HabitAvatar } from './parts';

const WEEKDAYS: { i: WeekdayIndex; short: string; long: string }[] = [
  { i: 0, short: 'S', long: 'Sunday' },
  { i: 1, short: 'M', long: 'Monday' },
  { i: 2, short: 'T', long: 'Tuesday' },
  { i: 3, short: 'W', long: 'Wednesday' },
  { i: 4, short: 'T', long: 'Thursday' },
  { i: 5, short: 'F', long: 'Friday' },
  { i: 6, short: 'S', long: 'Saturday' },
];

function toInput(h: Habit): HabitInput {
  const { id: _id, sortOrder: _s, createdAt: _c, updatedAt: _u, ...rest } = h;
  return rest;
}

function nextReminderTime(existing: string[]): string {
  if (!existing.length) return '09:00';
  const last = [...existing].sort()[existing.length - 1];
  const h = Math.min(23, Number(last.slice(0, 2)) + 1);
  const candidate = `${String(h).padStart(2, '0')}:${last.slice(3)}`;
  return existing.includes(candidate) ? '20:00' : candidate;
}

export function HabitDialog({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const [form, setForm] = useState<HabitInput>(() => (habit ? toInput(habit) : defaultHabitInput()));
  const [iconOpen, setIconOpen] = useState(false);
  const [freqOpen, setFreqOpen] = useState(false);
  const [goalHelp, setGoalHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useUI();

  const set = <K extends keyof HabitInput>(key: K, value: HabitInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const weekdays = form.frequency.type === 'weekdays' ? form.frequency.days : [];
  const toggleDay = (d: WeekdayIndex) =>
    set('frequency', {
      type: 'weekdays',
      days: weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort((a, b) => a - b),
    });

  const setReminder = (i: number, value: string) => set('reminders', form.reminders.map((r, j) => (j === i ? value : r)));
  const removeReminder = (i: number) => {
    const next = form.reminders.filter((_, j) => j !== i);
    setForm((f) => ({ ...f, reminders: next, constantReminder: next.length ? f.constantReminder : false }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Give the habit a name.');
      return;
    }
    if (form.frequency.type === 'weekdays' && form.frequency.days.length === 0) {
      setError('Pick at least one day of the week.');
      setFreqOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (habit) await updateHabit(habit.id, form);
      else await createHabit(form);
      let msg = habit ? 'Habit updated' : 'Habit created';
      if (form.reminders.length && isNative && (await notificationPermission(true)) !== 'granted') {
        msg += '. Allow notifications in Android settings to get reminders.';
      }
      showToast(msg);
      onClose();
    } catch (e) {
      setError(e instanceof HabitLimitError ? e.message : `Could not save the habit: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={habit ? 'Edit Habit' : 'Create Habit'}
      onClose={onClose}
      className="habit-modal"
      footer={
        <>
          <button type="button" className="btn wide" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary wide" onClick={save} disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <form
        className="habit-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="hf-top">
          <button type="button" className="hf-icon" onClick={() => setIconOpen((o) => !o)} aria-expanded={iconOpen} aria-label="Change icon and color">
            <HabitAvatar habit={form} size={40} />
            <span className="hf-icon-edit" aria-hidden="true">
              <PencilIcon size={10} />
            </span>
          </button>
          <input
            id="hf-name"
            className="hf-input"
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Eat Salads"
            aria-label="Habit name"
            maxLength={60}
            autoComplete="off"
          />
        </div>

        {iconOpen && (
          <div className="icon-picker">
            <div className="emoji-grid" role="radiogroup" aria-label="Icon">
              {HABIT_ICONS.map((ic) => (
                <button key={ic} type="button" role="radio" aria-checked={form.icon === ic} className={form.icon === ic ? 'on' : ''} onClick={() => set('icon', ic)}>
                  {ic}
                </button>
              ))}
            </div>
            <div className="color-row" role="radiogroup" aria-label="Color">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={form.color === c}
                  aria-label={`Color ${c}`}
                  className={`color-swatch${form.color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="hf-grid">
          <span className="hf-label" id="hf-frequency-label">
            Frequency
          </span>
          <div className="hf-control">
            <button
              type="button"
              className="select-like"
              aria-labelledby="hf-frequency-label"
              aria-expanded={freqOpen}
              onClick={() => setFreqOpen((o) => !o)}
            >
              <span>{describeFrequency(form.frequency)}</span>
              <ChevronDownIcon size={16} />
            </button>
            {freqOpen && (
              <div className="freq-panel">
                <div className="segmented small" role="radiogroup" aria-label="Repeat pattern">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.frequency.type === 'weekdays'}
                    className={form.frequency.type === 'weekdays' ? 'on' : ''}
                    onClick={() => set('frequency', { type: 'weekdays', days: weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6] })}
                  >
                    Days of the week
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.frequency.type === 'interval'}
                    className={form.frequency.type === 'interval' ? 'on' : ''}
                    onClick={() => set('frequency', { type: 'interval', every: form.frequency.type === 'interval' ? form.frequency.every : 2 })}
                  >
                    Every few days
                  </button>
                </div>
                {form.frequency.type === 'weekdays' ? (
                  <div className="weekday-toggles">
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d.i}
                        type="button"
                        aria-pressed={weekdays.includes(d.i)}
                        aria-label={d.long}
                        className={weekdays.includes(d.i) ? 'on' : ''}
                        onClick={() => toggleDay(d.i)}
                      >
                        {d.short}
                      </button>
                    ))}
                  </div>
                ) : (
                  <label className="interval-row">
                    Every
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={form.frequency.every}
                      onChange={(e) => set('frequency', { type: 'interval', every: Math.max(1, Number(e.target.value) || 2) })}
                    />
                    days, counting from the start date
                  </label>
                )}
              </div>
            )}
          </div>

          <label className="hf-label" htmlFor="hf-goal">
            Goal
          </label>
          <div className="hf-control">
            <select
              id="hf-goal"
              className="select"
              value={form.goal.type}
              onChange={(e) => set('goal', e.target.value === 'amount' ? { type: 'amount', amount: 8, unit: 'times' } : { type: 'all' })}
            >
              <option value="all">Achieve it all</option>
              <option value="amount">Reach a certain amount</option>
            </select>
            {form.goal.type === 'amount' && (
              <div className="amount-row">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  aria-label="Amount per day"
                  value={form.goal.amount}
                  onChange={(e) => form.goal.type === 'amount' && set('goal', { ...form.goal, amount: Number(e.target.value) || 1 })}
                />
                <input
                  type="text"
                  aria-label="Unit"
                  placeholder="glasses"
                  maxLength={24}
                  value={form.goal.unit}
                  onChange={(e) => form.goal.type === 'amount' && set('goal', { ...form.goal, unit: e.target.value })}
                />
                <span className="muted small">a day</span>
              </div>
            )}
          </div>

          <label className="hf-label" htmlFor="hf-start">
            Start Date
          </label>
          <div className="hf-control">
            <input id="hf-start" className="select" type="date" value={form.startDate} onChange={(e) => e.target.value && set('startDate', e.target.value)} />
          </div>

          <span className="hf-label">
            <label htmlFor="hf-goaldays">Goal Days</label>
            <button type="button" className="help-btn" onClick={() => setGoalHelp((v) => !v)} aria-expanded={goalHelp} aria-label="What are goal days?">
              <HelpIcon size={14} />
            </button>
          </span>
          <div className="hf-control">
            <select
              id="hf-goaldays"
              className="select"
              value={form.goalDays ?? ''}
              onChange={(e) => set('goalDays', e.target.value ? Number(e.target.value) : null)}
            >
              {GOAL_DAY_OPTIONS.map((v) => (
                <option key={v ?? 'forever'} value={v ?? ''}>
                  {v ? `${v} days` : 'Forever'}
                </option>
              ))}
            </select>
            {goalHelp && <p className="muted small hf-help">How many check-ins you are aiming for. The habit page shows how many are left.</p>}
          </div>

          <label className="hf-label" htmlFor="hf-section">
            Section
          </label>
          <div className="hf-control">
            <select id="hf-section" className="select" value={form.section} onChange={(e) => set('section', e.target.value as HabitSection)}>
              {HABIT_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <span className="hf-label">Reminder</span>
          <div className="hf-control reminders">
            {form.reminders.map((r, i) => (
              <span key={i} className="reminder-chip">
                <input type="time" value={r} onChange={(e) => e.target.value && setReminder(i, e.target.value)} aria-label={`Reminder ${i + 1}`} />
                <button type="button" onClick={() => removeReminder(i)} aria-label={`Remove reminder ${r}`}>
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
            {form.reminders.length < MAX_REMINDERS && (
              <button type="button" className="icon-btn boxed" onClick={() => set('reminders', [...form.reminders, nextReminderTime(form.reminders)])} aria-label="Add reminder">
                <PlusIcon size={16} />
              </button>
            )}
          </div>

          <label className="hf-label" htmlFor="hf-constant">
            Constant Reminder
          </label>
          <div className="hf-control">
            <label className={`switch${form.reminders.length ? '' : ' disabled'}`}>
              <input
                id="hf-constant"
                type="checkbox"
                role="switch"
                checked={form.constantReminder && form.reminders.length > 0}
                disabled={!form.reminders.length}
                onChange={(e) => set('constantReminder', e.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
        </div>

        {form.constantReminder && form.reminders.length > 0 && (
          <p className="muted small hf-note">The reminder stays pinned in your notifications and rings again 10 and 20 minutes later until you check in.</p>
        )}
        {!isNative && form.reminders.length > 0 && <p className="muted small hf-note">Reminders ring in the Android app. The web version can't send them.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
