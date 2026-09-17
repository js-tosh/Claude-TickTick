import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  clearAll,
  createFolder,
  createList,
  createTask,
  deleteFolder,
  deleteList,
  deleteTask,
  ensureInbox,
  renameTagEverywhere,
  setTaskDone,
  updateTask,
} from './repo';
import { exportCSV, exportJSON, importJSON, parseBackup } from './backup';
import { todayKey } from '../lib/dates';

beforeEach(async () => {
  await clearAll();
});

describe('inbox', () => {
  it('is created once', async () => {
    const a = await ensureInbox();
    const b = await ensureInbox();
    expect(a.id).toBe(b.id);
    expect(await db.lists.count()).toBe(1);
  });
  it('cannot be deleted', async () => {
    const inbox = await ensureInbox();
    await deleteList(inbox.id);
    expect(await db.lists.get(inbox.id)).toBeTruthy();
  });
});

describe('folders and lists', () => {
  it('deleting a folder moves its lists to the top level', async () => {
    const f = await createFolder('Work');
    const l = await createList('Projects', f.id);
    await deleteFolder(f.id);
    expect((await db.lists.get(l.id))?.folderId).toBeNull();
  });
  it('deleting a list deletes its tasks', async () => {
    const l = await createList('Groceries');
    await createTask({ listId: l.id, title: 'Milk' });
    await deleteList(l.id);
    expect(await db.tasks.count()).toBe(0);
  });
});

describe('tasks', () => {
  it('new tasks go to the top and tags are normalised', async () => {
    const inbox = await ensureInbox();
    const a = await createTask({ listId: inbox.id, title: 'first', tags: ['#Home', 'home', 'Big Rock'] });
    const b = await createTask({ listId: inbox.id, title: 'second' });
    expect(b.sortOrder).toBeLessThan(a.sortOrder);
    expect(a.tags).toEqual(['home', 'big-rock']);
  });

  it('subtasks are appended in the order they were added', async () => {
    const inbox = await ensureInbox();
    const p = await createTask({ listId: inbox.id, title: 'parent' });
    await createTask({ listId: inbox.id, parentId: p.id, title: 'one' });
    await createTask({ listId: inbox.id, parentId: p.id, title: 'two' });
    await createTask({ listId: inbox.id, parentId: p.id, title: 'three' });
    const subs = await db.tasks.where('parentId').equals(p.id).sortBy('sortOrder');
    expect(subs.map((s) => s.title)).toEqual(['one', 'two', 'three']);
  });

  it('completing a parent completes its subtasks; deleting cascades', async () => {
    const inbox = await ensureInbox();
    const p = await createTask({ listId: inbox.id, title: 'parent' });
    const s = await createTask({ listId: inbox.id, parentId: p.id, title: 'child' });
    await setTaskDone(p.id, true);
    expect((await db.tasks.get(s.id))?.status).toBe('done');
    await deleteTask(p.id);
    expect(await db.tasks.count()).toBe(0);
  });

  it('completing a repeating task schedules the next occurrence', async () => {
    const inbox = await ensureInbox();
    const t = await createTask({ listId: inbox.id, title: 'Water plants', dueDate: todayKey(), repeat: 'daily', tags: ['home'] });
    await createTask({ listId: inbox.id, parentId: t.id, title: 'kitchen' });
    await setTaskDone(t.id, true);
    const open = await db.tasks.where('status').equals('open').toArray();
    const next = open.find((x) => x.parentId === null);
    expect(next?.title).toBe('Water plants');
    expect(next?.dueDate).not.toBe(todayKey());
    expect(next?.repeat).toBe('daily');
    expect(next?.tags).toEqual(['home']);
    expect(open.some((x) => x.parentId === next?.id && x.title === 'kitchen')).toBe(true);
    // The done copy no longer repeats
    expect((await db.tasks.get(t.id))?.repeat).toBe('none');
  });

  it('moving a task moves its subtasks; clearing the date clears the time', async () => {
    const inbox = await ensureInbox();
    const other = await createList('Other');
    const p = await createTask({ listId: inbox.id, title: 'p', dueDate: '2026-01-01', dueTime: '09:00' });
    const s = await createTask({ listId: inbox.id, parentId: p.id, title: 'c' });
    await updateTask(p.id, { listId: other.id });
    expect((await db.tasks.get(s.id))?.listId).toBe(other.id);
    await updateTask(p.id, { dueDate: null });
    expect((await db.tasks.get(p.id))?.dueTime).toBeNull();
  });

  it('renames tags everywhere', async () => {
    const inbox = await ensureInbox();
    const t = await createTask({ listId: inbox.id, title: 'x', tags: ['old', 'keep'] });
    await renameTagEverywhere('old', 'New Name');
    expect((await db.tasks.get(t.id))?.tags).toEqual(['new-name', 'keep']);
  });
});

describe('backup', () => {
  it('round-trips through JSON with replace', async () => {
    const inbox = await ensureInbox();
    const f = await createFolder('Home');
    const l = await createList('Chores', f.id, '#ff6161');
    const t = await createTask({ listId: l.id, title: 'Vacuum', dueDate: '2026-09-20', priority: 5, tags: ['weekend'] });
    await createTask({ listId: inbox.id, title: 'Inbox item' });
    const json = await exportJSON();

    await clearAll();
    const r = await importJSON(json, 'replace');
    expect(r).toEqual({ folders: 1, lists: 2, tasks: 2 });
    expect((await db.tasks.get(t.id))?.title).toBe('Vacuum');
    expect((await db.lists.get(l.id))?.folderId).toBe(f.id);
  });

  it('merge keeps the newer copy and re-points a foreign inbox', async () => {
    const inbox = await ensureInbox();
    const t = await createTask({ listId: inbox.id, title: 'original' });
    const json = await exportJSON();

    // Simulate another device: different inbox id, one extra task, and an older edit of t.
    const other = JSON.parse(json);
    other.lists[0].id = 'other-inbox';
    other.tasks[0].listId = 'other-inbox';
    other.tasks[0].title = 'older edit';
    other.tasks[0].updatedAt = 1;
    other.tasks.push({ ...other.tasks[0], id: 'new-task', title: 'from other device', updatedAt: 2 });

    await importJSON(JSON.stringify(other), 'merge');
    expect(await db.lists.count()).toBe(1);
    expect((await db.tasks.get(t.id))?.title).toBe('original');
    expect((await db.tasks.get('new-task'))?.listId).toBe(inbox.id);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/not a backup/);
  });

  it('drops tasks whose list is missing and sanitises fields', () => {
    const b = parseBackup(
      JSON.stringify({
        app: 'ticktick-clone',
        folders: [],
        lists: [{ id: 'l1', name: 'L' }],
        tasks: [
          { id: 't1', listId: 'l1', title: 'ok', priority: 9, dueDate: 'nope', tags: ['A'], parentId: 'missing' },
          { id: 't2', listId: 'gone', title: 'orphan' },
        ],
      }),
    );
    expect(b.tasks).toHaveLength(1);
    expect(b.tasks[0]).toMatchObject({ priority: 0, dueDate: null, tags: ['a'], parentId: null, status: 'open' });
  });

  it('exports CSV with quoting', async () => {
    const inbox = await ensureInbox();
    await createTask({ listId: inbox.id, title: 'Say "hi", then leave', notes: 'line1\nline2' });
    const csv = await exportCSV();
    const lines = csv.split('\r\n');
    expect(lines[0].startsWith('Folder,List,Title')).toBe(true);
    expect(lines[1]).toContain('"Say ""hi"", then leave"');
  });
});
