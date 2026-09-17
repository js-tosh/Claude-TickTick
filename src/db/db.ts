import Dexie, { type EntityTable } from 'dexie';
import type { Folder, List, Task } from './types';

/**
 * Local database. Everything lives in the browser's / WebView's IndexedDB,
 * so each device (and each family member's browser) holds its own data.
 */
export class TasksDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>;
  lists!: EntityTable<List, 'id'>;
  tasks!: EntityTable<Task, 'id'>;

  constructor(name = 'ticktick-clone') {
    super(name);
    this.version(1).stores({
      folders: 'id, sortOrder',
      lists: 'id, folderId, sortOrder, isInbox',
      tasks: 'id, listId, parentId, status, dueDate, priority, sortOrder, *tags, [listId+status], [parentId+status]',
    });
  }
}

export const db = new TasksDB();
