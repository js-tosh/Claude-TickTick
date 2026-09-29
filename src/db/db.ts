import Dexie, { type EntityTable } from 'dexie';
import type { FocusSession, Folder, Habit, HabitLog, List, Task } from './types';

/**
 * Local database. Everything lives in the browser's / WebView's IndexedDB,
 * so each device (and each family member's browser) holds its own data.
 */
export class TasksDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>;
  lists!: EntityTable<List, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  focusSessions!: EntityTable<FocusSession, 'id'>;

  constructor(name = 'ticktick-clone') {
    super(name);
    this.version(1).stores({
      folders: 'id, sortOrder',
      lists: 'id, folderId, sortOrder, isInbox',
      tasks: 'id, listId, parentId, status, dueDate, priority, sortOrder, *tags, [listId+status], [parentId+status]',
    });
    // Version 2 only adds tables, so existing data is kept as-is.
    this.version(2).stores({
      habits: 'id, sortOrder',
      habitLogs: 'id, habitId, date, [habitId+date]',
      focusSessions: 'id, startedAt, activity',
    });
  }
}

export const db = new TasksDB();
