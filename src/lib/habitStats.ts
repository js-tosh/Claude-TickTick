import type { Habit, HabitLog, WeekdayIndex } from '../db/types';
import { daysInMonth, dayToKey, diffDays, keyToDay, weekdayOfKey } from './daynum';

type HabitRule = Pick<Habit, 'frequency' | 'startDate' | 'goal'>;

/** date → log for one habit. */
export type LogMap = Map<string, HabitLog>;

export function goalAmount(habit: Pick<Habit, 'goal'>): number {
  return habit.goal.type === 'amount' ? Math.max(1, Math.floor(habit.goal.amount)) : 1;
}

export function isDoneValue(habit: Pick<Habit, 'goal'>, value: number): boolean {
  return value >= goalAmount(habit);
}

/** 0‥1 share of the day's goal. */
export function progressOf(habit: Pick<Habit, 'goal'>, value: number): number {
  return Math.max(0, Math.min(1, value / goalAmount(habit)));
}

/** Whether the habit is due on this day (never before its start date). */
export function isScheduled(habit: Pick<Habit, 'frequency' | 'startDate'>, key: string): boolean {
  if (key < habit.startDate) return false;
  const f = habit.frequency;
  if (f.type === 'weekdays') return f.days.includes(weekdayOfKey(key) as WeekdayIndex);
  const every = Math.max(1, Math.floor(f.every));
  return diffDays(key, habit.startDate) % every === 0;
}

/** What one tap on a habit's check circle does. */
export function nextValueOnTap(habit: Pick<Habit, 'goal'>, current: number): number {
  const goal = goalAmount(habit);
  if (current >= goal) return 0;
  return habit.goal.type === 'all' ? 1 : current + 1;
}

export function buildLogMap(logs: HabitLog[], habitId: string): LogMap {
  const m: LogMap = new Map();
  for (const l of logs) if (l.habitId === habitId) m.set(l.date, l);
  return m;
}

export function groupLogs(logs: HabitLog[]): Map<string, LogMap> {
  const out = new Map<string, LogMap>();
  for (const l of logs) {
    let m = out.get(l.habitId);
    if (!m) {
      m = new Map();
      out.set(l.habitId, m);
    }
    m.set(l.date, l);
  }
  return out;
}

function doneOn(habit: HabitRule, logs: LogMap, key: string): boolean {
  const l = logs.get(key);
  return !!l && isDoneValue(habit, l.value);
}

/**
 * Consecutive scheduled days that were completed, counting back from today.
 * Today only adds to the streak once done; an unfinished today does not break it.
 * Days the habit is not scheduled on are skipped.
 */
export function currentStreak(habit: HabitRule, logs: LogMap, today: string): number {
  let streak = 0;
  if (isScheduled(habit, today) && doneOn(habit, logs, today)) streak++;
  const start = keyToDay(habit.startDate);
  for (let n = keyToDay(today) - 1; n >= start; n--) {
    const key = dayToKey(n);
    if (!isScheduled(habit, key)) continue;
    if (!doneOn(habit, logs, key)) break;
    streak++;
  }
  return streak;
}

export interface HabitStats {
  /** Completed days ever (up to today). */
  totalCheckIns: number;
  /** Completed days in the given month. */
  monthCheckIns: number;
  /** Completed ÷ scheduled days in the month so far; null when nothing was due yet. */
  monthRate: number | null;
  currentStreak: number;
  /** Progress toward the goal-days target; null for "Forever". */
  goal: { done: number; target: number; left: number } | null;
}

/** @param month 'YYYY-MM' */
export function computeHabitStats(habit: Habit, logs: LogMap, today: string, month: string): HabitStats {
  let total = 0;
  let monthDone = 0;
  let sinceStart = 0;
  for (const [date, log] of logs) {
    if (date > today || !isDoneValue(habit, log.value)) continue;
    total++;
    if (date.startsWith(month)) monthDone++;
    if (date >= habit.startDate) sinceStart++;
  }

  const year = Number(month.slice(0, 4));
  const month0 = Number(month.slice(5, 7)) - 1;
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(year, month0)).padStart(2, '0')}`;
  const from = first > habit.startDate ? first : habit.startDate;
  const to = last < today ? last : today;
  let scheduled = 0;
  let doneScheduled = 0;
  for (let n = keyToDay(from), end = keyToDay(to); n <= end; n++) {
    const key = dayToKey(n);
    if (!isScheduled(habit, key)) continue;
    scheduled++;
    if (doneOn(habit, logs, key)) doneScheduled++;
  }

  return {
    totalCheckIns: total,
    monthCheckIns: monthDone,
    monthRate: scheduled ? doneScheduled / scheduled : null,
    currentStreak: currentStreak(habit, logs, today),
    goal: habit.goalDays
      ? { done: Math.min(sinceStart, habit.goalDays), target: habit.goalDays, left: Math.max(0, habit.goalDays - sinceStart) }
      : null,
  };
}

export type DayState = 'none' | 'empty' | 'partial' | 'done';

/** Combined progress of every habit due on a day (drives the week strip). */
export function dayAggregate(habits: Habit[], logsByHabit: Map<string, LogMap>, key: string): { state: DayState; progress: number } {
  let due = 0;
  let sum = 0;
  for (const h of habits) {
    if (!isScheduled(h, key)) continue;
    due++;
    const l = logsByHabit.get(h.id)?.get(key);
    sum += l ? progressOf(h, l.value) : 0;
  }
  if (!due) return { state: 'none', progress: 0 };
  const progress = sum / due;
  return { state: progress >= 1 ? 'done' : progress > 0 ? 'partial' : 'empty', progress };
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every day", "Every Wed, Fri, Sat", "Every weekday", "Every 3 days". */
export function describeFrequency(f: Habit['frequency']): string {
  if (f.type === 'interval') return f.every <= 1 ? 'Every day' : `Every ${f.every} days`;
  const days = [...f.days].sort((a, b) => a - b);
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'Every weekday';
  if (days.length === 2 && days[0] === 0 && days[1] === 6) return 'Every weekend';
  return `Every ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
}
