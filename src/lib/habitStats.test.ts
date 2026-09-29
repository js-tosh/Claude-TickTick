import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../db/types';
import {
  buildLogMap,
  computeHabitStats,
  currentStreak,
  dayAggregate,
  describeFrequency,
  groupLogs,
  isScheduled,
  nextValueOnTap,
  progressOf,
} from './habitStats';
import { lastDays, monthGrid, weekKeys } from './calendar';
import { diffDays, shiftKey, weekdayOfKey } from './daynum';

function habit(p: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Daily Check-in',
    icon: '😊',
    color: '#a7e27a',
    frequency: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
    goal: { type: 'all' },
    startDate: '2026-09-20',
    goalDays: 30,
    section: 'afternoon',
    reminders: [],
    constantReminder: false,
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}
const log = (date: string, value = 1, habitId = 'h1'): HabitLog => ({ id: `${habitId}:${date}`, habitId, date, value, note: '', updatedAt: 0 });

describe('day arithmetic', () => {
  it('knows weekdays and shifts across month/year/DST boundaries', () => {
    expect(weekdayOfKey('2026-09-28')).toBe(1); // Monday
    expect(weekdayOfKey('1970-01-01')).toBe(4); // Thursday
    expect(shiftKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftKey('2026-03-08', 1)).toBe('2026-03-09'); // US DST start
    expect(diffDays('2026-11-02', '2026-10-31')).toBe(2);
  });
});

describe('scheduling', () => {
  it('respects weekdays, intervals and the start date', () => {
    const wfs = habit({ frequency: { type: 'weekdays', days: [3, 5, 6] } }); // Wed, Fri, Sat
    expect(isScheduled(wfs, '2026-09-23')).toBe(true); // Wed
    expect(isScheduled(wfs, '2026-09-22')).toBe(false); // Tue
    expect(isScheduled(wfs, '2026-09-19')).toBe(false); // Sat but before start
    const every3 = habit({ frequency: { type: 'interval', every: 3 } });
    expect(['2026-09-20', '2026-09-21', '2026-09-23'].map((d) => isScheduled(every3, d))).toEqual([true, false, true]);
  });

  it('describes frequencies the way the form shows them', () => {
    expect(describeFrequency({ type: 'weekdays', days: [6, 3, 5] })).toBe('Every Wed, Fri, Sat');
    expect(describeFrequency({ type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
    expect(describeFrequency({ type: 'weekdays', days: [1, 2, 3, 4, 5] })).toBe('Every weekday');
    expect(describeFrequency({ type: 'interval', every: 3 })).toBe('Every 3 days');
  });
});

describe('stats (matches the reference screenshot)', () => {
  // Daily habit started Sep 20; checked in Sep 22, 23, 24, 25 and 28; today is Sep 28.
  const h = habit();
  const logs = buildLogMap(['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28'].map((d) => log(d)), 'h1');

  it('computes monthly check-ins, total, rate and streak', () => {
    const s = computeHabitStats(h, logs, '2026-09-28', '2026-09');
    expect(s.monthCheckIns).toBe(5);
    expect(s.totalCheckIns).toBe(5);
    expect(Math.round((s.monthRate ?? 0) * 100)).toBe(56); // 5 of 9 days since Sep 20
    expect(s.currentStreak).toBe(1);
    expect(s.goal).toEqual({ done: 5, target: 30, left: 25 });
  });

  it('does not break the streak for an unfinished today, and skips unscheduled days', () => {
    expect(currentStreak(h, logs, '2026-09-29')).toBe(1);
    const wfs = habit({ frequency: { type: 'weekdays', days: [3, 5] } }); // Wed, Fri
    const m = buildLogMap([log('2026-09-23'), log('2026-09-25'), log('2026-09-30')], 'h1');
    expect(currentStreak(wfs, m, '2026-09-30')).toBe(3);
    expect(currentStreak(wfs, m, '2026-10-01')).toBe(3);
    expect(currentStreak(wfs, m, '2026-10-03')).toBe(0); // missed Fri Oct 2
  });

  it('returns a null rate before anything was due, and no goal for forever', () => {
    const s = computeHabitStats(habit({ startDate: '2026-10-05', goalDays: null }), new Map(), '2026-09-28', '2026-09');
    expect(s.monthRate).toBeNull();
    expect(s.goal).toBeNull();
  });
});

describe('amount goals', () => {
  const water = habit({ goal: { type: 'amount', amount: 8, unit: 'glasses' } });
  it('counts partial progress and cycles back to zero when complete', () => {
    expect(progressOf(water, 4)).toBe(0.5);
    expect(nextValueOnTap(water, 7)).toBe(8);
    expect(nextValueOnTap(water, 8)).toBe(0);
    expect(nextValueOnTap(habit(), 0)).toBe(1);
    expect(nextValueOnTap(habit(), 1)).toBe(0);
    const s = computeHabitStats(water, buildLogMap([log('2026-09-27', 5), log('2026-09-28', 8)], 'h1'), '2026-09-28', '2026-09');
    expect(s.totalCheckIns).toBe(1);
  });
});

describe('week strip aggregate', () => {
  it('is done, partial, empty or none', () => {
    const a = habit({ id: 'a' });
    const b = habit({ id: 'b', frequency: { type: 'weekdays', days: [1] } });
    const byHabit = groupLogs([log('2026-09-28', 1, 'a'), log('2026-09-27', 1, 'a')]);
    expect(dayAggregate([a, b], byHabit, '2026-09-28')).toEqual({ state: 'partial', progress: 0.5 }); // Monday: both due
    expect(dayAggregate([a, b], byHabit, '2026-09-27').state).toBe('done');
    expect(dayAggregate([a, b], byHabit, '2026-09-26').state).toBe('empty');
    expect(dayAggregate([a, b], byHabit, '2026-09-01').state).toBe('none');
  });
});

describe('calendar grids', () => {
  it('builds Sunday-first month and week grids', () => {
    const grid = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-08-30');
    expect(grid[2]).toBe('2026-09-01');
    expect(weekKeys('2026-09-28')).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(lastDays('2026-09-28', 7)[0]).toBe('2026-09-22');
  });
});
