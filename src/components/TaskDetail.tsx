import { useEffect, useRef, useState } from 'react';
import { useBackHandler } from '../lib/backStack';
import { useDraft } from '../hooks/useDraft';
import type { Folder, List, Priority, Repeat, Task } from '../db/types';
import { PRIORITY_LABELS, REPEAT_LABELS } from '../db/types';
import { createTask, deleteTask, setTaskDone, updateTask } from '../db/repo';
import { useSubtasks, useTask } from '../hooks/useData';
import { addDaysKey, todayKey } from '../lib/dates';
import { useUI } from '../state/ui';
import { ArrowLeftIcon, CalendarIcon, CloseIcon, FlagIcon, MoveIcon, PlusIcon, RepeatIcon, TagIcon, TrashIcon } from './Icons';

interface Props {
  taskId: string;
  lists: List[];
  folders: Folder[];
}

export function TaskDetail({ taskId, lists, folders }: Props) {
  const task = useTask(taskId);
  const subtasks = useSubtasks(taskId);
  const { selectTask, openDialog } = useUI();
  const parent = useTask(task?.parentId ?? null);
  useBackHandler(true, () => selectTask(null));

  if (!task) {
    return (
      <aside className="detail">
        <div className="detail-empty">
          <p>This task no longer exists.</p>
          <button type="button" className="btn" onClick={() => selectTask(null)}>
            Close
          </button>
        </div>
      </aside>
    );
  }

  const confirmDelete = () =>
    openDialog({
      kind: 'confirm',
      title: 'Delete this task?',
      message: subtasks.length ? `Its ${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'} will be deleted too.` : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await deleteTask(task.id);
        selectTask(null);
      },
    });

  return (
    <aside className="detail" aria-label="Task details">
      <header className="detail-header">
        <button type="button" className="icon-btn detail-back" onClick={() => selectTask(null)} aria-label="Back to list">
          <ArrowLeftIcon />
        </button>
        {parent ? (
          <button type="button" className="crumb" onClick={() => selectTask(parent.id)}>
            ← {parent.title}
          </button>
        ) : (
          <span className="crumb-static">{lists.find((l) => l.id === task.listId)?.name ?? ''}</span>
        )}
        <div className="detail-actions">
          <button type="button" className="icon-btn danger" onClick={confirmDelete} aria-label="Delete task">
            <TrashIcon />
          </button>
          <button type="button" className="icon-btn detail-close" onClick={() => selectTask(null)} aria-label="Close details">
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="detail-scroll">
        <div className={`detail-title-row p${task.priority}${task.status === 'done' ? ' done' : ''}`}>
          <label className="checkbox-wrap large">
            <input
              type="checkbox"
              checked={task.status === 'done'}
              onChange={(e) => setTaskDone(task.id, e.target.checked)}
              aria-label={task.status === 'done' ? 'Mark not done' : 'Mark done'}
            />
            <span className="checkbox" />
          </label>
          <TitleEditor key={task.id} task={task} />
        </div>

        <div className="field-grid">
          <DueEditor task={task} />

          <label className="field">
            <span className="field-label">
              <FlagIcon size={16} /> Priority
            </span>
            <select value={task.priority} onChange={(e) => updateTask(task.id, { priority: Number(e.target.value) as Priority })}>
              {([0, 1, 3, 5] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          {task.parentId === null && (
            <label className="field">
              <span className="field-label">
                <RepeatIcon size={16} /> Repeat
              </span>
              <select
                value={task.repeat}
                disabled={!task.dueDate}
                title={task.dueDate ? undefined : 'Set a due date first'}
                onChange={(e) => updateTask(task.id, { repeat: e.target.value as Repeat })}
              >
                {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {task.parentId === null && (
            <label className="field">
              <span className="field-label">
                <MoveIcon size={16} /> List
              </span>
              <select value={task.listId} onChange={(e) => updateTask(task.id, { listId: e.target.value })}>
                {lists
                  .filter((l) => !l.folderId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                {folders.map((f) => {
                  const inside = lists.filter((l) => l.folderId === f.id);
                  if (!inside.length) return null;
                  return (
                    <optgroup key={f.id} label={f.name}>
                      {inside.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          )}
        </div>

        <div className="field">
          <span className="field-label">
            <TagIcon size={16} /> Tags
          </span>
          <TagEditor key={task.id} task={task} />
        </div>

        <div className="field">
          <span className="field-label">Notes</span>
          <NotesEditor key={task.id} task={task} />
        </div>

        {task.parentId === null && (
          <div className="field">
            <span className="field-label">
              Subtasks{' '}
              {subtasks.length > 0 && (
                <span className="muted">
                  {subtasks.filter((s) => s.status === 'done').length}/{subtasks.length}
                </span>
              )}
            </span>
            <SubtaskEditor task={task} subtasks={subtasks} />
          </div>
        )}

        <div className="detail-footer muted">
          Created {new Date(task.createdAt).toLocaleString()}
          {task.completedAt && <> · Completed {new Date(task.completedAt).toLocaleString()}</>}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function TitleEditor({ task }: { task: Task }) {
  const { value, setValue, flush, reset } = useDraft(task.title, (v) => {
    const t = v.trim();
    if (t) void updateTask(task.id, { title: t });
  });
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const commit = () => {
    if (!value.trim()) {
      reset(task.title);
      return;
    }
    flush();
  };

  return (
    <textarea
      ref={ref}
      className="detail-title"
      value={value}
      rows={1}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      aria-label="Task title"
    />
  );
}

function DueEditor({ task }: { task: Task }) {
  const today = todayKey();
  const set = (dueDate: string | null) => updateTask(task.id, { dueDate });
  return (
    <div className="field">
      <span className="field-label">
        <CalendarIcon size={16} /> Due
      </span>
      <div className="due-inputs">
        <input
          type="date"
          value={task.dueDate ?? ''}
          onChange={(e) => set(e.target.value || null)}
          aria-label="Due date"
        />
        <input
          type="time"
          value={task.dueTime ?? ''}
          disabled={!task.dueDate}
          onChange={(e) => updateTask(task.id, { dueTime: e.target.value || null })}
          aria-label="Due time"
        />
      </div>
      <div className="chip-row">
        <button type="button" className={`chip${task.dueDate === today ? ' on' : ''}`} onClick={() => set(today)}>
          Today
        </button>
        <button type="button" className={`chip${task.dueDate === addDaysKey(today, 1) ? ' on' : ''}`} onClick={() => set(addDaysKey(today, 1))}>
          Tomorrow
        </button>
        <button type="button" className={`chip${task.dueDate === addDaysKey(today, 7) ? ' on' : ''}`} onClick={() => set(addDaysKey(today, 7))}>
          Next week
        </button>
        {task.dueDate && (
          <button type="button" className="chip" onClick={() => set(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function TagEditor({ task }: { task: Task }) {
  const [draft, setDraft] = useState('');
  const pending = useRef({ draft, tags: task.tags });
  pending.current = { draft, tags: task.tags };
  // Keep a half-typed tag if the panel closes before Enter or blur.
  useEffect(
    () => () => {
      const parts = pending.current.draft.split(/[,\s]+/).filter(Boolean);
      if (parts.length) void updateTask(task.id, { tags: [...pending.current.tags, ...parts] });
    },
    [task.id],
  );
  const add = () => {
    const parts = draft.split(/[,\s]+/).filter(Boolean);
    if (parts.length) void updateTask(task.id, { tags: [...task.tags, ...parts] });
    setDraft('');
  };
  const remove = (tag: string) => updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) });
  return (
    <div className="tag-editor">
      {task.tags.map((t) => (
        <span key={t} className="tag-chip">
          #{t}
          <button type="button" onClick={() => remove(t)} aria-label={`Remove tag ${t}`}>
            <CloseIcon size={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder={task.tags.length ? 'Add tag' : 'Add tags, e.g. home errands'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && task.tags.length) {
            void remove(task.tags[task.tags.length - 1]);
          }
        }}
        aria-label="Add tag"
        autoComplete="off"
      />
    </div>
  );
}

function NotesEditor({ task }: { task: Task }) {
  const { value, setValue, flush } = useDraft(task.notes, (v) => void updateTask(task.id, { notes: v }));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="notes"
      value={value}
      placeholder="Add notes…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={flush}
      aria-label="Notes"
    />
  );
}

function SubtaskEditor({ task, subtasks }: { task: Task; subtasks: Task[] }) {
  const [draft, setDraft] = useState('');
  const { selectTask } = useUI();
  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    await createTask({ listId: task.listId, parentId: task.id, title });
    setDraft('');
  };
  return (
    <div className="subtasks">
      {subtasks.map((s) => (
        <div key={s.id} className={`subtask${s.status === 'done' ? ' done' : ''}`}>
          <label className="checkbox-wrap">
            <input
              type="checkbox"
              checked={s.status === 'done'}
              onChange={(e) => setTaskDone(s.id, e.target.checked)}
              aria-label={`Complete subtask ${s.title}`}
            />
            <span className="checkbox" />
          </label>
          <SubtaskTitle key={s.id} sub={s} />
          <button type="button" className="icon-btn subtle" onClick={() => selectTask(s.id)} aria-label={`Open subtask ${s.title}`}>
            <ArrowLeftIcon size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button type="button" className="icon-btn subtle" onClick={() => deleteTask(s.id)} aria-label={`Delete subtask ${s.title}`}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
      <form
        className="subtask-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <PlusIcon size={16} />
        <input
          type="text"
          value={draft}
          placeholder="Add subtask"
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Add subtask"
          autoComplete="off"
          enterKeyHint="done"
        />
      </form>
    </div>
  );
}

function SubtaskTitle({ sub }: { sub: Task }) {
  const { value, setValue, flush, reset } = useDraft(sub.title, (v) => {
    const t = v.trim();
    if (t) void updateTask(sub.id, { title: t });
  });
  return (
    <input
      type="text"
      className="subtask-title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!value.trim()) reset(sub.title);
        else flush();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      aria-label="Subtask title"
    />
  );
}
