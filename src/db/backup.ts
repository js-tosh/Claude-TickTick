import { db } from './db';
import { SCHEMA_VERSION, type BackupFile, type Folder, type List, type Task } from './types';
import { normalizeTags, ensureInbox } from './repo';
import { isValidKey } from '../lib/dates';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function buildBackup(): Promise<BackupFile> {
  const [folders, lists, tasks] = await Promise.all([
    db.folders.toArray(),
    db.lists.toArray(),
    db.tasks.toArray(),
  ]);
  return {
    app: 'ticktick-clone',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    folders,
    lists,
    tasks,
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
}

/**
 * Import a backup produced by exportJSON().
 *  - merge:   upsert by id (newer updatedAt wins), nothing is deleted.
 *  - replace: wipe local data first, then load the file.
 */
export async function importJSON(text: string, mode: ImportMode): Promise<ImportResult> {
  const parsed = parseBackup(text);
  await db.transaction('rw', db.folders, db.lists, db.tasks, async () => {
    if (mode === 'replace') {
      await db.tasks.clear();
      await db.lists.clear();
      await db.folders.clear();
      await db.folders.bulkAdd(parsed.folders);
      await db.lists.bulkAdd(parsed.lists);
      await db.tasks.bulkAdd(parsed.tasks);
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
  });
  await ensureInbox();
  return { folders: parsed.folders.length, lists: parsed.lists.length, tasks: parsed.tasks.length };
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
      sortOrder: num(t.sortOrder, 0),
      createdAt: num(t.createdAt, ts),
      updatedAt: num(t.updatedAt, ts),
    }));
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const t of tasks) if (t.parentId && !taskIds.has(t.parentId)) t.parentId = null;
  for (const [i, f] of folders.entries()) if (!f.id) throw new Error(`Folder #${i + 1} has no id.`);
  for (const [i, l] of lists.entries()) if (!l.id) throw new Error(`List #${i + 1} has no id.`);
  for (const [i, t] of tasks.entries()) if (!t.id) throw new Error(`Task #${i + 1} has no id.`);
  return {
    app: 'ticktick-clone',
    schemaVersion: num(obj.schemaVersion, 1),
    exportedAt: str(obj.exportedAt, new Date().toISOString()),
    folders,
    lists,
    tasks,
  };
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// Browser download helper
// ---------------------------------------------------------------------------

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(ext: 'json' | 'csv'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tasks-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}
