import { db } from './db';
import {
  HABIT_COLORS,
  SCHEMA_VERSION,
  type BackupFile,
  type FocusSession,
  type Folder,
  type Habit,
  type HabitLog,
  type HabitSection,
  type List,
  type Task,
  type WeekdayIndex,
} from './types';
import { normalizeTags, ensureInbox } from './repo';
import { logId, normalizeHabitInput } from './habits';
import { isValidKey } from '../lib/dates';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function buildBackup(): Promise<BackupFile> {
  const [folders, lists, tasks, habits, habitLogs, focusSessions] = await Promise.all([
    db.folders.toArray(),
    db.lists.toArray(),
    db.tasks.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.focusSessions.toArray(),
  ]);
  return {
    app: 'ticktick-clone',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    folders,
    lists,
    tasks,
    habits,
    habitLogs,
    focusSessions,
  };
}

export async function exportJSON(): Promise<string> {
  return JSON.stringify(await buildBackup(), null, 2);
}

/** Flat CSV of tasks: handy for Excel / Google Sheets. */
export async function exportCSV(): Promise<string> {
  const { folders, lists, tasks } = await buildBackup();
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));
  const header = [
    'Folder', 'List', 'Title', 'Parent task', 'Notes', 'Status', 'Due date', 'Due time',
    'Priority', 'Tags', 'Repeat', 'Created', 'Completed',
  ];
  const rows = tasks.map((t) => {
    const list = listById.get(t.listId);
    return [
      list?.folderId ? folderName.get(list.folderId) ?? '' : '',
      list?.name ?? '',
      t.title,
      t.parentId ? titleById.get(t.parentId) ?? '' : '',
      t.notes,
      t.status,
      t.dueDate ?? '',
      t.dueTime ?? '',
      String(t.priority),
      t.tags.join(' '),
      t.repeat,
      new Date(t.createdAt).toISOString(),
      t.completedAt ? new Date(t.completedAt).toISOString() : '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function csvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  folders: number;
  lists: number;
  tasks: number;
  habits: number;
  focusSessions: number;
}

/**
 * Import a backup produced by exportJSON().
 *  - merge:   upsert by id (newer updatedAt wins), nothing is deleted.
 *  - replace: wipe local data first, then load the file.
 *
 * Merging can leave more than MAX_HABITS habits (e.g. two phones with four
 * each). They are all kept so no data is lost; only creating new ones is blocked.
 */
export async function importJSON(text: string, mode: ImportMode): Promise<ImportResult> {
  const parsed = parseBackup(text);
  const tables = [db.folders, db.lists, db.tasks, db.habits, db.habitLogs, db.focusSessions];
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      for (const t of tables) await t.clear();
      await db.folders.bulkAdd(parsed.folders);
      await db.lists.bulkAdd(parsed.lists);
      await db.tasks.bulkAdd(parsed.tasks);
      await db.habits.bulkAdd(parsed.habits);
      await db.habitLogs.bulkAdd(parsed.habitLogs);
      await db.focusSessions.bulkAdd(parsed.focusSessions);
      return;
    }
    // merge
    const existingInbox = await db.lists.filter((l) => l.isInbox).first();
    for (const f of parsed.folders) {
      const cur = await db.folders.get(f.id);
      if (!cur || cur.updatedAt <= f.updatedAt) await db.folders.put(f);
    }
    for (const l of parsed.lists) {
      if (l.isInbox && existingInbox && existingInbox.id !== l.id) {
        // Only one Inbox: re-point incoming inbox tasks at the local Inbox.
        for (const t of parsed.tasks) if (t.listId === l.id) t.listId = existingInbox.id;
        continue;
      }
      const cur = await db.lists.get(l.id);
      if (!cur || cur.updatedAt <= l.updatedAt) await db.lists.put(l);
    }
    for (const t of parsed.tasks) {
      const cur = await db.tasks.get(t.id);
      if (!cur || cur.updatedAt <= t.updatedAt) await db.tasks.put(t);
    }
    for (const h of parsed.habits) {
      const cur = await db.habits.get(h.id);
      if (!cur || cur.updatedAt <= h.updatedAt) await db.habits.put(h);
    }
    for (const l of parsed.habitLogs) {
      const cur = await db.habitLogs.get(l.id);
      if (!cur || cur.updatedAt <= l.updatedAt) await db.habitLogs.put(l);
    }
    for (const f of parsed.focusSessions) {
      const cur = await db.focusSessions.get(f.id);
      if (!cur || cur.updatedAt <= f.updatedAt) await db.focusSessions.put(f);
    }
  });
  await ensureInbox();
  return {
    folders: parsed.folders.length,
    lists: parsed.lists.length,
    tasks: parsed.tasks.length,
    habits: parsed.habits.length,
    focusSessions: parsed.focusSessions.length,
  };
}

/** Validate and normalise a backup file. Throws a readable Error on bad input. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a backup from this app.');
  const obj = raw as Record<string, unknown>;
  if (obj.app !== 'ticktick-clone' || !Array.isArray(obj.folders) || !Array.isArray(obj.lists) || !Array.isArray(obj.tasks)) {
    throw new Error('That file is not a backup from this app.');
  }
  const ts = Date.now();
  const folders: Folder[] = obj.folders.map((f: Record<string, unknown>) => ({
    id: str(f.id),
    name: str(f.name, 'Untitled folder'),
    sortOrder: num(f.sortOrder, 0),
    collapsed: Boolean(f.collapsed),
    createdAt: num(f.createdAt, ts),
    updatedAt: num(f.updatedAt, ts),
  }));
  const folderIds = new Set(folders.map((f) => f.id));
  const lists: List[] = obj.lists.map((l: Record<string, unknown>) => ({
    id: str(l.id),
    name: str(l.name, 'Untitled list'),
    folderId: typeof l.folderId === 'string' && folderIds.has(l.folderId) ? l.folderId : null,
    color: typeof l.color === 'string' ? l.color : null,
    sortOrder: num(l.sortOrder, 0),
    isInbox: Boolean(l.isInbox),
    createdAt: num(l.createdAt, ts),
    updatedAt: num(l.updatedAt, ts),
  }));
  const listIds = new Set(lists.map((l) => l.id));
  const tasks: Task[] = obj.tasks
    .filter((t: Record<string, unknown>) => typeof t.listId === 'string' && listIds.has(t.listId))
    .map((t: Record<string, unknown>) => ({
      id: str(t.id),
      listId: t.listId as string,
      parentId: typeof t.parentId === 'string' ? t.parentId : null,
      title: str(t.title, 'Untitled task'),
      notes: str(t.notes, ''),
      status: t.status === 'done' ? 'done' : 'open',
      completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
      dueDate: isValidKey(t.dueDate as string) ? (t.dueDate as string) : null,
      dueTime: typeof t.dueTime === 'string' && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : null,
      priority: [0, 1, 3, 5].includes(t.priority as number) ? (t.priority as Task['priority']) : 0,
      tags: Array.isArray(t.tags) ? normalizeTags(t.tags.map(String)) : [],
      repeat: ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(t.repeat as string)
        ? (t.repeat as Task['repeat'])
        : 'none',
      reminderMinutes: typeof t.reminderMinutes === 'number' && t.reminderMinutes >= 0 ? Math.floor(t.reminderMinutes) : null,
      reminderTime: typeof t.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(t.reminderTime) ? t.reminderTime : null,
      sortOrder: num(t.sortOrder, 0),
      createdAt: num(t.createdAt, ts),
      updatedAt: num(t.updatedAt, ts),
    }));
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const t of tasks) if (t.parentId && !taskIds.has(t.parentId)) t.parentId = null;
  for (const [i, f] of folders.entries()) if (!f.id) throw new Error(`Folder #${i + 1} has no id.`);
  for (const [i, l] of lists.entries()) if (!l.id) throw new Error(`List #${i + 1} has no id.`);
  for (const [i, t] of tasks.entries()) if (!t.id) throw new Error(`Task #${i + 1} has no id.`);

  // Version 2 additions. Missing in version-1 files, which is fine.
  const habits: Habit[] = arr(obj.habits)
    .filter((h) => typeof h.id === 'string' && h.id)
    .map((h) => {
      const freq = (h.frequency ?? {}) as Record<string, unknown>;
      const goal = (h.goal ?? {}) as Record<string, unknown>;
      const clean = normalizeHabitInput({
        name: str(h.name, 'Untitled habit'),
        icon: str(h.icon, '😊'),
        color: str(h.color, HABIT_COLORS[0]),
        frequency:
          freq.type === 'interval'
            ? { type: 'interval', every: num(freq.every, 2) }
            : { type: 'weekdays', days: Array.isArray(freq.days) ? (freq.days.map(Number) as WeekdayIndex[]) : [] },
        goal: goal.type === 'amount' ? { type: 'amount', amount: num(goal.amount, 1), unit: str(goal.unit) } : { type: 'all' },
        startDate: str(h.startDate),
        goalDays: typeof h.goalDays === 'number' ? h.goalDays : null,
        section: str(h.section, 'others') as HabitSection,
        reminders: Array.isArray(h.reminders) ? h.reminders.map(String) : [],
        constantReminder: Boolean(h.constantReminder),
      });
      return { ...clean, id: h.id as string, sortOrder: num(h.sortOrder, 0), createdAt: num(h.createdAt, ts), updatedAt: num(h.updatedAt, ts) };
    });
  const habitIds = new Set(habits.map((h) => h.id));
  const seenLogs = new Set<string>();
  const habitLogs: HabitLog[] = [];
  for (const l of arr(obj.habitLogs)) {
    const habitId = str(l.habitId);
    const date = str(l.date);
    if (!habitIds.has(habitId) || !isValidKey(date)) continue;
    const id = logId(habitId, date);
    if (seenLogs.has(id)) continue;
    seenLogs.add(id);
    habitLogs.push({
      id,
      habitId,
      date,
      value: Math.max(0, Math.floor(num(l.value, 0))),
      note: str(l.note).slice(0, 2000),
      updatedAt: num(l.updatedAt, ts),
    });
  }
  const focusSessions: FocusSession[] = arr(obj.focusSessions)
    .filter((f) => typeof f.id === 'string' && f.id && typeof f.startedAt === 'number')
    .map((f) => {
      const rating = num(f.rating, NaN);
      return {
        id: f.id as string,
        activity: str(f.activity, 'Focus').slice(0, 80) || 'Focus',
        mode: f.mode === 'scheduled' ? 'scheduled' : 'endless',
        plannedMinutes: typeof f.plannedMinutes === 'number' ? f.plannedMinutes : null,
        startedAt: f.startedAt as number,
        endedAt: num(f.endedAt, f.startedAt as number),
        focusMs: Math.max(0, num(f.focusMs, 0)),
        breakMs: Math.max(0, num(f.breakMs, 0)),
        pomodoros: Math.max(0, Math.floor(num(f.pomodoros, 0))),
        rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
        habitId: typeof f.habitId === 'string' ? f.habitId : null,
        updatedAt: num(f.updatedAt, ts),
      };
    });

  return {
    app: 'ticktick-clone',
    schemaVersion: num(obj.schemaVersion, 1),
    exportedAt: str(obj.exportedAt, new Date().toISOString()),
    folders,
    lists,
    tasks,
    habits,
    habitLogs,
    focusSessions,
  };
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

export function backupFilename(ext: 'json' | 'csv'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tasks-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}
