import { useState } from 'react';
import { createTask } from '../db/repo';
import type { Priority } from '../db/types';
import { useFolders, useLists } from '../hooks/useData';
import { parseQuickAdd, resolveListRef } from '../lib/quickAdd';
import { useUI } from '../state/ui';
import { PlusIcon } from './Icons';

interface Props {
  /** Where a new task goes unless the text says "@list". */
  listId: string;
  /** Defaults applied by the current view (e.g. Today sets dueDate). */
  defaults?: { dueDate?: string | null; tags?: string[]; priority?: Priority };
  placeholder?: string;
  autoFocus?: boolean;
  /** 'inline' bars hide on phones, where the + button opens a sheet instead. */
  variant?: 'inline' | 'sheet';
  onAdded?: () => void;
}

export function QuickAdd({ listId, defaults, placeholder, autoFocus, variant = 'inline', onAdded }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lists = useLists();
  const folders = useFolders();
  const { showToast } = useUI();

  const submit = async () => {
    const raw = text.trim();
    if (!raw || busy) return;
    const parsed = parseQuickAdd(raw);
    let title = parsed.title;
    let target = listId;
    if (parsed.listRef) {
      const found = resolveListRef(parsed.listRef, lists ?? [], folders ?? []);
      if (found) target = found;
      else title = `${title} @${parsed.listRef}`.trim(); // no such list: keep the words
    }
    if (!title) return;
    setBusy(true);
    try {
      await createTask({
        listId: target,
        title,
        dueDate: parsed.dueDate ?? defaults?.dueDate ?? null,
        priority: parsed.priority ?? defaults?.priority ?? 0,
        tags: [...(defaults?.tags ?? []), ...parsed.tags],
      });
      if (target !== listId) {
        const name = lists?.find((l) => l.id === target)?.name ?? parsed.listRef;
        showToast(`Added to ${name}`);
      }
      setText('');
      onAdded?.();
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
        placeholder={placeholder ?? 'Add a task…  try “Pay rent tomorrow !high #home @Work”'}
        aria-label="Add a task"
        autoFocus={autoFocus}
        enterKeyHint="done"
        autoComplete="off"
      />
    </form>
  );
}
