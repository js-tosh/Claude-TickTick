/** Priority levels mirror TickTick: 0 none, 1 low, 3 medium, 5 high. */
export type Priority = 0 | 1 | 3 | 5;

export type TaskStatus = 'open' | 'done';

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface Folder {
  id: string;
  name: string;
  sortOrder: number;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface List {
  id: string;
  name: string;
  /** null = top level (not inside a folder) */
  folderId: string | null;
  /** Hex color used for the list dot; null = default. */
  color: string | null;
  sortOrder: number;
  /** The Inbox is created on first run and cannot be deleted. */
  isInbox: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  listId: string;
  /** null = top-level task; otherwise this is a subtask of parentId. */
  parentId: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  completedAt: number | null;
  /** Local calendar date 'YYYY-MM-DD' or null. */
  dueDate: string | null;
  /** Local time 'HH:mm' or null (only meaningful with dueDate). */
  dueTime: string | null;
  priority: Priority;
  tags: string[];
  repeat: Repeat;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** Shape of a JSON backup file. */
export interface BackupFile {
  app: 'ticktick-clone';
  schemaVersion: number;
  exportedAt: string;
  folders: Folder[];
  lists: List[];
  tasks: Task[];
}

export const SCHEMA_VERSION = 1;

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'None',
  1: 'Low',
  3: 'Medium',
  5: 'High',
};

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: 'Never',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

export const LIST_COLORS = [
  '#4772fa',
  '#ff6161',
  '#ffac38',
  '#ffd324',
  '#35d19d',
  '#39c8f0',
  '#b98cf5',
  '#f571b6',
  '#8d99ae',
] as const;
