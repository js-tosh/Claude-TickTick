/**
 * Local notifications for the Android app: focus-timer alarms and habit
 * reminders. They are scheduled with the system alarm service, so they ring
 * even when the app is in the background or the screen is locked.
 * In a browser every function here is a no-op.
 */
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Habit } from '../db/types';
import type { LogMap } from './habitStats';
import { isNative } from './platform';
import { HABIT_HORIZON_DAYS, planHabitReminders } from './reminderPlan';

// v2: the channel carries a real ringtone (res/raw/focus_alarm.wav). A channel's
// sound can't be changed after creation, so the old silent-by-default one is deleted.
const FOCUS_CHANNEL = 'focus-alarm-v2';
const OLD_FOCUS_CHANNEL = 'focus-alarm';
const HABIT_CHANNEL = 'habit-reminders';
const FOCUS_IDS: [number, number] = [1000, 1999];
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

let channelsReady: Promise<void> | null = null;
function ensureChannels(): Promise<void> {
  channelsReady ??= (async () => {
    await LocalNotifications.deleteChannel({ id: OLD_FOCUS_CHANNEL }).catch(() => undefined);
    await LocalNotifications.createChannel({
      id: FOCUS_CHANNEL,
      name: 'Focus timer alarm',
      description: 'Rings when a focus block or a break ends, and repeats until you confirm',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'focus_alarm.wav',
    });
    await LocalNotifications.registerActionTypes({
      types: [
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
        : `Nice work on ${activity}. Tap Start break to begin your 5-minute break.`,
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
        channelId: FOCUS_CHANNEL,
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

export interface NotificationTap {
  kind: 'focus' | 'habit' | undefined;
  /** 'tap' for the notification body, or a button's id (CONFIRM_ACTION_ID). */
  actionId: string;
}

export async function onNotificationTap(handler: (tap: NotificationTap) => void): Promise<() => void> {
  if (!isNative) return () => undefined;
  const sub = await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    handler({ kind: e.notification.extra?.kind, actionId: e.actionId });
  });
  return () => void sub.remove();
}
