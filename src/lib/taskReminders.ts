import { ALL_DAY_REMINDER_TIME, type Task } from '../db/types';
import { toDateTime } from './dates';

/** Task reminders are scheduled this many days ahead and refreshed whenever the app opens. */
export const TASK_HORIZON_DAYS = 7;

/** When a task's reminder should fire, or null if it has none. */
export function reminderFireTime(task: Pick<Task, 'dueDate' | 'dueTime' | 'reminderMinutes' | 'reminderTime' | 'status'>): Date | null {
  if (task.status !== 'open' || !task.dueDate) return null;
  if (task.reminderMinutes === null || task.reminderMinutes === undefined) return null;
  const base = toDateTime(task.dueDate, task.dueTime ?? task.reminderTime ?? ALL_DAY_REMINDER_TIME);
  return new Date(base.getTime() - task.reminderMinutes * 60_000);
}

export interface PlannedTaskReminder {
  task: Task;
  at: Date;
}

/** Open tasks whose reminder falls between now and the horizon, soonest first. */
export function planTaskReminders(tasks: Task[], now: Date, horizonDays = TASK_HORIZON_DAYS): PlannedTaskReminder[] {
  const end = now.getTime() + horizonDays * 86_400_000;
  const out: PlannedTaskReminder[] = [];
  for (const task of tasks) {
    if (task.parentId) continue;
    const at = reminderFireTime(task);
    if (!at) continue;
    const t = at.getTime();
    if (t > now.getTime() + 1000 && t <= end) out.push({ task, at });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** "At the due time", "10 min before", "On the day at 09:00" */
export function describeReminder(task: Pick<Task, 'dueTime' | 'reminderMinutes' | 'reminderTime'>): string {
  const m = task.reminderMinutes;
  if (m === null || m === undefined) return 'None';
  if (!task.dueTime) return `On the day at ${task.reminderTime ?? ALL_DAY_REMINDER_TIME}`;
  if (m === 0) return 'At the due time';
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'} before`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'} before`;
  return `${m} min before`;
}
