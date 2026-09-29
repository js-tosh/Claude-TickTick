import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../db/types';
import { groupLogs } from './habitStats';
import { planHabitReminders } from './reminderPlan';

const NOW = new Date(2026, 8, 28, 9, 30, 0); // Monday Sep 28, 9:30
const habit = (p: Partial<Habit>): Habit => ({
  id: 'h',
  name: 'Eat Salads',
  icon: '🥗',
  color: '#a7e27a',
  frequency: { type: 'weekdays', days: [3, 5, 6] }, // Wed, Fri, Sat
  goal: { type: 'all' },
  startDate: '2026-09-28',
  goalDays: null,
  section: 'afternoon',
  reminders: ['13:00'],
  constantReminder: false,
  sortOrder: 1,
  createdAt: 0,
  updatedAt: 0,
  ...p,
});
const log = (habitId: string, date: string, value = 1): HabitLog => ({ id: `${habitId}:${date}`, habitId, date, value, note: '', updatedAt: 0 });
const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('planHabitReminders', () => {
  it('schedules each reminder time on the habit\'s days within the next week', () => {
    const plan = planHabitReminders([habit({})], new Map(), NOW, 7);
    expect(plan.map((p) => fmt(p.at))).toEqual(['9/30 13:00', '10/2 13:00', '10/3 13:00']);
  });

  it('skips days already checked in and times that have passed', () => {
    const daily = habit({ id: 'd', frequency: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] }, reminders: ['08:00', '20:00'] });
    const plan = planHabitReminders([daily], groupLogs([log('d', '2026-09-29')]), NOW, 3);
    // Mon 8:00 already passed; Tue is done; Wed both times.
    expect(plan.map((p) => fmt(p.at))).toEqual(['9/28 20:00', '9/30 08:00', '9/30 20:00']);
  });

  it('adds follow-ups 10 and 20 minutes later for a constant reminder', () => {
    const plan = planHabitReminders([habit({ constantReminder: true })], new Map(), NOW, 3);
    expect(plan.map((p) => [fmt(p.at), p.followUp])).toEqual([
      ['9/30 13:00', false],
      ['9/30 13:10', true],
      ['9/30 13:20', true],
    ]);
  });

  it('respects a start date in the future and amount goals', () => {
    const later = habit({ startDate: '2026-10-02' });
    expect(planHabitReminders([later], new Map(), NOW, 7).map((p) => p.date)).toEqual(['2026-10-02', '2026-10-03']);
    const water = habit({ id: 'w', frequency: { type: 'weekdays', days: [1] }, reminders: ['18:00'], goal: { type: 'amount', amount: 8, unit: 'glasses' } });
    // 5 of 8 glasses is not done yet, so today's evening reminder still fires.
    expect(planHabitReminders([water], groupLogs([log('w', '2026-09-28', 5)]), NOW, 1)).toHaveLength(1);
    expect(planHabitReminders([water], groupLogs([log('w', '2026-09-28', 8)]), NOW, 1)).toHaveLength(0);
  });
});
