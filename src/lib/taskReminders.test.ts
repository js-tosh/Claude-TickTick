import { describe, expect, it } from 'vitest';
import type { Task } from '../db/types';
import { describeReminder, planTaskReminders, reminderFireTime } from './taskReminders';

const NOW = new Date(2026, 8, 29, 11, 0, 0);
let n = 0;
const task = (p: Partial<Task>): Task => ({
  id: `t${++n}`, listId: 'inbox', parentId: null, title: 'x', notes: '', status: 'open', completedAt: null,
  dueDate: '2026-09-29', dueTime: '12:10', priority: 0, tags: [], repeat: 'none', reminderMinutes: 0, reminderTime: null,
  sortOrder: 0, createdAt: 0, updatedAt: 0, ...p,
});
const hm = (d: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : null);

describe('reminderFireTime', () => {
  it('fires at the due time, or before it', () => {
    expect(hm(reminderFireTime(task({})))).toBe('9/29 12:10');
    expect(hm(reminderFireTime(task({ reminderMinutes: 30 })))).toBe('9/29 11:40');
    expect(hm(reminderFireTime(task({ reminderMinutes: 1440 })))).toBe('9/28 12:10');
  });
  it('uses the reminder time for all-day tasks, 9:00 by default', () => {
    expect(hm(reminderFireTime(task({ dueTime: null })))).toBe('9/29 9:00');
    expect(hm(reminderFireTime(task({ dueTime: null, reminderTime: '20:30' })))).toBe('9/29 20:30');
  });
  it('is null without a reminder, a date, or when done', () => {
    expect(reminderFireTime(task({ reminderMinutes: null }))).toBeNull();
    expect(reminderFireTime(task({ dueDate: null }))).toBeNull();
    expect(reminderFireTime(task({ status: 'done' }))).toBeNull();
  });
});

describe('planTaskReminders', () => {
  it('keeps future reminders inside the horizon, soonest first, and skips subtasks', () => {
    const plan = planTaskReminders(
      [
        task({ title: 'soon', dueTime: '12:10' }),
        task({ title: 'past', dueTime: '10:00' }),
        task({ title: 'tomorrow', dueDate: '2026-09-30', dueTime: '08:00' }),
        task({ title: 'far', dueDate: '2026-10-20' }),
        task({ title: 'sub', parentId: 't1', dueTime: '13:00' }),
        task({ title: 'no reminder', reminderMinutes: null, dueTime: '15:00' }),
      ],
      NOW,
    );
    expect(plan.map((p) => p.task.title)).toEqual(['soon', 'tomorrow']);
  });
});

describe('describeReminder', () => {
  it('reads naturally', () => {
    expect(describeReminder({ dueTime: '12:10', reminderMinutes: 0, reminderTime: null })).toBe('At the due time');
    expect(describeReminder({ dueTime: '12:10', reminderMinutes: 10, reminderTime: null })).toBe('10 min before');
    expect(describeReminder({ dueTime: '12:10', reminderMinutes: 120, reminderTime: null })).toBe('2 hours before');
    expect(describeReminder({ dueTime: null, reminderMinutes: 0, reminderTime: null })).toBe('On the day at 09:00');
    expect(describeReminder({ dueTime: '12:10', reminderMinutes: null, reminderTime: null })).toBe('None');
  });
});
