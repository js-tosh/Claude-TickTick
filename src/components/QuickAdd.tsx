import { useState } from 'react';
import { createTask } from '../db/repo';
import type { Priority } from '../db/types';
import { parseQuickAdd } from '../lib/quickAdd';
import { PlusIcon } from './Icons';

interface Props {
  /** Where a new task goes. */
  listId: string;
  /** Defaults applied by the current view (e.g. Today sets dueDate). */
  defaults?: { dueDate?: string | null; tags?: string[]; priority?: Priority };
  placeholder?: string;
  autoFocus?: boolean;
}

export function QuickAdd({ listId, defaults, placeholder, autoFocus }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const raw = text.trim();
    if (!raw || busy) return;
    const parsed = parseQuickAdd(raw);
    if (!parsed.title) return;
    setBusy(true);
    try {
      await createTask({
        listId,
        title: parsed.title,
        dueDate: parsed.dueDate ?? defaults?.dueDate ?? null,
        priority: parsed.priority ?? defaults?.priority ?? 0,
        tags: [...(defaults?.tags ?? []), ...parsed.tags],
      });
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="quick-add"
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
        placeholder={placeholder ?? 'Add a task…  try “Pay rent tomorrow !high #home”'}
        aria-label="Add a task"
        autoFocus={autoFocus}
        enterKeyHint="done"
        autoComplete="off"
      />
    </form>
  );
}
