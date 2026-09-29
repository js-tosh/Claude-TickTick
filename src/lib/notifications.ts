/**
 * Local notifications for the Android app: focus-timer alarms and habit
 * reminders. They are scheduled with the system alarm service, so they ring
 * even when the app is in the background or the screen is locked.
 * In a browser every function here is a no-op.
 */
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Habit } from '../db/types';
import { isDoneValue, isScheduled, type LogMap } from './habitStats';
import { shiftKey } from './daynum';
import { toDateTime, todayKey } from './dates';
import { isNative } from './platform';

const FOCUS_CHANNEL = 'focus-alarm';
const HABIT_CHANNEL = 'habit-reminders';
const FOCUS_IDS: [number, number] = [1000, 1999];
const HABIT_IDS: [number, number] = [2000, 9999];
const SMALL_ICON = 'ic_stat_tasks';
const ICON_COLOR = '#4772fa';
/** Habit reminders are scheduled this many days ahead and refreshed whenever the app opens. */
const HABIT_HORIZON_DAYS = 7;
/** A constant reminder re-alerts this many minutes later while not checked in. */
const CONSTANT_REPEATS_MIN = [10, 20];

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

let channelsReady: Promise<void> | null = null;
function ensureChannels(): Promise<void> {
  channelsReady ??= (async () => {
    await LocalNotifications.createChannel({
      id: FOCUS_CHANNEL,
      name: 'Focus timer',
      description: 'Rings when a focus block or a break ends',
      importance: 5,
      visibility: 1,
      vibration: true,
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

export interface AlarmPlan {
  at: number;
  to: 'focus' | 'break' | null;
}

export function scheduleFocusAlarms(plan: AlarmPlan[], activity: string): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await ensureChannels();
    await cancelPendingInRange(FOCUS_IDS);
    const upcoming = plan.filter((p) => p.at > Date.now() + 500);
    if (!upcoming.length || (await notificationPermission(false)) !== 'granted') return;
    const exact = await exactAllowed();
    const notifications: LocalNotificationSchema[] = upcoming.slice(0, FOCUS_IDS[1] - FOCUS_IDS[0]).map((p, i) => ({
      id: FOCUS_IDS[0] + i,
      title: p.to === null ? 'Session complete' : p.to === 'break' ? 'Focus block done' : 'Break is over',
      body:
        p.to === null
          ? `${activity}: open the app to rate how useful it was.`
          : p.to === 'break'
            ? `Nice work on ${activity}. Take a 5-minute break.`
            : `Back to ${activity}.`,
      channelId: FOCUS_CHANNEL,
      schedule: { at: new Date(p.at), allowWhileIdle: true },
      isExactNotification: exact,
      smallIcon: SMALL_ICON,
      iconColor: ICON_COLOR,
      extra: { kind: 'focus' },
    }));
    await LocalNotifications.schedule({ notifications });
  });
}

export function cancelFocusAlarms(): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(() => cancelPendingInRange(FOCUS_IDS));
}

// ---------------------------------------------------------------------------
// Habit reminders
// ---------------------------------------------------------------------------

export const habitNotificationTitle = (h: Pick<Habit, 'icon' | 'name'>) => `${h.icon} ${h.name}`;

/** Build the reminder list for the next few days (pure; exported for tests). */
export function planHabitReminders(
  habits: Habit[],
  logsByHabit: Map<string, LogMap>,
  now: Date,
  horizonDays = HABIT_HORIZON_DAYS,
): { habit: Habit; date: string; at: Date; followUp: boolean }[] {
  const out: { habit: Habit; date: string; at: Date; followUp: boolean }[] = [];
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

export function scheduleHabitReminders(habits: Habit[], logsByHabit: Map<string, LogMap>): Promise<unknown> {
  if (!isNative) return Promise.resolve();
  return serial(async () => {
    await ensureChannels();
    await cancelPendingInRange(HABIT_IDS);
    const plan = planHabitReminders(habits, logsByHabit, new Date());
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

export async function onNotificationTap(handler: (kind: 'focus' | 'habit' | undefined) => void): Promise<() => void> {
  if (!isNative) return () => undefined;
  const sub = await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    handler(e.notification.extra?.kind);
  });
  return () => void sub.remove();
}
