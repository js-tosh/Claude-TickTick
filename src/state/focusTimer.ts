/**
 * The running focus session, kept outside React so it survives tab switches,
 * and persisted to localStorage so it survives the app being closed. Every
 * value is derived from timestamps (see lib/pomodoro), so a reopened app just
 * catches up to "now" and, if a scheduled session ended meanwhile, asks for
 * the rating.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { saveFocusSession } from '../db/focus';
import { setHabitValue } from '../db/habits';
import type { FocusMode, FocusSession, Habit } from '../db/types';
import { todayKey } from '../lib/dates';
import { goalAmount } from '../lib/habitStats';
import { clearDeliveredHabitReminders } from '../lib/notifications';
import { getSettings } from './settings';
import { newId } from '../lib/ids';
import { cancelFocusAlarms, notificationPermission, scheduleFocusAlarm } from '../lib/notifications';
import { FOCUS_MIN } from '../lib/pomodoro';
import { isNative } from '../lib/platform';
import {
  advance,
  confirmPhase,
  finishTotals,
  nextTransition,
  pauseTimer,
  resumeTimer,
  skipPhase,
  startTimer,
  type TimerState,
} from '../lib/pomodoro';
import { playChime, unlockAudio } from '../lib/sound';

const STORAGE_KEY = 'tt.focus.v1';
/** Sessions shorter than this are not worth recording. */
export const MIN_SESSION_MS = 60_000;

export interface FocusSnapshot {
  timer: TimerState | null;
  /** A finished session waiting for its 1–5 rating. */
  pendingRatingId: string | null;
  /** Habit checked in by the session that just ended (shown once, then cleared). */
  lastCheckedIn: { habitId: string; name: string; icon: string } | null;
  lastActivity: string;
  /** Android: alarms ring as system notifications (so no in-app chime is needed). */
  alarmsAsNotifications: boolean;
}

function load(): FocusSnapshot {
  const empty: FocusSnapshot = { timer: null, pendingRatingId: null, lastCheckedIn: null, lastActivity: '', alarmsAsNotifications: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const v = JSON.parse(raw) as Partial<FocusSnapshot>;
    // Timers saved by an older version have no confirmation fields.
    const timer = v.timer
      ? {
          ...v.timer,
          awaitingConfirm: v.timer.awaitingConfirm ?? false,
          waitingSince: v.timer.waitingSince ?? null,
          focusMin: v.timer.focusMin ?? FOCUS_MIN,
          habitId: v.timer.habitId ?? null,
        }
      : null;
    return { ...empty, ...v, timer, lastCheckedIn: null, alarmsAsNotifications: false };
  } catch {
    return empty;
  }
}

let snap: FocusSnapshot = load();
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function update(next: Partial<FocusSnapshot>) {
  snap = { ...snap, ...next };
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ timer: snap.timer, pendingRatingId: snap.pendingRatingId, lastActivity: snap.lastActivity }),
    );
  } catch {
    /* storage full or blocked: the timer still works for this run */
  }
  for (const l of listeners) l();
  const running = !!snap.timer && snap.timer.pausedAt === null && !snap.timer.awaitingConfirm;
  if (running && !interval) interval = setInterval(tick, 1000);
  if (!running && interval) {
    clearInterval(interval);
    interval = null;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getFocusSnapshot(): FocusSnapshot {
  return snap;
}

/**
 * Keep the system alarm in step with the timer. Called when the user changes
 * the timer (start, pause, resume, skip, confirm, end) and when the app comes
 * to the foreground; never from a background tick, so an alarm that has just
 * rung is left alone until the user acts on it.
 */
function syncAlarms(timer: TimerState | null) {
  if (!isNative) return;
  if (!timer) {
    // Session over. Its "rate me" alarm keeps repeating until the app is opened.
    if (document.visibilityState === 'visible') void cancelFocusAlarms();
    return;
  }
  if (timer.awaitingConfirm) return; // the phase-end alarm keeps repeating until confirmed
  if (timer.pausedAt !== null) {
    void cancelFocusAlarms();
    return;
  }
  const next = nextTransition(timer, Date.now());
  void scheduleFocusAlarm(next && { at: next.at, to: next.to }, timer.activity);
}

/** A session started from a habit checks that habit in for today when it ends. */
async function checkInLinkedHabit(habitId: string | null): Promise<Habit | null> {
  if (!habitId) return null;
  try {
    const habit = await db.habits.get(habitId);
    if (!habit) return null;
    const today = todayKey();
    const current = (await db.habitLogs.get(`${habitId}:${today}`))?.value ?? 0;
    if (current < goalAmount(habit)) await setHabitValue(habitId, today, goalAmount(habit));
    void clearDeliveredHabitReminders(habit);
    return habit;
  } catch {
    return null;
  }
}

async function finalize(timer: TimerState, endAt: number): Promise<'saved' | 'discarded'> {
  const totals = finishTotals(timer, endAt);
  const habit = await checkInLinkedHabit(timer.habitId);
  const lastCheckedIn = habit ? { habitId: habit.id, name: habit.name, icon: habit.icon } : null;
  if (totals.focusMs < MIN_SESSION_MS) {
    update({ timer: null, lastCheckedIn });
    return 'discarded';
  }
  const session: FocusSession = {
    id: timer.id,
    activity: timer.activity,
    mode: timer.mode,
    plannedMinutes: timer.plannedMinutes,
    startedAt: timer.startedAt,
    endedAt: totals.endedAt,
    focusMs: totals.focusMs,
    breakMs: totals.breakMs,
    pomodoros: totals.pomodoros,
    rating: null,
    habitId: timer.habitId,
    updatedAt: Date.now(),
  };
  // Saved right away (unrated) so nothing is lost if the app closes before rating.
  await saveFocusSession(session);
  update({ timer: null, pendingRatingId: session.id, lastCheckedIn });
  syncAlarms(null);
  return 'saved';
}

let ticking = false;
async function tick() {
  const timer = snap.timer;
  if (!timer || timer.pausedAt !== null || ticking) return;
  const now = Date.now();
  const r = advance(timer, now);
  if (!r.transitions.length) return;
  ticking = true;
  try {
    const last = r.transitions[r.transitions.length - 1];
    // Ring in the app for a change that just happened. Changes missed while the
    // phone slept already rang as notifications.
    if (!snap.alarmsAsNotifications && now - last.at < 5000) {
      playChime(last.to === null ? 'done' : last.to === 'break' ? 'focusEnd' : 'breakEnd');
    }
    if (r.finishedAt !== null) {
      await finalize(r.state, r.finishedAt);
      return;
    }
    // The timer now waits for confirmation. The alarm already scheduled for
    // this moment keeps repeating on its own, so the alarms are not touched.
    update({ timer: r.state });
  } finally {
    ticking = false;
  }
}

async function refreshPermission(request: boolean) {
  if (!isNative) return;
  const p = await notificationPermission(request);
  update({ alarmsAsNotifications: p === 'granted' });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function startFocus(opts: { activity: string; mode: FocusMode; plannedMinutes?: number; habitId?: string | null }) {
  unlockAudio(); // must run inside the tap that started the session
  const timer = startTimer({ id: newId(), focusMin: getSettings().focusMin, ...opts }, Date.now());
  update({ timer, lastActivity: timer.activity, lastCheckedIn: null });
  void refreshPermission(true).then(() => syncAlarms(snap.timer));
}

export function pauseFocus() {
  if (!snap.timer) return;
  const now = Date.now();
  const timer = pauseTimer(advance(snap.timer, now).state, now);
  update({ timer });
  syncAlarms(timer);
}

export function resumeFocus() {
  if (!snap.timer) return;
  unlockAudio();
  const timer = resumeTimer(snap.timer, Date.now());
  update({ timer });
  syncAlarms(timer);
}

/** The user confirmed the next phase (in the app or from the notification). */
export function confirmFocusPhase() {
  if (!snap.timer?.awaitingConfirm) return;
  unlockAudio();
  const timer = confirmPhase(snap.timer, Date.now());
  update({ timer });
  syncAlarms(timer);
}

export function skipFocusPhase() {
  if (!snap.timer) return;
  const now = Date.now();
  const timer = skipPhase(advance(snap.timer, now).state, now);
  update({ timer });
  syncAlarms(timer);
}

/** End the session now. Short sessions are discarded rather than saved. */
export async function stopFocus(): Promise<'saved' | 'discarded' | 'none'> {
  if (!snap.timer) return 'none';
  const now = Date.now();
  const r = advance(snap.timer, now);
  const result = await finalize(r.state, r.finishedAt ?? now);
  if (result === 'discarded') void cancelFocusAlarms();
  return result;
}

export function askRating(sessionId: string) {
  update({ pendingRatingId: sessionId });
}

export function clearPendingRating() {
  update({ pendingRatingId: null, lastCheckedIn: null });
}

export function clearLastCheckedIn() {
  update({ lastCheckedIn: null });
}

// ---------------------------------------------------------------------------
// Wake-ups: catch up when the app comes back to the foreground.
// ---------------------------------------------------------------------------

async function wake() {
  await tick(); // catch up first, so the alarms match the timer's real state
  syncAlarms(snap.timer);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wake();
  });
  if (isNative) {
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void refreshPermission(false);
          void wake();
        }
      }),
    );
  }
  // Resume where we left off after a restart.
  void refreshPermission(false).then(() => {
    update({});
    void wake();
  });
}

// ---------------------------------------------------------------------------
// React bindings
// ---------------------------------------------------------------------------

/** The session state without the 4-per-second clock (for dialogs and badges). */
export function useFocusSnapshot(): FocusSnapshot {
  return useSyncExternalStore(subscribe, getFocusSnapshot);
}

export function useFocusTimer(): FocusSnapshot & { now: number } {
  const s = useSyncExternalStore(subscribe, getFocusSnapshot);
  const running = !!s.timer && s.timer.pausedAt === null && !s.timer.awaitingConfirm;
  // Fast clock while counting down; a slow one while waiting (for "ended 12 min ago").
  const now = useNow(running ? 250 : s.timer?.awaitingConfirm ? 15_000 : null);
  return { ...s, now };
}

function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (intervalMs === null) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
