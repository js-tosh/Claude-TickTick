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

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

/** Sunday = 0 … Saturday = 6, like Date#getDay(). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HabitFrequency =
  | { type: 'weekdays'; days: WeekdayIndex[] }
  | { type: 'interval'; every: number };

export type HabitGoal = { type: 'all' } | { type: 'amount'; amount: number; unit: string };

export type HabitSection = 'morning' | 'afternoon' | 'night' | 'others';

export interface Habit {
  id: string;
  name: string;
  /** A single emoji shown in the colored circle. */
  icon: string;
  color: string;
  frequency: HabitFrequency;
  goal: HabitGoal;
  /** 'YYYY-MM-DD'. Days before this are never scheduled. */
  startDate: string;
  /** Number of check-ins aimed for; null = forever. */
  goalDays: number | null;
  section: HabitSection;
  /** Reminder times 'HH:mm'. */
  reminders: string[];
  /** Pinned reminder that re-alerts until checked in. */
  constantReminder: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** One row per habit per day that has a value or a note. */
export interface HabitLog {
  /** `${habitId}:${date}` so a day can only have one entry. */
  id: string;
  habitId: string;
  date: string;
  /** 1 = done for "achieve it all"; a count for amount goals. */
  value: number;
  note: string;
  updatedAt: number;
}

export const MAX_HABITS = 4;
export const MAX_REMINDERS = 3;

export const HABIT_SECTIONS: { id: HabitSection; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'night', label: 'Night' },
  { id: 'others', label: 'Others' },
];

export const GOAL_DAY_OPTIONS: (number | null)[] = [null, 7, 21, 30, 60, 100, 365];

export const HABIT_ICONS = [
  '😊', '🥗', '💪', '🏃', '📚', '💧', '🧘', '🛏️', '🦷', '🍎', '🚶', '✍️',
  '🎸', '🌱', '💊', '🧹', '☀️', '🌙', '🚭', '📵', '🙏', '🎯', '💰', '❤️',
] as const;

export const HABIT_COLORS = ['#a7e27a', '#7cc8f8', '#ffb86b', '#ff8a8a', '#c7a4ff', '#ffe066', '#6fe0c0', '#f7a8d8'] as const;

// ---------------------------------------------------------------------------
// Focus (Pomodoro)
// ---------------------------------------------------------------------------

export type FocusMode = 'endless' | 'scheduled';

export interface FocusSession {
  id: string;
  activity: string;
  mode: FocusMode;
  /** Scheduled sessions only: the length that was picked, in minutes. */
  plannedMinutes: number | null;
  startedAt: number;
  endedAt: number;
  focusMs: number;
  breakMs: number;
  /** Focus blocks that ran to the end. */
  pomodoros: number;
  /** 1–5, or null when the user skipped rating. */
  rating: number | null;
  /** The habit this session was started from and checked in, if any. */
  habitId?: string | null;
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
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
}

/** 2 added habits, habit logs and focus sessions. Version-1 files still import. */
export const SCHEMA_VERSION = 2;

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
