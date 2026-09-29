import { describe, expect, it } from 'vitest';
import { parseQuickAdd, resolveListRef } from './quickAdd';

// Wednesday 2026-09-16 (a fixed "now" keeps weekday maths deterministic)
const NOW = new Date(2026, 8, 16, 10, 0, 0);

describe('parseQuickAdd', () => {
  it('keeps plain text as the title', () => {
    expect(parseQuickAdd('Buy milk', NOW)).toEqual({ title: 'Buy milk', priority: null, tags: [], dueDate: null, listRef: null });
  });

  it('extracts priority, tags and relative dates', () => {
    const r = parseQuickAdd('Pay rent tomorrow !high #home #money', NOW);
    expect(r.title).toBe('Pay rent');
    expect(r.priority).toBe(5);
    expect(r.tags).toEqual(['home', 'money']);
    expect(r.dueDate).toBe('2026-09-17');
  });

  it('understands numeric priority and weekday names', () => {
    const r = parseQuickAdd('Call mom friday !2', NOW);
    expect(r.priority).toBe(3);
    expect(r.dueDate).toBe('2026-09-18');
    expect(r.title).toBe('Call mom');
  });

  it('handles "next week" and "next monday"', () => {
    expect(parseQuickAdd('Plan trip next week', NOW).dueDate).toBe('2026-09-23');
    expect(parseQuickAdd('Standup next monday', NOW).dueDate).toBe('2026-09-21');
    expect(parseQuickAdd('Standup next monday', NOW).title).toBe('Standup');
  });

  it('accepts ISO dates and only the first date token', () => {
    const r = parseQuickAdd('Dentist 2026-10-03 today', NOW);
    expect(r.dueDate).toBe('2026-10-03');
    expect(r.title).toBe('Dentist today');
  });

  it('leaves unknown ! and # tokens alone', () => {
    const r = parseQuickAdd('Wow! #', NOW);
    expect(r.title).toBe('Wow! #');
  });

  it('sends the task to a list or folder with @', () => {
    const r = parseQuickAdd('Close ticket @Work #support', NOW);
    expect(r).toMatchObject({ title: 'Close ticket', listRef: 'Work', tags: ['support'] });
    expect(parseQuickAdd('Email @', NOW).title).toBe('Email @');
    const lists = [
      { id: 'inbox', name: 'Inbox', folderId: null, sortOrder: -1 },
      { id: 'w2', name: 'Work tasks', folderId: 'fw', sortOrder: 2 },
      { id: 'w1', name: 'Projects', folderId: 'fw', sortOrder: 1 },
      { id: 'pp', name: 'Personal Projects', folderId: null, sortOrder: 3 },
    ];
    const folders = [{ id: 'fw', name: 'Work' }];
    expect(resolveListRef('work', lists, folders)).toBe('w1'); // first list in the Work folder
    expect(resolveListRef('personal-projects', lists, folders)).toBe('pp');
    expect(resolveListRef('Work-tasks', lists, folders)).toBe('w2');
    expect(resolveListRef('nothing', lists, folders)).toBeNull();
  });
});
