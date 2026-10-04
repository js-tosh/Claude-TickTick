import { useState } from 'react';
import { createTask } from '../db/repo';
import { DEFAULT_PRIORITY, NEW_TASK_TITLE, type Priority } from '../db/types';
import { useFolders, useLists } from '../hooks/useData';
import { parseQuickAdd, resolveListRef } from '../lib/quickAdd';
import { todayKey } from '../lib/dates';
import { notificationPermission } from '../lib/notifications';
import { isNative } from '../lib/platform';
import { useUI } from '../state/ui';
import { ExpandIcon, PlusIcon } from './Icons';

interface Props {
  /** Where a new task goes unless the text says "@list". */
  listId: string;
  /** Defaults applied by the current view (e.g. Today sets dueDate). */
  defaults?: { dueDate?: string | null; tags?: string[]; priority?: Priority };
  placeholder?: string;
  autoFocus?: boolean;
  /** 'inline' bars hide on phones, where the + button opens a sheet instead. */
  variant?: 'inline' | 'sheet';
  /** After a task was added with Enter (the box stays open for the next one). */
  onAdded?: () => void;
  /** After a task was created and the full editor opened on it. */
  onOpened?: () => void;
}


export function QuickAdd({ listId, defaults, placeholder, autoFocus, variant = 'inline', onAdded, onOpened }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lists = useLists();
  const folders = useFolders();
  const { showToast, selectTask } = useUI();

  /**
   * Create the task from the text. With `open`, the task is created even
   * from an empty box and the full editor opens on it, so list, folder,
   * reminder, repeat, notes and subtasks can be set in one go.
   */
  const submit = async (open = false) => {
    const raw = text.trim();
    if (busy || (!raw && !open)) return;
    const parsed = parseQuickAdd(raw);
    let title = parsed.title;
    let target = listId;
    if (parsed.listRef) {
      const found = resolveListRef(parsed.listRef, lists ?? [], folders ?? []);
      if (found) target = found;
      else title = `${title} @${parsed.listRef}`.trim(); // no such list: keep the words
    }
    if (!title) {
      if (!open) return;
      title = NEW_TASK_TITLE;
    }
    setBusy(true);
    try {
      const dueDate = parsed.dueDate ?? defaults?.dueDate ?? (parsed.dueTime ? todayKey() : null);
      const task = await createTask({
        listId: target,
        title,
        dueDate,
        dueTime: dueDate ? parsed.dueTime : null,
        // A time means "remind me then".
        reminderMinutes: dueDate && parsed.dueTime ? 0 : null,
        priority: parsed.priority ?? defaults?.priority ?? DEFAULT_PRIORITY,
        tags: [...(defaults?.tags ?? []), ...parsed.tags],
      });
      if (dueDate && parsed.dueTime && isNative) void notificationPermission(true);
      if (target !== listId && !open) {
        const name = lists?.find((l) => l.id === target)?.name ?? parsed.listRef;
        showToast(`Added to ${name}`);
      }
      setText('');
      if (open) {
        onOpened?.();
        selectTask(task.id);
      } else {
        onAdded?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={`quick-add ${variant}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <span className="quick-add-icon">
        <PlusIcon size={18} />
      </span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? 'Add a task…  try “Pay rent tomorrow 3pm !urgent #home @Work”'}
        aria-label="Add a task"
        autoFocus={autoFocus}
        enterKeyHint="done"
        autoComplete="off"
      />
      <button
        type="button"
        className="icon-btn subtle quick-add-expand"
        onClick={() => void submit(true)}
        disabled={busy}
        title="Open the full editor"
        aria-label="Add and open the full editor"
      >
        <ExpandIcon size={18} />
      </button>
    </form>
  );
}
