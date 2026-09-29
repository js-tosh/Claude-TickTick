/**
 * Pomodoro engine. Pure functions over a small state object, driven by
 * wall-clock timestamps rather than counting ticks, so the timer stays correct
 * when the phone sleeps, the app is backgrounded, or the app is killed and
 * reopened (the state is persisted and simply re-evaluated against "now").
 */
import type { FocusMode } from '../db/types';

export const FOCUS_MIN = 25;
export const BREAK_MIN = 5;
/** Scheduled sessions are picked in steps of this many minutes. */
export const SCHEDULE_STEP_MIN = 45;
export const SCHEDULE_MAX_STEPS = 12;

const MIN = 60_000;

export type PhaseKind = 'focus' | 'break';

export interface PlannedPhase {
  kind: PhaseKind;
  ms: number;
}

export interface TimerState {
  id: string;
  activity: string;
  mode: FocusMode;
  /** Scheduled mode: the whole plan. Endless mode: null (focus/break alternate forever). */
  plan: PlannedPhase[] | null;
  plannedMinutes: number | null;
  startedAt: number;
  phaseIndex: number;
  /** When the current phase started, shifted forward by any pauses. */
  phaseStart: number;
  pausedAt: number | null;
  /** Totals of phases already finished (or cut short by skip). */
  focusMs: number;
  breakMs: number;
  pomodoros: number;
}

export interface Transition {
  at: number;
  from: PhaseKind;
  /** null = the session is over. */
  to: PhaseKind | null;
}

/**
 * A scheduled session of `totalMin` minutes: 25/5 rounds, and the last block is
 * always focus, sized so the session ends exactly on time.
 *   45 → focus 25, break 5, focus 15
 *   90 → focus 25, break 5, focus 25, break 5, focus 30
 */
export function buildScheduledPlan(totalMin: number, focusMin = FOCUS_MIN, breakMin = BREAK_MIN): PlannedPhase[] {
  const plan: PlannedPhase[] = [];
  let left = Math.max(1, Math.round(totalMin));
  while (left > 0) {
    if (left <= focusMin + breakMin) {
      plan.push({ kind: 'focus', ms: left * MIN });
      break;
    }
    plan.push({ kind: 'focus', ms: focusMin * MIN });
    plan.push({ kind: 'break', ms: breakMin * MIN });
    left -= focusMin + breakMin;
  }
  return plan;
}

export function phaseAt(s: Pick<TimerState, 'mode' | 'plan'>, index: number): PlannedPhase | null {
  if (s.mode === 'scheduled') return s.plan?.[index] ?? null;
  return index % 2 === 0 ? { kind: 'focus', ms: FOCUS_MIN * MIN } : { kind: 'break', ms: BREAK_MIN * MIN };
}

export function startTimer(
  opts: { id: string; activity: string; mode: FocusMode; plannedMinutes?: number | null },
  now: number,
): TimerState {
  const plannedMinutes = opts.mode === 'scheduled' ? Math.max(1, opts.plannedMinutes ?? SCHEDULE_STEP_MIN) : null;
  return {
    id: opts.id,
    activity: opts.activity.trim() || 'Focus',
    mode: opts.mode,
    plan: plannedMinutes ? buildScheduledPlan(plannedMinutes) : null,
    plannedMinutes,
    startedAt: now,
    phaseIndex: 0,
    phaseStart: now,
    pausedAt: null,
    focusMs: 0,
    breakMs: 0,
    pomodoros: 0,
  };
}

export interface AdvanceResult {
  state: TimerState;
  transitions: Transition[];
  /** Set when a scheduled session ran out: the moment it ended. */
  finishedAt: number | null;
}

/** Move the timer forward to `now`, completing any phases whose time is up. */
export function advance(s: TimerState, now: number): AdvanceResult {
  if (s.pausedAt !== null) return { state: s, transitions: [], finishedAt: null };
  const st: TimerState = { ...s };
  const transitions: Transition[] = [];
  for (let guard = 0; guard < 100_000; guard++) {
    const phase = phaseAt(st, st.phaseIndex);
    if (!phase) break;
    const end = st.phaseStart + phase.ms;
    if (now < end) break;
    if (phase.kind === 'focus') {
      st.focusMs += phase.ms;
      st.pomodoros += 1;
    } else {
      st.breakMs += phase.ms;
    }
    const next = phaseAt(st, st.phaseIndex + 1);
    transitions.push({ at: end, from: phase.kind, to: next?.kind ?? null });
    st.phaseIndex += 1;
    st.phaseStart = end;
    if (!next) return { state: st, transitions, finishedAt: end };
  }
  return { state: st, transitions, finishedAt: null };
}

export function pauseTimer(s: TimerState, now: number): TimerState {
  return s.pausedAt !== null ? s : { ...s, pausedAt: now };
}

export function resumeTimer(s: TimerState, now: number): TimerState {
  if (s.pausedAt === null) return s;
  return { ...s, phaseStart: s.phaseStart + (now - s.pausedAt), pausedAt: null };
}

/** Time already spent in the current phase. */
export function phaseElapsed(s: TimerState, now: number): number {
  const phase = phaseAt(s, s.phaseIndex);
  if (!phase) return 0;
  const ref = s.pausedAt ?? now;
  return Math.max(0, Math.min(phase.ms, ref - s.phaseStart));
}

export function phaseRemaining(s: TimerState, now: number): number {
  const phase = phaseAt(s, s.phaseIndex);
  if (!phase) return 0;
  return Math.max(0, phase.ms - phaseElapsed(s, now));
}

/** Focus + break time so far, pauses excluded. */
export function activeElapsed(s: TimerState, now: number): number {
  return s.focusMs + s.breakMs + phaseElapsed(s, now);
}

/** Scheduled mode: time left in the whole session. */
export function sessionRemaining(s: TimerState, now: number): number | null {
  if (s.mode !== 'scheduled' || !s.plannedMinutes) return null;
  return Math.max(0, s.plannedMinutes * MIN - activeElapsed(s, now));
}

/** End the current phase early and start the next one now (endless mode). */
export function skipPhase(s: TimerState, now: number): TimerState {
  const phase = phaseAt(s, s.phaseIndex);
  if (!phase) return s;
  const elapsed = phaseElapsed(s, now);
  return {
    ...s,
    focusMs: s.focusMs + (phase.kind === 'focus' ? elapsed : 0),
    breakMs: s.breakMs + (phase.kind === 'break' ? elapsed : 0),
    phaseIndex: s.phaseIndex + 1,
    phaseStart: now,
    pausedAt: null,
  };
}

/** Totals for a session that ends now (partial current phase included). */
export function finishTotals(s: TimerState, now: number): { focusMs: number; breakMs: number; pomodoros: number; endedAt: number } {
  const phase = phaseAt(s, s.phaseIndex);
  const elapsed = phaseElapsed(s, now);
  return {
    focusMs: s.focusMs + (phase?.kind === 'focus' ? elapsed : 0),
    breakMs: s.breakMs + (phase?.kind === 'break' ? elapsed : 0),
    pomodoros: s.pomodoros,
    endedAt: s.pausedAt ?? now,
  };
}

/** The next `limit` phase changes, for scheduling alarms ahead of time. */
export function upcomingTransitions(s: TimerState, now: number, limit: number): Transition[] {
  if (s.pausedAt !== null) return [];
  const out: Transition[] = [];
  let index = s.phaseIndex;
  let start = s.phaseStart;
  while (out.length < limit) {
    const phase = phaseAt(s, index);
    if (!phase) break;
    const end = start + phase.ms;
    const next = phaseAt(s, index + 1);
    if (end > now) out.push({ at: end, from: phase.kind, to: next?.kind ?? null });
    if (!next) break;
    index++;
    start = end;
  }
  return out;
}

/** "25:00", "1:04:59" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm.padStart(2, '0')}:${ss}`;
}

/** "45 min", "1 h 30 min", "2 h" */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Compact duration for stats: "0m", "48m", "3h 05m". */
export function formatDuration(ms: number): string {
  const m = Math.round(ms / MIN);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
}
