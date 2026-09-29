import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { clearAll, createTask, ensureInbox } from './repo';
import { createHabit, defaultHabitInput, deleteHabit, HabitLimitError, normalizeHabitInput, setHabitValue } from './habits';
import { rateFocusSession, saveFocusSession } from './focus';
import { exportJSON, importJSON, parseBackup } from './backup';

beforeEach(async () => {
  await clearAll();
});

describe('habits', () => {
  it('allows at most 4 habits', async () => {
    for (let i = 0; i < 4; i++) await createHabit({ ...defaultHabitInput(), name: `H${i}` });
    await expect(createHabit({ ...defaultHabitInput(), name: 'Fifth' })).rejects.toBeInstanceOf(HabitLimitError);
    expect(await db.habits.count()).toBe(4);
  });

  it('normalises input', () => {
    const n = normalizeHabitInput({
      ...defaultHabitInput(),
      name: '  Eat Salads  ',
      frequency: { type: 'weekdays', days: [6, 3, 3, 5] },
      reminders: ['13:00', 'nope', '08:30', '13:00', '07:00', '21:00'],
      constantReminder: true,
    });
    expect(n.name).toBe('Eat Salads');
    expect(n.frequency).toEqual({ type: 'weekdays', days: [3, 5, 6] });
    expect(n.reminders).toEqual(['07:00', '08:30', '13:00']);
    expect(normalizeHabitInput({ ...defaultHabitInput(), constantReminder: true }).constantReminder).toBe(false);
  });

  it('stores one log per day, drops empty days, and deletes logs with the habit', async () => {
    const h = await createHabit({ ...defaultHabitInput(), name: 'Water', goal: { type: 'amount', amount: 8, unit: 'glasses' } });
    await setHabitValue(h.id, '2026-09-28', 3);
    await setHabitValue(h.id, '2026-09-28', 4, 'Felt good');
    expect(await db.habitLogs.count()).toBe(1);
    expect((await db.habitLogs.get(`${h.id}:2026-09-28`))?.note).toBe('Felt good');
    await setHabitValue(h.id, '2026-09-28', 0); // note keeps the row
    expect(await db.habitLogs.count()).toBe(1);
    await setHabitValue(h.id, '2026-09-28', 0, '');
    expect(await db.habitLogs.count()).toBe(0);
    await setHabitValue(h.id, '2026-09-29', 1);
    await deleteHabit(h.id);
    expect(await db.habitLogs.count()).toBe(0);
  });
});

describe('backup v2', () => {
  it('round-trips habits, logs and focus sessions', async () => {
    const inbox = await ensureInbox();
    await createTask({ listId: inbox.id, title: 'Task' });
    const h = await createHabit({ ...defaultHabitInput(), name: 'Workout', section: 'morning', reminders: ['07:00'] });
    await setHabitValue(h.id, '2026-09-28', 1, 'Leg day');
    await saveFocusSession({
      id: 'f1', activity: 'Essay', mode: 'scheduled', plannedMinutes: 90, startedAt: 1, endedAt: 2,
      focusMs: 80 * 60_000, breakMs: 10 * 60_000, pomodoros: 3, rating: null, updatedAt: 1,
    });
    await rateFocusSession('f1', 4);
    const json = await exportJSON();
    await clearAll();
    const r = await importJSON(json, 'replace');
    expect(r).toMatchObject({ tasks: 1, habits: 1, focusSessions: 1 });
    expect((await db.habits.get(h.id))?.reminders).toEqual(['07:00']);
    expect((await db.habitLogs.get(`${h.id}:2026-09-28`))?.note).toBe('Leg day');
    expect((await db.focusSessions.get('f1'))?.rating).toBe(4);
  });

  it('still imports version-1 files and sanitises bad habit data', () => {
    const v1 = parseBackup(JSON.stringify({ app: 'ticktick-clone', schemaVersion: 1, folders: [], lists: [], tasks: [] }));
    expect(v1.habits).toEqual([]);
    expect(v1.focusSessions).toEqual([]);
    const bad = parseBackup(
      JSON.stringify({
        app: 'ticktick-clone', folders: [], lists: [], tasks: [],
        habits: [{ id: 'h', name: '', frequency: { type: 'weekdays', days: [9] }, reminders: ['25:00'], section: 'lunch' }],
        habitLogs: [{ habitId: 'h', date: '2026-09-28', value: 1 }, { habitId: 'gone', date: '2026-09-28', value: 1 }],
        focusSessions: [{ id: 'f', startedAt: 5, rating: 9 }],
      }),
    );
    expect(bad.habits[0]).toMatchObject({ name: 'Untitled habit', section: 'others', reminders: [], frequency: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] } });
    expect(bad.habitLogs).toHaveLength(1);
    expect(bad.focusSessions[0]).toMatchObject({ activity: 'Focus', rating: null, mode: 'endless' });
  });
});
