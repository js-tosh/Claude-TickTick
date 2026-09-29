import { describe, expect, it } from 'vitest';
import {
  activeElapsed,
  advance,
  buildScheduledPlan,
  confirmPhase,
  finishTotals,
  formatClock,
  formatDuration,
  formatMinutes,
  pauseTimer,
  phaseRemaining,
  resumeTimer,
  sessionRemaining,
  skipPhase,
  nextTransition,
  startTimer,
} from './pomodoro';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);
const mins = (p: { ms: number }[]) => p.map((x) => x.ms / MIN);

describe('buildScheduledPlan', () => {
  it('fills the time with 25/5 rounds and always ends on focus', () => {
    expect(mins(buildScheduledPlan(45))).toEqual([25, 5, 15]);
    expect(mins(buildScheduledPlan(90))).toEqual([25, 5, 25, 5, 30]);
    expect(mins(buildScheduledPlan(135))).toEqual([25, 5, 25, 5, 25, 5, 25, 5, 15]);
    for (const total of [45, 90, 135, 180, 225, 540]) {
      const plan = buildScheduledPlan(total);
      expect(plan.reduce((n, p) => n + p.ms, 0)).toBe(total * MIN);
      expect(plan[plan.length - 1].kind).toBe('focus');
    }
  });
});

describe('endless mode with confirmation', () => {
  it('ends the focus block, then waits until the break is confirmed', () => {
    const s = startTimer({ id: 'a', activity: 'Study', mode: 'endless' }, T0);
    expect(phaseRemaining(s, T0)).toBe(25 * MIN);

    const r1 = advance(s, T0 + 25 * MIN);
    expect(r1.transitions).toEqual([{ at: T0 + 25 * MIN, from: 'focus', to: 'break' }]);
    expect(r1.state.pomodoros).toBe(1);
    expect(r1.state.awaitingConfirm).toBe(true);
    expect(r1.state.waitingSince).toBe(T0 + 25 * MIN);
    // Waiting: nothing counts, the break has not started, no matter how long it takes.
    expect(phaseRemaining(r1.state, T0 + 60 * MIN)).toBe(5 * MIN);
    expect(activeElapsed(r1.state, T0 + 60 * MIN)).toBe(25 * MIN);
    expect(advance(r1.state, T0 + 3 * 60 * MIN).transitions).toEqual([]);
    expect(pauseTimer(r1.state, T0 + 30 * MIN)).toBe(r1.state);
    expect(nextTransition(r1.state, T0 + 30 * MIN)).toBeNull();

    // Confirmed 12 minutes later: the break starts then.
    const b = confirmPhase(r1.state, T0 + 37 * MIN);
    expect(b.awaitingConfirm).toBe(false);
    expect(phaseRemaining(b, T0 + 37 * MIN)).toBe(5 * MIN);
    expect(nextTransition(b, T0 + 37 * MIN)).toEqual({ at: T0 + 42 * MIN, from: 'break', to: 'focus' });
    const r2 = advance(b, T0 + 42 * MIN);
    expect(r2.transitions[0]).toEqual({ at: T0 + 42 * MIN, from: 'break', to: 'focus' });
    expect(r2.state.awaitingConfirm).toBe(true);
    expect(r2.finishedAt).toBeNull();
    expect(confirmPhase(confirmPhase(r2.state, T0 + 43 * MIN), T0 + 50 * MIN).phaseStart).toBe(T0 + 43 * MIN);
  });

  it('only ever completes one phase per catch-up, even after hours asleep', () => {
    const s = startTimer({ id: 'a', activity: '', mode: 'endless' }, T0);
    const r = advance(s, T0 + 3 * 60 * MIN);
    expect(r.state.pomodoros).toBe(1);
    expect(r.state.focusMs).toBe(25 * MIN);
    expect(r.transitions).toHaveLength(1);
    expect(r.state.activity).toBe('Focus');
  });

  it('skip ends the current phase early and starts the next one right away', () => {
    const s = startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0);
    const skipped = skipPhase(s, T0 + 10 * MIN);
    expect(skipped.focusMs).toBe(10 * MIN);
    expect(skipped.pomodoros).toBe(0);
    expect(skipped.awaitingConfirm).toBe(false);
    expect(phaseRemaining(skipped, T0 + 10 * MIN)).toBe(5 * MIN); // now on break
  });
});

describe('pause and resume', () => {
  it('freezes the countdown and shifts the schedule by the paused time', () => {
    const s = startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0);
    const paused = pauseTimer(s, T0 + 10 * MIN);
    expect(phaseRemaining(paused, T0 + 60 * MIN)).toBe(15 * MIN);
    expect(advance(paused, T0 + 60 * MIN).transitions).toEqual([]);
    expect(nextTransition(paused, T0 + 60 * MIN)).toBeNull();
    const resumed = resumeTimer(paused, T0 + 20 * MIN);
    expect(phaseRemaining(resumed, T0 + 20 * MIN)).toBe(15 * MIN);
    expect(advance(resumed, T0 + 35 * MIN).transitions[0].at).toBe(T0 + 35 * MIN);
  });
});

describe('scheduled mode', () => {
  it('waits at each change and finishes on the last block', () => {
    let s = startTimer({ id: 'a', activity: 'Essay', mode: 'scheduled', plannedMinutes: 45 }, T0);
    expect(sessionRemaining(s, T0)).toBe(45 * MIN);
    let r = advance(s, T0 + 50 * MIN); // slept through: only the first block completes
    expect(r.finishedAt).toBeNull();
    expect(r.state.awaitingConfirm).toBe(true);
    expect(sessionRemaining(r.state, T0 + 50 * MIN)).toBe(20 * MIN);
    s = confirmPhase(r.state, T0 + 50 * MIN); // break 5
    r = advance(s, T0 + 55 * MIN);
    expect(r.transitions[0].to).toBe('focus');
    s = confirmPhase(r.state, T0 + 60 * MIN); // last focus 15
    expect(nextTransition(s, T0 + 60 * MIN)).toEqual({ at: T0 + 75 * MIN, from: 'focus', to: null });
    r = advance(s, T0 + 80 * MIN);
    expect(r.finishedAt).toBe(T0 + 75 * MIN);
    expect(r.state.awaitingConfirm).toBe(false);
    expect(r.state.focusMs).toBe(40 * MIN);
    expect(r.state.pomodoros).toBe(2);
  });

  it('counts neither pauses nor waiting time toward the session length', () => {
    let s = startTimer({ id: 'a', activity: 'x', mode: 'scheduled', plannedMinutes: 45 }, T0);
    s = pauseTimer(s, T0 + 5 * MIN);
    s = resumeTimer(s, T0 + 15 * MIN);
    expect(sessionRemaining(s, T0 + 15 * MIN)).toBe(40 * MIN);
    const r = advance(s, T0 + 35 * MIN); // first block done at T0+35
    expect(sessionRemaining(r.state, T0 + 90 * MIN)).toBe(20 * MIN);
  });
});

describe('finishTotals', () => {
  it('includes the partial current phase, and ends a waiting session when the wait began', () => {
    const b = confirmPhase(advance(startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0), T0 + 25 * MIN).state, T0 + 25 * MIN);
    const f = confirmPhase(advance(b, T0 + 30 * MIN).state, T0 + 30 * MIN);
    const t = finishTotals(f, T0 + 40 * MIN);
    expect(t.focusMs).toBe(35 * MIN);
    expect(t.breakMs).toBe(5 * MIN);
    expect(t.pomodoros).toBe(1);
    expect(activeElapsed(f, T0 + 40 * MIN)).toBe(40 * MIN);
    const w = advance(startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0), T0 + 25 * MIN).state;
    expect(finishTotals(w, T0 + 90 * MIN)).toMatchObject({ focusMs: 25 * MIN, breakMs: 0, endedAt: T0 + 25 * MIN });
  });
});

describe('formatting', () => {
  it('formats clocks and durations', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(65 * MIN)).toBe('1:05:00');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(180)).toBe('3 h');
    expect(formatDuration(185 * MIN)).toBe('3h 05m');
    expect(formatDuration(48 * MIN)).toBe('48m');
  });
});

describe('focus block length', () => {
  it('uses the chosen length in endless mode and in scheduled plans', () => {
    const s = startTimer({ id: 'a', activity: 'x', mode: 'endless', focusMin: 15 }, T0);
    expect(phaseRemaining(s, T0)).toBe(15 * MIN);
    const r = advance(s, T0 + 15 * MIN);
    expect(r.transitions[0].to).toBe('break');
    expect(phaseRemaining(confirmPhase(r.state, T0 + 15 * MIN), T0 + 15 * MIN)).toBe(5 * MIN);
    expect(mins(buildScheduledPlan(45, 20))).toEqual([20, 5, 20]);
    expect(mins(buildScheduledPlan(90, 30))).toEqual([30, 5, 30, 5, 20]);
    const sched = startTimer({ id: 'b', activity: 'x', mode: 'scheduled', plannedMinutes: 45, focusMin: 30 }, T0);
    expect(mins(sched.plan!)).toEqual([30, 5, 10]);
    expect(startTimer({ id: 'c', activity: 'x', mode: 'endless', habitId: 'h1' }, T0).habitId).toBe('h1');
  });
});
