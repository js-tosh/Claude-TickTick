import { describe, expect, it } from 'vitest';
import {
  activeElapsed,
  advance,
  buildScheduledPlan,
  finishTotals,
  formatClock,
  formatDuration,
  formatMinutes,
  pauseTimer,
  phaseRemaining,
  resumeTimer,
  sessionRemaining,
  skipPhase,
  startTimer,
  upcomingTransitions,
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

describe('endless mode', () => {
  it('alternates 25-minute focus and 5-minute break forever', () => {
    const s = startTimer({ id: 'a', activity: 'Study', mode: 'endless' }, T0);
    expect(phaseRemaining(s, T0)).toBe(25 * MIN);

    const r1 = advance(s, T0 + 25 * MIN);
    expect(r1.transitions).toEqual([{ at: T0 + 25 * MIN, from: 'focus', to: 'break' }]);
    expect(r1.state.pomodoros).toBe(1);
    expect(phaseRemaining(r1.state, T0 + 25 * MIN)).toBe(5 * MIN);

    const r2 = advance(r1.state, T0 + 30 * MIN);
    expect(r2.transitions[0]).toEqual({ at: T0 + 30 * MIN, from: 'break', to: 'focus' });
    expect(r2.finishedAt).toBeNull();
  });

  it('catches up after the phone slept for hours', () => {
    const s = startTimer({ id: 'a', activity: '', mode: 'endless' }, T0);
    const r = advance(s, T0 + 3 * 60 * MIN + 2 * MIN); // 6 full rounds + 2 min
    expect(r.state.pomodoros).toBe(6);
    expect(r.state.focusMs).toBe(6 * 25 * MIN);
    expect(r.state.breakMs).toBe(6 * 5 * MIN);
    expect(r.transitions).toHaveLength(12);
    expect(r.state.activity).toBe('Focus');
  });

  it('skip ends the current phase early and keeps the partial time', () => {
    const s = startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0);
    const skipped = skipPhase(s, T0 + 10 * MIN);
    expect(skipped.focusMs).toBe(10 * MIN);
    expect(skipped.pomodoros).toBe(0);
    expect(phaseRemaining(skipped, T0 + 10 * MIN)).toBe(5 * MIN); // now on break
  });
});

describe('pause and resume', () => {
  it('freezes the countdown and shifts the schedule by the paused time', () => {
    const s = startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0);
    const paused = pauseTimer(s, T0 + 10 * MIN);
    expect(phaseRemaining(paused, T0 + 60 * MIN)).toBe(15 * MIN);
    expect(advance(paused, T0 + 60 * MIN).transitions).toEqual([]);
    const resumed = resumeTimer(paused, T0 + 20 * MIN);
    expect(phaseRemaining(resumed, T0 + 20 * MIN)).toBe(15 * MIN);
    expect(advance(resumed, T0 + 35 * MIN).transitions[0].at).toBe(T0 + 35 * MIN);
    expect(upcomingTransitions(paused, T0, 5)).toEqual([]);
  });
});

describe('scheduled mode', () => {
  it('finishes exactly at the planned length', () => {
    const s = startTimer({ id: 'a', activity: 'Essay', mode: 'scheduled', plannedMinutes: 45 }, T0);
    expect(sessionRemaining(s, T0)).toBe(45 * MIN);
    const r = advance(s, T0 + 50 * MIN);
    expect(r.finishedAt).toBe(T0 + 45 * MIN);
    expect(r.transitions.map((t) => t.to)).toEqual(['break', 'focus', null]);
    expect(r.state.focusMs).toBe(40 * MIN);
    expect(r.state.pomodoros).toBe(2);
  });

  it('lists upcoming alarms including the final one', () => {
    const s = startTimer({ id: 'a', activity: 'x', mode: 'scheduled', plannedMinutes: 90 }, T0);
    const up = upcomingTransitions(s, T0, 50);
    expect(up.map((t) => (t.at - T0) / MIN)).toEqual([25, 30, 55, 60, 90]);
    expect(up[up.length - 1].to).toBeNull();
  });

  it('counts pauses out of the session length', () => {
    let s = startTimer({ id: 'a', activity: 'x', mode: 'scheduled', plannedMinutes: 45 }, T0);
    s = pauseTimer(s, T0 + 5 * MIN);
    s = resumeTimer(s, T0 + 15 * MIN);
    expect(sessionRemaining(s, T0 + 15 * MIN)).toBe(40 * MIN);
    expect(advance(s, T0 + 55 * MIN).finishedAt).toBe(T0 + 55 * MIN);
  });
});

describe('finishTotals', () => {
  it('includes the partial current phase', () => {
    const s = advance(startTimer({ id: 'a', activity: 'x', mode: 'endless' }, T0), T0 + 40 * MIN).state;
    const t = finishTotals(s, T0 + 40 * MIN);
    expect(t.focusMs).toBe(35 * MIN);
    expect(t.breakMs).toBe(5 * MIN);
    expect(t.pomodoros).toBe(1);
    expect(activeElapsed(s, T0 + 40 * MIN)).toBe(40 * MIN);
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
