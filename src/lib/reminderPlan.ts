import type { Habit } from '../db/types';
import { isDoneValue, isScheduled, type LogMap } from './habitStats';
import { shiftKey } from './daynum';
import { toDateTime, todayKey } from './dates';

/** Habit reminders are scheduled this many days ahead and refreshed whenever the app opens. */
export const HABIT_HORIZON_DAYS = 7;
/** A constant reminder re-alerts this many minutes later while not checked in. */
export const CONSTANT_REPEATS_MIN = [10, 20];

export interface PlannedReminder {
  habit: Habit;
  date: string;
  at: Date;
  followUp: boolean;
}

/** Build the reminder list for the next few days (pure; exported for tests). */
export function planHabitReminders(
  habits: Habit[],
  logsByHabit: Map<string, LogMap>,
  now: Date,
  horizonDays = HABIT_HORIZON_DAYS,
): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const today = todayKey(now);
  for (let d = 0; d < horizonDays; d++) {
    const date = shiftKey(today, d);
    for (const habit of habits) {
      if (!habit.reminders.length || !isScheduled(habit, date)) continue;
      const log = logsByHabit.get(habit.id)?.get(date);
      if (log && isDoneValue(habit, log.value)) continue;
      for (const time of habit.reminders) {
        const base = toDateTime(date, time).getTime();
        const offsets = [0, ...(habit.constantReminder ? CONSTANT_REPEATS_MIN : [])];
        for (const off of offsets) {
          const at = new Date(base + off * 60_000);
          if (at.getTime() > now.getTime() + 1000) out.push({ habit, date, at, followUp: off > 0 });
        }
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

