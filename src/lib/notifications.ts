/**
 * Local notifications for the Android app: focus-timer alarms and habit
 * reminders. They are scheduled with the system alarm service, so they ring
 * even when the app is in the background or the screen is locked.
 * In a browser every function here is a no-op.
 */
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Habit, Task } from '../db/types';
import { planTaskReminders, TASK_HORIZON_DAYS } from './taskReminders';
import { formatDueLabel } from './dates';
import { FocusAlarm } from './focusAlarmPlugin';
import { BREAK_MIN } from './pomodoro';
import type { LogMap } from './habitStats';
import { isNative } from './platform';
import { HABIT_HORIZON_DAYS, planHabitReminders } from './reminderPlan';
import { getSettings, type AlarmSound } from '../state/settings';

// The focus alarm channel is created by the app's own FocusAlarm plugin so it can
// carry either the bundled chime or a ringtone the user picked. A channel's sound
// can't change after creation, so each sound gets its own channel id and the
// previous one is deleted.
const FOCUS_CHANNEL_PREFIX = 'focus-alarm-';
const LEGACY_FOCUS_CHANNELS = ['focus-alarm', 'focus-alarm-v2'];
const PREV_CHANNEL_KEY = 'tt.focusChannel';
const HABIT_CHANNEL = 'habit-reminders';
const TASK_CHANNEL = 'task-reminders';
const FOCUS_IDS: [number, number] = [1000, 1999];
const TASK_IDS: [number, number] = [10000, 19999];
/** One-off snoozed task reminders live in their own range so a re-sync doesn't drop them. */
const SNOOZE_IDS: [number, number] = [20000, 20999];
const ACTION_TASK = 'TASK_REMINDER';
export const TASK_DONE_ACTION_ID = 'done';
export const TASK_SNOOZE_ACTION_ID = 'snooze';
export const SNOOZE_MINUTES = 10;
/** Focus alarms repeat this often until the user confirms the next phase. */
export const FOCUS_REPEAT_MIN = 5;
/** How many repeats are scheduled ahead (an hour's worth). */
const FOCUS_REPEATS = 12;
/** Notification action types (buttons). */
const ACTION_TO_BREAK = 'FOCUS_TO_BREAK';
const ACTION_TO_FOCUS = 'FOCUS_TO_FOCUS';
const ACTION_DONE = 'FOCUS_DONE';
export const CONFIRM_ACTION_ID = 'confirm';
const HABIT_IDS: [number, number] = [2000, 9999];
const SMALL_ICON = 'ic_stat_tasks';
const ICON_COLOR = '#4772fa';

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** Channel id for the current alarm sound choice. */
export function focusChannelId(sound: AlarmSound | null = getSettings().alarmSound): string {
  if (!sound) return `${FOCUS_CHANNEL_PREFIX}chime`;
  let h = 0;
  for (const ch of sound.uri) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${FOCUS_CHANNEL_PREFIX}${h.toString(36)}`;
}

/** Create the channel for the chosen sound and drop the one used before. */
export async function ensureFocusChannel(): Promise<string> {
  const sound = getSettings().alarmSound;
  const id = focusChannelId(sound);
  if (!isNative) return id;
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(PREV_CHANNEL_KEY);
  } catch {
    /* ignore */
  }
  for (const old of [...LEGACY_FOCUS_CHANNELS, prev]) {
    if (old && old !== id) await FocusAlarm.deleteChannel({ id: old }).catch(() => undefined);
  }
  await FocusAlarm.ensureChannel({
    id,
    name: sound ? `Focus timer alarm (${sound.title})` : 'Focus timer alarm',
    description: 'Rings when a focus block or a break ends, and repeats until you confirm',
    soundUri: sound?.uri ?? null,
  });
  try {
    localStorage.setItem(PREV_CHANNEL_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

/** Open the alarm channel's page in Android settings (any sound, vibration, importance). */
export async function openFocusAlarmSettings(): Promise<void> {
  const id = await ensureFocusChannel();
  await FocusAlarm.openChannelSettings({ id });
}

let channelsReady: Promise<void> | null = null;
function ensureChannels(): Promise<void> {
  channelsReady ??= (async () => {
    await LocalNotifications.createChannel({
      id: TASK_CHANNEL,
      name: 'Task reminders',
      description: 'Reminders for tasks with a due time',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TASK,
          actions: [
            { id: TASK_DONE_ACTION_ID, title: 'Mark done', foreground: true },
            { id: TASK_SNOOZE_ACTION_ID, title: `Snooze ${SNOOZE_MINUTES} min`, foreground: true },
          ],
        },
        { id: ACTION_TO_BREAK, actions: [{ id: CONFIRM_ACTION_ID, title: 'Start break', foreground: true }] },
        { id: ACTION_TO_FOCUS, actions: [{ id: CONFIRM_ACTION_ID, title: 'Start focus', foreground: true }] },
        { id: ACTION_DONE, actions: [{ id: CONFIRM_ACTION_ID, title: 'Rate session', foreground: true }] },
      ],
    });
    await LocalNotifications.createChannel({
      id: HABIT_CHANNEL,
      name: 'Habit reminders',
      description: 'Reminders to check in on your habits',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  })().catch(() => undefined);
  return channelsReady;
}

export async function notificationPermission(request: boolean): Promise<NotificationPermission> {
  if (!isNative) return 'unsupported';
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && request) p = await LocalNotifications.requestPermissions();
    if (p.display === 'granted') return 'granted';
    return p.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/**
 * Exact alarms are granted automatically (USE_EXACT_ALARM in the manifest).
 * If a user revoked them anyway, schedule inexact ones instead of letting the
 * plugin open the system settings screen on every call.
 */
async function exactAllowed(): Promise<boolean> {
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return true;
  }
}

async function cancelPendingInRange([min, max]: [number, number]): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  const ids = notifications.filter((n) => n.id >= min && n.id <= max).map((n) => ({ id: n.id }));
  if (ids.length) await LocalNotifications.cancel({ notifications: ids });
}

// Calls are serialised so a quick pause/resume can't interleave cancel and schedule.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const run = queue.then(fn, fn).catch(() => undefined);
  queue = run;
  return run;
}

// ---------------------------------------------------------------------------
// Focus timer
// ---------------------------------------------------------------------------

export interface FocusAlarm {
  /** When the running phase ends. */
  at: number;
  /** What comes next: a break, a focus block, or nothing (session over). */
  to: 'focus' | 'break' | null;
}

async function clearDeliveredInRange([min, max]: [number, number]): Promise<void> {
  const { notifications } = await LocalNotifications.getDeliveredNotifications();
  const mine = notifications.filter((n) => n.id >= min && n.id <= max);
  if (mine.length) await LocalNotifications.removeDeliveredNotifications({ notifications: mine });
}

/**
 * Notification ids rotate between calls. The plugin dismisses any visible
 * notification whose id it is asked to schedule again, so reusing ids would
 * kill an alarm that just rang.
 */
let focusIdCycle = Math.floor(Date.now() / 1000) % 40;
function nextFocusIdBase(): number {
  focusIdCycle = (focusIdCycle + 1) % 40;
  return FOCUS_IDS[0] + focusIdCycle * 25;
}

function focusTexts(alarm: FocusAlarm, activity: string, repeat: number): { title: string; body: string; actionTypeId: string } {
  if (alarm.to === null) {
    return {
      title: repeat ? 'Session still waiting for a rating' : 'Session complete',
      body: `${activity}: tap Rate session to say how useful it was.`,
      actionTypeId: ACTION_DONE,
    };
  }
  if (alarm.to === 'break') {
    return {
      title: repeat ? 'Your break is waiting' : 'Focus block done',
      body: repeat
        ? `${activity} ended ${repeat * FOCUS_REPEAT_MIN} min ago. Tap Start break when you're ready.`
        : `Nice work on ${activity}. Tap Start break to begin your ${BREAK_MIN}-minute break.`,
      actionTypeId: ACTION_TO_BREAK,
    };
  }
  return {
    title: repeat ? 'Ready to focus again?' : 'Break is over',
    body: repeat
      ? `Your break ended ${repeat * FOCUS_REPEAT_MIN} min ago. Tap Start focus to continue ${activity}.`
      : `Tap Start focus to get back to ${activity}.`,
    actionTypeId: ACTION_TO_FOCUS,
  };
}

/**
 * Schedule the alarm for the running phase: it rings when the phase ends and
 * again every FOCUS_REPEAT_MIN minutes until the next phase is confirmed
 * (confirming cancels the rest). Replaces any earlier focus alarms.
 */
export function scheduleFocusAlarm(alarm: FocusAlarm | null, activity: string): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await ensureChannels();
    const channelId = await ensureFocusChannel();
    await cancelPendingInRange(FOCUS_IDS);
    await clearDeliveredInRange(FOCUS_IDS);
    if (!alarm || alarm.at <= Date.now() || (await notificationPermission(false)) !== 'granted') return;
    const exact = await exactAllowed();
    const base = nextFocusIdBase();
    const notifications: LocalNotificationSchema[] = Array.from({ length: FOCUS_REPEATS }, (_, i) => {
      const t = focusTexts(alarm, activity, i);
      return {
        id: base + i,
        title: t.title,
        body: t.body,
        actionTypeId: t.actionTypeId,
        channelId,
        schedule: { at: new Date(alarm.at + i * FOCUS_REPEAT_MIN * 60_000), allowWhileIdle: true },
        isExactNotification: exact,
        autoCancel: true,
        smallIcon: SMALL_ICON,
        iconColor: ICON_COLOR,
        extra: { kind: 'focus', to: alarm.to },
      };
    });
    await LocalNotifications.schedule({ notifications });
  });
}

/** Cancel pending focus alarms and remove any already showing. */
export function cancelFocusAlarms(): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await cancelPendingInRange(FOCUS_IDS);
    await clearDeliveredInRange(FOCUS_IDS);
  });
}

// ---------------------------------------------------------------------------
// Habit reminders
// ---------------------------------------------------------------------------

export const habitNotificationTitle = (h: Pick<Habit, 'icon' | 'name'>) => `${h.icon} ${h.name}`;

export function scheduleHabitReminders(habits: Habit[], logsByHabit: Map<string, LogMap>): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await ensureChannels();
    await cancelPendingInRange(HABIT_IDS);
    const plan = planHabitReminders(habits, logsByHabit, new Date(), HABIT_HORIZON_DAYS);
    if (!plan.length || (await notificationPermission(false)) !== 'granted') return;
    const exact = await exactAllowed();
    const notifications: LocalNotificationSchema[] = plan.slice(0, HABIT_IDS[1] - HABIT_IDS[0]).map((p, i) => ({
      id: HABIT_IDS[0] + i,
      title: habitNotificationTitle(p.habit),
      body: p.followUp ? 'Still to do today. Tap to check in.' : 'Time to check in.',
      channelId: HABIT_CHANNEL,
      schedule: { at: p.at, allowWhileIdle: true },
      isExactNotification: exact,
      // A constant reminder stays pinned until it is tapped or the habit is checked in.
      ongoing: p.habit.constantReminder,
      autoCancel: true,
      smallIcon: SMALL_ICON,
      iconColor: ICON_COLOR,
      extra: { kind: 'habit', habitId: p.habit.id, date: p.date },
    }));
    await LocalNotifications.schedule({ notifications });
  });
}

/** Remove a habit's reminders already showing in the tray (after checking in). */
export function clearDeliveredHabitReminders(habit: Pick<Habit, 'icon' | 'name'>): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    const { notifications } = await LocalNotifications.getDeliveredNotifications();
    const title = habitNotificationTitle(habit);
    const mine = notifications.filter((n) => n.title === title);
    if (mine.length) await LocalNotifications.removeDeliveredNotifications({ notifications: mine });
  });
}

// ---------------------------------------------------------------------------
// Task reminders
// ---------------------------------------------------------------------------

function taskNotification(task: Task, id: number, at: Date, snoozed: boolean): LocalNotificationSchema {
  const when = task.dueDate ? formatDueLabel(task.dueDate, task.dueTime) : '';
  return {
    id,
    title: task.title,
    body: snoozed ? `Snoozed reminder · due ${when}` : task.dueTime ? `Due ${when}` : `Due today`,
    actionTypeId: ACTION_TASK,
    channelId: TASK_CHANNEL,
    schedule: { at, allowWhileIdle: true },
    autoCancel: true,
    smallIcon: SMALL_ICON,
    iconColor: ICON_COLOR,
    extra: { kind: 'task', taskId: task.id },
  };
}

/**
 * Schedule reminders for the next week of tasks. Called whenever tasks change
 * and when the app opens; replaces the previous set. Snoozed ones are left alone.
 */
export function scheduleTaskReminders(tasks: Task[]): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await ensureChannels();
    await cancelPendingInRange(TASK_IDS);
    const plan = planTaskReminders(tasks, new Date(), TASK_HORIZON_DAYS);
    if (!plan.length || (await notificationPermission(false)) !== 'granted') return;
    const exact = await exactAllowed();
    const notifications = plan.slice(0, TASK_IDS[1] - TASK_IDS[0]).map((p, i) => ({
      ...taskNotification(p.task, TASK_IDS[0] + i, p.at, false),
      isExactNotification: exact,
    }));
    await LocalNotifications.schedule({ notifications });
  });
}

/** Ring again for one task in SNOOZE_MINUTES. */
export function snoozeTaskReminder(task: Task): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await ensureChannels();
    const exact = await exactAllowed();
    const id = SNOOZE_IDS[0] + (Math.floor(Date.now() / 1000) % (SNOOZE_IDS[1] - SNOOZE_IDS[0]));
    const at = new Date(Date.now() + SNOOZE_MINUTES * 60_000);
    await LocalNotifications.schedule({ notifications: [{ ...taskNotification(task, id, at, true), isExactNotification: exact }] });
  });
}

/** Drop any tray notification for a task that was just completed or deleted. */
export function clearDeliveredTaskReminders(taskId: string): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    const { notifications } = await LocalNotifications.getDeliveredNotifications();
    const mine = notifications.filter((n) => n.extra?.taskId === taskId || n.data?.taskId === taskId);
    if (mine.length) await LocalNotifications.removeDeliveredNotifications({ notifications: mine });
  });
}

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------

export interface NotificationTap {
  kind: 'focus' | 'habit' | 'task' | undefined;
  /** 'tap' for the notification body, or a button's id. */
  actionId: string;
  taskId?: string;
}

export async function onNotificationTap(handler: (tap: NotificationTap) => void): Promise<() => void> {
  if (!isNative) return () => undefined;
  const sub = await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    handler({ kind: e.notification.extra?.kind, actionId: e.actionId, taskId: e.notification.extra?.taskId });
  });
  return () => void sub.remove();
}
