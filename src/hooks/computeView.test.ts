import { describe, expect, it } from 'vitest';
import type { Task } from '../db/types';
import { computeView, sortTasks } from './useData';

const NOW = new Date(2026, 8, 16, 10, 0, 0); // Wed Sep 16 2026
const INBOX = 'inbox';

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: p.id ?? `t${n}`,
    listId: INBOX,
    parentId: null,
    title: `Task ${n}`,
    notes: '',
    status: 'open',
    completedAt: null,
    dueDate: null,
    dueTime: null,
    priority: 0,
    tags: [],
    repeat: 'none',
    sortOrder: n,
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

const tasks: Task[] = [
  task({ id: 'overdue', dueDate: '2026-09-10', priority: 5 }),
  task({ id: 'today', dueDate: '2026-09-16', tags: ['home'] }),
  task({ id: 'tomorrow', dueDate: '2026-09-17', listId: 'work' }),
  task({ id: 'nextMonth', dueDate: '2026-10-16' }),
  task({ id: 'nodate', title: 'Alpha thing', priority: 3 }),
  task({ id: 'sub', parentId: 'nodate', title: 'child' }),
  task({ id: 'doneToday', status: 'done', completedAt: NOW.getTime() - 1000 }),
  task({ id: 'doneOld', status: 'done', completedAt: NOW.getTime() - 5 * 86400000, listId: 'work' }),
];

const ids = (ts: Task[]) => ts.map((t) => t.id);

describe('computeView', () => {
  it('inbox shows only top-level open tasks in the inbox, completed separately', () => {
    const v = computeView({ kind: 'inbox' }, tasks, INBOX, 'manual', NOW);
    expect(ids(v.sections[0].tasks)).toEqual(['overdue', 'today', 'nextMonth', 'nodate']);
    expect(ids(v.completed)).toEqual(['doneToday']);
  });

  it('today splits overdue from due today and only shows tasks completed today', () => {
    const v = computeView({ kind: 'today' }, tasks, INBOX, 'manual', NOW);
    expect(v.sections.map((s) => s.key)).toEqual(['overdue', 'today']);
    expect(ids(v.sections[0].tasks)).toEqual(['overdue']);
    expect(ids(v.sections[1].tasks)).toEqual(['today']);
    expect(ids(v.completed)).toEqual(['doneToday']);
    expect(v.total).toBe(2);
  });

  it('next 7 days has one section per day plus overdue', () => {
    const v = computeView({ kind: 'week' }, tasks, INBOX, 'manual', NOW);
    expect(v.sections[0].key).toBe('overdue');
    expect(v.sections).toHaveLength(8);
    expect(ids(v.sections[1].tasks)).toEqual(['today']);
    expect(ids(v.sections[2].tasks)).toEqual(['tomorrow']);
    expect(v.total).toBe(3);
  });

  it('completed groups by completion day, newest first', () => {
    const v = computeView({ kind: 'completed' }, tasks, INBOX, 'manual', NOW);
    expect(v.sections.map((s) => s.key)).toEqual(['2026-09-16', '2026-09-11']);
  });

  it('tag and search views include subtasks', () => {
    expect(ids(computeView({ kind: 'tag', tag: 'home' }, tasks, INBOX, 'manual', NOW).sections[0].tasks)).toEqual(['today']);
    expect(ids(computeView({ kind: 'search', query: 'CHILD' }, tasks, INBOX, 'manual', NOW).sections[0].tasks)).toEqual(['sub']);
    expect(computeView({ kind: 'search', query: '  ' }, tasks, INBOX, 'manual', NOW).total).toBe(0);
  });

  it('list view filters by list', () => {
    const v = computeView({ kind: 'list', listId: 'work' }, tasks, INBOX, 'manual', NOW);
    expect(ids(v.sections[0].tasks)).toEqual(['tomorrow']);
    expect(ids(v.completed)).toEqual(['doneOld']);
  });
});

describe('sortTasks', () => {
  const open = tasks.filter((t) => t.status === 'open' && !t.parentId);
  it('sorts by due date with undated last', () => {
    expect(ids(sortTasks(open, 'dueDate'))).toEqual(['overdue', 'today', 'tomorrow', 'nextMonth', 'nodate']);
  });
  it('sorts by priority high first', () => {
    expect(ids(sortTasks(open, 'priority')).slice(0, 2)).toEqual(['overdue', 'nodate']);
  });
  it('sorts by title', () => {
    expect(ids(sortTasks(open, 'title'))[0]).toBe('nodate');
  });
});
