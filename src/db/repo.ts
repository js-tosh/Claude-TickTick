import { db } from './db';
import type { Folder, List, Priority, Repeat, Task } from './types';
import { newId } from '../lib/ids';
import { nextOccurrence } from '../lib/dates';

const now = () => Date.now();

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

/** Make sure an Inbox list exists. Safe to call on every start. */
export async function ensureInbox(): Promise<List> {
  const existing = await db.lists.filter((l) => l.isInbox).first();
  if (existing) return existing;
  const inbox: List = {
    id: newId(),
    name: 'Inbox',
    folderId: null,
    color: null,
    sortOrder: -1,
    isInbox: true,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.lists.add(inbox);
  return inbox;
}

export async function getInbox(): Promise<List> {
  return ensureInbox();
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolder(name: string): Promise<Folder> {
  const last = await db.folders.orderBy('sortOrder').last();
  const folder: Folder = {
    id: newId(),
    name: name.trim() || 'Untitled folder',
    sortOrder: (last?.sortOrder ?? 0) + 1,
    collapsed: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.folders.add(folder);
  return folder;
}

export async function updateFolder(id: string, patch: Partial<Pick<Folder, 'name' | 'collapsed' | 'sortOrder'>>) {
  await db.folders.update(id, { ...patch, updatedAt: now() });
}

/**
 * Delete a folder. Lists inside move to the top level (like TickTick), unless
 * `deleteLists` is true, in which case lists and their tasks are deleted too.
 */
export async function deleteFolder(id: string, deleteLists = false) {
  await db.transaction('rw', db.folders, db.lists, db.tasks, async () => {
    const lists = await db.lists.where('folderId').equals(id).toArray();
    if (deleteLists) {
      for (const l of lists) await deleteListInternal(l.id);
    } else {
      await db.lists.where('folderId').equals(id).modify({ folderId: null, updatedAt: now() });
    }
    await db.folders.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function createList(name: string, folderId: string | null = null, color: string | null = null): Promise<List> {
  const last = await db.lists.orderBy('sortOrder').last();
  const list: List = {
    id: newId(),
    name: name.trim() || 'Untitled list',
    folderId,
    color,
    sortOrder: (last?.sortOrder ?? 0) + 1,
    isInbox: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.lists.add(list);
  return list;
}

export async function updateList(id: string, patch: Partial<Pick<List, 'name' | 'folderId' | 'color' | 'sortOrder'>>) {
  await db.lists.update(id, { ...patch, updatedAt: now() });
}

/** Delete a list and every task in it. The Inbox cannot be deleted. */
export async function deleteList(id: string) {
  await db.transaction('rw', db.lists, db.tasks, async () => {
    await deleteListInternal(id);
  });
}

async function deleteListInternal(id: string) {
  const list = await db.lists.get(id);
  if (!list || list.isInbox) return;
  await db.tasks.where('listId').equals(id).delete();
  await db.lists.delete(id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface NewTaskInput {
  listId: string;
  title: string;
  parentId?: string | null;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Priority;
  tags?: string[];
  repeat?: Repeat;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  // Top-level tasks go to the top of the list (TickTick behaviour): smallest
  // sortOrder. Subtasks are appended below their siblings.
  let sortOrder: number;
  if (input.parentId) {
    const siblings = await db.tasks.where('parentId').equals(input.parentId).toArray();
    sortOrder = siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0;
  } else {
    const first = await db.tasks.orderBy('sortOrder').first();
    sortOrder = (first?.sortOrder ?? 0) - 1;
  }
  const task: Task = {
    id: newId(),
    listId: input.listId,
    parentId: input.parentId ?? null,
    title: input.title.trim() || 'Untitled task',
    notes: input.notes ?? '',
    status: 'open',
    completedAt: null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    priority: input.priority ?? 0,
    tags: normalizeTags(input.tags ?? []),
    repeat: input.repeat ?? 'none',
    sortOrder,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.tasks.add(task);
  return task;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'notes' | 'dueDate' | 'dueTime' | 'priority' | 'tags' | 'repeat' | 'listId' | 'sortOrder' | 'parentId'>
>;

export async function updateTask(id: string, patch: TaskPatch) {
  const clean: TaskPatch & { updatedAt: number } = { ...patch, updatedAt: now() };
  if (clean.tags) clean.tags = normalizeTags(clean.tags);
  if (clean.dueDate === null) clean.dueTime = null;
  await db.transaction('rw', db.tasks, async () => {
    await db.tasks.update(id, clean);
    // Moving a parent task to another list moves its subtasks too.
    if (patch.listId) {
      await db.tasks.where('parentId').equals(id).modify({ listId: patch.listId, updatedAt: now() });
    }
  });
}

/**
 * Toggle completion. Completing a repeating task also schedules the next
 * occurrence as a fresh open task (subtasks are copied, reset to open).
 */
export async function setTaskDone(id: string, done: boolean): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    if (!done) {
      await db.tasks.update(id, { status: 'open', completedAt: null, updatedAt: now() });
      return;
    }
    await db.tasks.update(id, { status: 'done', completedAt: now(), updatedAt: now() });
    // Completing a parent completes its open subtasks.
    await db.tasks.where('parentId').equals(id).filter((t) => t.status === 'open').modify({
      status: 'done',
      completedAt: now(),
      updatedAt: now(),
    });

    if (task.repeat !== 'none' && task.dueDate && task.parentId === null) {
      const nextDue = nextOccurrence(task.dueDate, task.repeat);
      if (nextDue) {
        const next = await createTask({
          listId: task.listId,
          title: task.title,
          notes: task.notes,
          dueDate: nextDue,
          dueTime: task.dueTime,
          priority: task.priority,
          tags: task.tags,
          repeat: task.repeat,
        });
        const subs = await db.tasks.where('parentId').equals(id).toArray();
        for (const s of subs) {
          await createTask({ listId: next.listId, parentId: next.id, title: s.title, priority: s.priority });
        }
        // Stop the completed copy from spawning again if it gets un-done later.
        await db.tasks.update(id, { repeat: 'none' });
      }
    }
  });
}

export async function deleteTask(id: string) {
  await db.transaction('rw', db.tasks, async () => {
    await db.tasks.where('parentId').equals(id).delete();
    await db.tasks.delete(id);
  });
}

export async function deleteCompletedInList(listId: string) {
  await db.tasks.where('[listId+status]').equals([listId, 'done']).delete();
}

/** Remove a tag from every task that carries it. */
export async function deleteTagEverywhere(tag: string) {
  await db.tasks
    .where('tags')
    .equals(tag)
    .modify((t) => {
      t.tags = t.tags.filter((x) => x !== tag);
      t.updatedAt = now();
    });
}

export async function renameTagEverywhere(from: string, to: string) {
  const target = normalizeTags([to])[0];
  if (!target) return;
  await db.tasks
    .where('tags')
    .equals(from)
    .modify((t) => {
      t.tags = normalizeTags(t.tags.map((x) => (x === from ? target : x)));
      t.updatedAt = now();
    });
}

/** Reorder a task relative to another task (drag & drop / move up-down). */
export async function moveTaskBefore(taskId: string, beforeTaskId: string | null, siblings: Task[]) {
  // Recompute sortOrder for the affected siblings using a simple renumbering.
  const ordered = siblings.filter((t) => t.id !== taskId);
  const moving = siblings.find((t) => t.id === taskId);
  if (!moving) return;
  const idx = beforeTaskId ? ordered.findIndex((t) => t.id === beforeTaskId) : ordered.length;
  ordered.splice(idx < 0 ? ordered.length : idx, 0, moving);
  await db.transaction('rw', db.tasks, async () => {
    const base = Math.min(...siblings.map((t) => t.sortOrder));
    for (let i = 0; i < ordered.length; i++) {
      await db.tasks.update(ordered[i].id, { sortOrder: base + i });
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Wipe everything (used by "Replace" import and the reset button). */
export async function clearAll() {
  await db.transaction('rw', db.folders, db.lists, db.tasks, async () => {
    await db.tasks.clear();
    await db.lists.clear();
    await db.folders.clear();
  });
}
