/**
 * Notification buttons pressed while the app wasn't running (on a watch or the
 * lock screen) are handled natively and queued (NotificationActions.java).
 * This applies the queue: when the app starts, whenever it comes back to the
 * foreground, and straight away if it is running when a button is pressed.
 */
import { db } from '../db/db';
import { setHabitValue } from '../db/habits';
import { setTaskDone } from '../db/repo';
import { goalAmount } from '../lib/habitStats';
import { FocusAlarm, type QueuedAction } from '../lib/focusAlarmPlugin';
import { clearDeliveredHabitReminders, HABIT_CHECK_IN_ACTION_ID, TASK_DONE_ACTION_ID } from '../lib/notifications';
import { isNative } from '../lib/platform';
import { applyFocusButtonPresses } from './focusTimer';

let running: Promise<void> | null = null;

export function applyQueuedActions(): Promise<void> {
  if (!isNative) return Promise.resolve();
  // One at a time; a call while one runs is picked up by a second pass.
  const run = (running ?? Promise.resolve()).then(drain, drain);
  running = run;
  return run;
}

async function drain(): Promise<void> {
  let actions: QueuedAction[] = [];
  try {
    actions = (await FocusAlarm.takeQueuedActions()).actions ?? [];
  } catch {
    return;
  }
  if (!actions.length) return;
  const focus: QueuedAction[] = [];
  for (const a of actions) {
    try {
      if (a.kind === 'task' && a.actionId === TASK_DONE_ACTION_ID && a.taskId) {
        const task = await db.tasks.get(a.taskId);
        if (task && task.status === 'open') await setTaskDone(task.id, true);
      } else if (a.kind === 'habit' && a.actionId === HABIT_CHECK_IN_ACTION_ID && a.habitId && a.date) {
        await checkInHabit(a.habitId, a.date);
      } else if (a.kind === 'focus') {
        focus.push(a);
      }
    } catch {
      /* a task or habit deleted meanwhile: nothing to do */
    }
  }
  if (focus.length) await applyFocusButtonPresses(focus);
}

export async function checkInHabit(habitId: string, date: string): Promise<void> {
  const habit = await db.habits.get(habitId);
  if (!habit) return;
  const current = (await db.habitLogs.get(`${habitId}:${date}`))?.value ?? 0;
  if (current < goalAmount(habit)) await setHabitValue(habitId, date, goalAmount(habit));
  void clearDeliveredHabitReminders(habit);
}

if (isNative && typeof document !== 'undefined') {
  void applyQueuedActions();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void applyQueuedActions();
  });
  void FocusAlarm.addListener('queuedActions', () => void applyQueuedActions()).catch(() => undefined);
}
