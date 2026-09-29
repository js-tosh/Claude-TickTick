import { useEffect, useRef } from 'react';
import type { Priority } from '../db/types';
import { useBackHandler } from '../lib/backStack';
import { PlusIcon } from './Icons';
import { QuickAdd } from './QuickAdd';

interface SheetProps {
  listId: string;
  defaults?: { dueDate?: string | null; tags?: string[]; priority?: Priority };
  placeholder?: string;
  /** Short note above the input, e.g. "Adds to Inbox" or "Due Tue, Sep 29". */
  note?: string;
  onClose: () => void;
}

/** The quick-add bar as a bottom sheet, opened by the floating + button. */
export function QuickAddSheet({ listId, defaults, placeholder, note, onClose }: SheetProps) {
  useBackHandler(true, onClose);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Focus lands on the input; give the keyboard a moment to open, then keep the sheet in view.
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'end' }), 250);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [onClose]);

  return (
    <div className="sheet-scrim" onClick={onClose} role="presentation">
      <div className="sheet" ref={ref} role="dialog" aria-label="Add a task" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        {note && <div className="sheet-note muted small">{note}</div>}
        <QuickAdd listId={listId} defaults={defaults} placeholder={placeholder} autoFocus variant="sheet" />
        <div className="sheet-hint muted small">Enter adds the task. Try “!high”, “#tag”, “@list”, “tomorrow”, “3pm”.</div>
      </div>
    </div>
  );
}

/** Floating action button (phones only, see CSS). */
export function Fab({ onClick, label = 'Add a task' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label}>
      <PlusIcon size={26} />
    </button>
  );
}
