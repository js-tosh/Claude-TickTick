import { db } from './db';
import {
  GOAL_DAY_OPTIONS,
  HABIT_COLORS,
  HABIT_SECTIONS,
  MAX_HABITS,
  MAX_REMINDERS,
  type Habit,
  type HabitLog,
  type HabitSection,
  type WeekdayIndex,
} from './types';
import { newId } from '../lib/ids';
import { isValidKey, todayKey } from '../lib/dates';

export class HabitLimitError extends Error {
  constructor() {
    super(`You can track up to ${MAX_HABITS} habits. Delete one to add another.`);
    this.name = 'HabitLimitError';
  }
}

export type HabitInput = Omit<Habit, 'id' | 'sortOrder' | 'createdAt' | 'updatedAt'>;

export function defaultHabitInput(): HabitInput {
  return {
    name: '',
    icon: '😊',
    color: HABIT_COLORS[0],
    frequency: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
    goal: { type: 'all' },
    startDate: todayKey(),
    goalDays: null,
    section: 'others',
    reminders: [],
    constantReminder: false,
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Clean up user input so stored habits are always well-formed. */
export function normalizeHabitInput(input: HabitInput): HabitInput {
  const days = [...new Set(input.frequency.type === 'weekdays' ? input.frequency.days : [])]
    .filter((d): d is WeekdayIndex => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  const frequency: Habit['frequency'] =
    input.frequency.type === 'interval'
      ? { type: 'interval', every: clampInt(input.frequency.every, 1, 365) }
      : { type: 'weekdays', days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] };
  const goal: Habit['goal'] =
    input.goal.type === 'amount'
      ? { type: 'amount', amount: clampInt(input.goal.amount, 1, 9999), unit: input.goal.unit.trim().slice(0, 24) }
      : { type: 'all' };
  const reminders = [...new Set(input.reminders.filter((r) => TIME_RE.test(r)))].sort().slice(0, MAX_REMINDERS);
  return {
    name: input.name.trim().slice(0, 60) || 'Untitled habit',
    icon: input.icon || '😊',
    color: input.color || HABIT_COLORS[0],
    frequency,
    goal,
    startDate: isValidKey(input.startDate) ? input.startDate : todayKey(),
    goalDays: GOAL_DAY_OPTIONS.includes(input.goalDays) ? input.goalDays : input.goalDays ? clampInt(input.goalDays, 1, 3650) : null,
    section: HABIT_SECTIONS.some((s) => s.id === input.section) ? (input.section as HabitSection) : 'others',
    reminders,
    constantReminder: Boolean(input.constantReminder) && reminders.length > 0,
  };
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export async function createHabit(input: HabitInput): Promise<Habit> {
  return db.transaction('rw', db.habits, async () => {
    if ((await db.habits.count()) >= MAX_HABITS) throw new HabitLimitError();
    const last = await db.habits.orderBy('sortOrder').last();
    const now = Date.now();
    const habit: Habit = {
      ...normalizeHabitInput(input),
      id: newId(),
      sortOrder: (last?.sortOrder ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.habits.add(habit);
    return habit;
  });
}

export async function updateHabit(id: string, input: HabitInput): Promise<void> {
  await db.habits.update(id, { ...normalizeHabitInput(input), updatedAt: Date.now() });
}

export async function deleteHabit(id: string): Promise<void> {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

export const logId = (habitId: string, date: string) => `${habitId}:${date}`;

/** Set a day's value. A day with no value and no note is removed. */
export async function setHabitValue(habitId: string, date: string, value: number, note?: string): Promise<void> {
  const id = logId(habitId, date);
  await db.transaction('rw', db.habitLogs, async () => {
    const existing = await db.habitLogs.get(id);
    const nextNote = (note ?? existing?.note ?? '').slice(0, 2000);
    const nextValue = Math.max(0, Math.floor(value));
    if (nextValue === 0 && !nextNote.trim()) {
      await db.habitLogs.delete(id);
      return;
    }
    const log: HabitLog = { id, habitId, date, value: nextValue, note: nextNote, updatedAt: Date.now() };
    await db.habitLogs.put(log);
  });
}
