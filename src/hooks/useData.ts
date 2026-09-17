import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { startOfDay } from 'date-fns';
import { db } from '../db/db';
import type { Folder, List, Task } from '../db/types';
import type { SortBy, View } from '../state/ui';
import { addDaysKey, todayKey } from '../lib/dates';

export function useFolders(): Folder[] | undefined {
  return useLiveQuery(() => db.folders.orderBy('sortOrder').toArray(), []);
}

export function useLists(): List[] | undefined {
  return useLiveQuery(() => db.lists.orderBy('sortOrder').toArray(), []);
}

export function useInbox(): List | undefined {
  return useLiveQuery(() => db.lists.filter((l) => l.isInbox).first(), []);
}

export function useTask(id: string | null): Task | undefined {
  return useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id]);
}

export function useSubtasks(parentId: string | null): Task[] {
  const subs = useLiveQuery(
    () => (parentId ? db.tasks.where('parentId').equals(parentId).sortBy('sortOrder') : Promise.resolve([] as Task[])),
    [parentId],
  );
  return subs ?? [];
}

/** All tasks, live. Fine for personal-scale data (thousands of rows). */
export function useAllTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.toArray(), []);
}

export interface TagInfo {
  tag: string;
  count: number;
}

export function useTags(tasks: Task[] | undefined): TagInfo[] {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks ?? []) {
      if (t.status !== 'open') continue;
      for (const tag of t.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
    }
    return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [tasks]);
}

export interface Counts {
  inbox: number;
  today: number;
  week: number;
  all: number;
  perList: Map<string, number>;
}

export function useCounts(tasks: Task[] | undefined, inboxId: string | undefined): Counts {
  return useMemo(() => {
    const today = todayKey();
    const weekEnd = addDaysKey(today, 6);
    const counts: Counts = { inbox: 0, today: 0, week: 0, all: 0, perList: new Map() };
    for (const t of tasks ?? []) {
      if (t.status !== 'open' || t.parentId) continue;
      counts.all++;
      counts.perList.set(t.listId, (counts.perList.get(t.listId) ?? 0) + 1);
      if (t.listId === inboxId) counts.inbox++;
      if (t.dueDate) {
        if (t.dueDate <= today) counts.today++;
        if (t.dueDate <= weekEnd) counts.week++;
      }
    }
    return counts;
  }, [tasks, inboxId]);
}

export interface Section {
  key: string;
  title: string | null;
  tasks: Task[];
}

export interface ViewData {
  sections: Section[];
  completed: Task[];
  total: number;
}

const PRIORITY_DESC = (a: Task, b: Task) => b.priority - a.priority;

export function sortTasks(tasks: Task[], sortBy: SortBy): Task[] {
  const arr = [...tasks];
  switch (sortBy) {
    case 'dueDate':
      arr.sort((a, b) => {
        if (a.dueDate !== b.dueDate) {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate < b.dueDate ? -1 : 1;
        }
        if ((a.dueTime ?? '') !== (b.dueTime ?? '')) {
          if (!a.dueTime) return 1;
          if (!b.dueTime) return -1;
          return a.dueTime < b.dueTime ? -1 : 1;
        }
        return PRIORITY_DESC(a, b) || a.sortOrder - b.sortOrder;
      });
      break;
    case 'priority':
      arr.sort((a, b) => PRIORITY_DESC(a, b) || cmpDue(a, b) || a.sortOrder - b.sortOrder);
      break;
    case 'title':
      arr.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.sortOrder - b.sortOrder);
      break;
    default:
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return arr;
}

function cmpDue(a: Task, b: Task): number {
  if (a.dueDate === b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

/**
 * Compute what a view shows from the full task list. Pure, so it is easy to
 * test and cheap to memoise.
 */
export function computeView(
  view: View,
  tasks: Task[],
  inboxId: string | undefined,
  sortBy: SortBy,
  now: Date = new Date(),
): ViewData {
  const today = todayKey(now);
  const weekEnd = addDaysKey(today, 6);
  const top = tasks.filter((t) => t.parentId === null);
  const open = top.filter((t) => t.status === 'open');
  const done = top.filter((t) => t.status === 'done');
  const byCompleted = (a: Task, b: Task) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

  switch (view.kind) {
    case 'inbox': {
      const o = sortTasks(open.filter((t) => t.listId === inboxId), sortBy);
      const c = done.filter((t) => t.listId === inboxId).sort(byCompleted);
      return { sections: [{ key: 'all', title: null, tasks: o }], completed: c, total: o.length };
    }
    case 'list': {
      const o = sortTasks(open.filter((t) => t.listId === view.listId), sortBy);
      const c = done.filter((t) => t.listId === view.listId).sort(byCompleted);
      return { sections: [{ key: 'all', title: null, tasks: o }], completed: c, total: o.length };
    }
    case 'all': {
      const o = sortTasks(open, sortBy);
      const c = [...done].sort(byCompleted);
      return { sections: [{ key: 'all', title: null, tasks: o }], completed: c, total: o.length };
    }
    case 'today': {
      const overdue = sortTasks(open.filter((t) => t.dueDate && t.dueDate < today), sortBy === 'manual' ? 'dueDate' : sortBy);
      const due = sortTasks(open.filter((t) => t.dueDate === today), sortBy === 'manual' ? 'dueDate' : sortBy);
      const startToday = startOfDay(now).getTime();
      const c = done.filter((t) => (t.completedAt ?? 0) >= startToday).sort(byCompleted);
      const sections: Section[] = [];
      if (overdue.length) sections.push({ key: 'overdue', title: 'Overdue', tasks: overdue });
      sections.push({ key: 'today', title: overdue.length ? 'Today' : null, tasks: due });
      return { sections, completed: c, total: overdue.length + due.length };
    }
    case 'week': {
      const overdue = sortTasks(open.filter((t) => t.dueDate && t.dueDate < today), 'dueDate');
      const inRange = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd);
      const sections: Section[] = [];
      if (overdue.length) sections.push({ key: 'overdue', title: 'Overdue', tasks: overdue });
      for (let i = 0; i < 7; i++) {
        const key = addDaysKey(today, i);
        const dayTasks = sortTasks(inRange.filter((t) => t.dueDate === key), sortBy === 'manual' ? 'dueDate' : sortBy);
        sections.push({ key, title: key, tasks: dayTasks });
      }
      return { sections, completed: [], total: overdue.length + inRange.length };
    }
    case 'completed': {
      const all = tasks.filter((t) => t.status === 'done' && t.parentId === null).sort(byCompleted);
      const groups = new Map<string, Task[]>();
      for (const t of all) {
        const key = todayKey(new Date(t.completedAt ?? t.updatedAt));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      }
      const sections = [...groups.entries()].map(([key, ts]) => ({ key, title: key, tasks: ts }));
      return { sections, completed: [], total: all.length };
    }
    case 'tag': {
      const tagged = tasks.filter((t) => t.tags.includes(view.tag));
      const o = sortTasks(tagged.filter((t) => t.status === 'open'), sortBy);
      const c = tagged.filter((t) => t.status === 'done').sort(byCompleted);
      return { sections: [{ key: 'all', title: null, tasks: o }], completed: c, total: o.length };
    }
    case 'search': {
      const q = view.query.trim().toLowerCase();
      if (!q) return { sections: [], completed: [], total: 0 };
      const hit = (t: Task) =>
        t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.tags.some((x) => x.includes(q));
      const matches = tasks.filter(hit);
      const o = sortTasks(matches.filter((t) => t.status === 'open'), sortBy);
      const c = matches.filter((t) => t.status === 'done').sort(byCompleted);
      return { sections: [{ key: 'all', title: null, tasks: o }], completed: c, total: o.length };
    }
  }
}

export function useViewData(view: View, tasks: Task[] | undefined, inboxId: string | undefined, sortBy: SortBy): ViewData | undefined {
  return useMemo(() => (tasks ? computeView(view, tasks, inboxId, sortBy) : undefined), [view, tasks, inboxId, sortBy]);
}
