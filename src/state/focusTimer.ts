/**
 * The running focus session, kept outside React so it survives tab switches,
 * and persisted to localStorage so it survives the app being closed. Every
 * value is derived from timestamps (see lib/pomodoro), so a reopened app just
 * catches up to "now" and, if a scheduled session ended meanwhile, asks for
 * the rating.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { saveFocusSession } from '../db/focus';
import type { FocusMode, FocusSession } from '../db/types';
import { newId } from '../lib/ids';
import { cancelFocusAlarms, notificationPermission, scheduleFocusAlarms } from '../lib/notifications';
import { isNative } from '../lib/platform';
import {
  advance,
  finishTotals,
  pauseTimer,
  resumeTimer,
  skipPhase,
  startTimer,
  upcomingTransitions,
  type TimerState,
} from '../lib/pomodoro';
import { playChime, unlockAudio } from '../lib/sound';

const STORAGE_KEY = 'tt.focus.v1';
/** Sessions shorter than this are not worth recording. */
export const MIN_SESSION_MS = 60_000;
/** Alarms scheduled ahead of time (endless mode refills them as it goes). */
const ALARM_HORIZON = 16;

export interface FocusSnapshot {
  timer: TimerState | null;
  /** A finished session waiting for its 1–5 rating. */
  pendingRatingId: string | null;
  lastActivity: string;
  /** Android: alarms ring as system notifications (so no in-app chime is needed). */
  alarmsAsNotifications: boolean;
}

function load(): FocusSnapshot {
  const empty: FocusSnapshot = { timer: null, pendingRatingId: null, lastActivity: '', alarmsAsNotifications: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const v = JSON.parse(raw) as Partial<FocusSnapshot>;
    return { ...empty, ...v, alarmsAsNotifications: false };
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
  const running = !!snap.timer && snap.timer.pausedAt === null;
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

function syncAlarms(timer: TimerState | null) {
  if (!isNative) return;
  if (!timer || timer.pausedAt !== null) {
    void cancelFocusAlarms();
    return;
  }
  const plan = upcomingTransitions(timer, Date.now(), ALARM_HORIZON).map((t) => ({ at: t.at, to: t.to }));
  void scheduleFocusAlarms(plan, timer.activity);
}

async function finalize(timer: TimerState, endAt: number): Promise<'saved' | 'discarded'> {
  const totals = finishTotals(timer, endAt);
  void cancelFocusAlarms();
  if (totals.focusMs < MIN_SESSION_MS) {
    update({ timer: null });
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
    updatedAt: Date.now(),
  };
  // Saved right away (unrated) so nothing is lost if the app closes before rating.
  await saveFocusSession(session);
  update({ timer: null, pendingRatingId: session.id });
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
    update({ timer: r.state });
    syncAlarms(r.state); // endless mode: keep alarms scheduled ahead
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

export function startFocus(opts: { activity: string; mode: FocusMode; plannedMinutes?: number }) {
  unlockAudio(); // must run inside the tap that started the session
  const timer = startTimer({ id: newId(), ...opts }, Date.now());
  update({ timer, lastActivity: timer.activity });
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
  return finalize(r.state, r.finishedAt ?? now);
}

export function askRating(sessionId: string) {
  update({ pendingRatingId: sessionId });
}

export function clearPendingRating() {
  update({ pendingRatingId: null });
}

// ---------------------------------------------------------------------------
// Wake-ups: catch up when the app comes back to the foreground.
// ---------------------------------------------------------------------------

function wake() {
  void tick();
  syncAlarms(snap.timer);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
  if (isNative) {
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void refreshPermission(false);
          wake();
        }
      }),
    );
  }
  // Resume where we left off after a restart.
  void refreshPermission(false).then(() => {
    update({});
    wake();
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
  const running = !!s.timer && s.timer.pausedAt === null;
  const now = useNow(running ? 250 : null);
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
