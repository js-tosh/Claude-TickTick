import { useEffect, useRef, useState } from 'react';
import { useBackHandler } from '../lib/backStack';
import { useDraft } from '../hooks/useDraft';
import type { Folder, ItemKind, List, Location, Priority, Repeat, Task } from '../db/types';
import { CLOUD_READY } from '../lib/cloud';
import { ALL_DAY_REMINDER_TIME, ITEM_KINDS, LOCATIONS, NEW_TASK_TITLE, PRIORITIES, isNote, locationOf, PRIORITY_LABELS, REMINDER_OPTIONS, REPEAT_LABELS } from '../db/types';
import { notificationPermission } from '../lib/notifications';
import { isNative } from '../lib/platform';
import { createTask, deleteTask, setTaskDone, updateTask } from '../db/repo';
import { useSubtasks, useTask } from '../hooks/useData';
import { addDaysKey, todayKey } from '../lib/dates';
import { useUI } from '../state/ui';
import { BackgroundNotice } from './BackgroundNotice';
import { ArrowLeftIcon, BellIcon, CalendarIcon, CloseIcon, FlagIcon, MoveIcon, NoteIcon, PlusIcon, RepeatIcon, TagIcon, TrashIcon } from './Icons';

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

  const note = isNote(task);

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
          {note ? (
            <span className="note-badge large" aria-label="Note">
              <NoteIcon size={20} />
            </span>
          ) : (
            <label className="checkbox-wrap large">
              <input
                type="checkbox"
                checked={task.status === 'done'}
                onChange={(e) => setTaskDone(task.id, e.target.checked)}
                aria-label={task.status === 'done' ? 'Mark not done' : 'Mark done'}
              />
              <span className="checkbox" />
            </label>
          )}
          <TitleEditor key={task.id} task={task} />
        </div>

        {note && (
          <div className="field note-body">
            <NotesEditor key={task.id} task={task} placeholder="Write anything: plans, ideas, what you liked…" minHeight={220} />
          </div>
        )}

        <div className="field-grid">
          <DueEditor task={task} />
          <ReminderEditor task={task} />

          <label className="field">
            <span className="field-label">
              <FlagIcon size={16} /> Priority
            </span>
            <select value={task.priority} onChange={(e) => updateTask(task.id, { priority: Number(e.target.value) as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          {task.parentId === null && !note && (
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
                {note ? <NoteIcon size={16} /> : <MoveIcon size={16} />} Type
              </span>
              <select value={task.kind ?? 'task'} onChange={(e) => updateTask(task.id, { kind: e.target.value as ItemKind })}>
                {ITEM_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {task.parentId === null && <PlaceEditor key={task.id} task={task} lists={lists} folders={folders} />}

        <div className="field">
          <span className="field-label">
            <TagIcon size={16} /> Tags
          </span>
          <TagEditor key={task.id} task={task} />
        </div>

        {!note && (
          <div className="field">
            <span className="field-label">Notes</span>
            <NotesEditor key={task.id} task={task} />
          </div>
        )}

        {task.parentId === null && !note && (
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

  // A task just created from the quick-add "open full editor" button: put the cursor
  // on its placeholder title so typing replaces it.
  const fresh = task.title === NEW_TASK_TITLE && Date.now() - task.createdAt < 10_000;
  useEffect(() => {
    if (fresh) ref.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={ref}
      className="detail-title"
      value={value}
      autoFocus={fresh}
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
          onChange={(e) => {
            const dueTime = e.target.value || null;
            // Setting a time turns the reminder on (at that time) unless one is already chosen.
            const reminderMinutes = dueTime && task.reminderMinutes == null ? 0 : task.reminderMinutes ?? null;
            void updateTask(task.id, { dueTime, reminderMinutes });
            if (dueTime && task.reminderMinutes == null) void askNotificationPermission();
          }}
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

async function askNotificationPermission() {
  if (!isNative) return;
  await notificationPermission(true);
}

function ReminderEditor({ task }: { task: Task }) {
  const { showToast } = useUI();
  const value = task.reminderMinutes ?? null;
  const set = async (minutes: number | null) => {
    await updateTask(task.id, { reminderMinutes: minutes });
    if (minutes !== null && isNative && (await notificationPermission(true)) !== 'granted') {
      showToast('Allow notifications in Android settings to get reminders.');
    }
  };
  return (
    <div className="field">
      <span className="field-label">
        <BellIcon size={16} /> Reminder
      </span>
      {task.dueTime ? (
        <select value={value === null ? '' : value} disabled={!task.dueDate} onChange={(e) => void set(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">None</option>
          {REMINDER_OPTIONS.map((o) => (
            <option key={o.minutes} value={o.minutes}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="due-inputs">
          <select value={value === null ? '' : 'day'} disabled={!task.dueDate} onChange={(e) => void set(e.target.value === '' ? null : 0)}>
            <option value="">None</option>
            <option value="day">On the day at</option>
          </select>
          <input
            type="time"
            value={task.reminderTime ?? ALL_DAY_REMINDER_TIME}
            disabled={!task.dueDate || value === null}
            onChange={(e) => e.target.value && void updateTask(task.id, { reminderTime: e.target.value })}
            aria-label="Reminder time"
          />
        </div>
      )}
      {!task.dueDate && <span className="muted small">Set a due date first.</span>}
      {task.dueDate && value !== null && !isNative && <span className="muted small">Reminders ring in the Android app.</span>}
      {task.dueDate && value !== null && task.status === 'open' && <BackgroundNotice />}
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

function NotesEditor({ task, placeholder = 'Add notes…', minHeight = 72 }: { task: Task; placeholder?: string; minHeight?: number }) {
  const { value, setValue, flush } = useDraft(task.notes, (v) => void updateTask(task.id, { notes: v }));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);
  return (
    <textarea
      ref={ref}
      className="notes"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={flush}
      aria-label={isNote(task) ? 'Note text' : 'Notes'}
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

/**
 * Where the item lives: Location (Local / Cloud / Shared with me), then a
 * folder in that place, then a list in that folder. Picking the list moves it.
 */
function PlaceEditor({ task, lists, folders }: { task: Task; lists: List[]; folders: Folder[] }) {
  const current = lists.find((l) => l.id === task.listId);
  const [location, setLocation] = useState<Location>(current ? locationOf(current) : 'local');
  const [folderId, setFolderId] = useState<string>(current?.folderId ?? '');

  const placeFolders = folders.filter((f) => locationOf(f) === location);
  const placeLists = lists.filter((l) => locationOf(l) === location && (l.folderId ?? '') === folderId);
  const inChoice = placeLists.some((l) => l.id === task.listId);

  return (
    <div className="field place-editor">
      <span className="field-label">
        <MoveIcon size={16} /> Move to
      </span>
      <div className="place-grid">
        <label className="place-cell">
          <span className="place-label">Location</span>
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value as Location);
              setFolderId('');
            }}
          >
            {LOCATIONS.map((l) => (
              <option key={l.id} value={l.id} disabled={l.id !== 'local' && !CLOUD_READY}>
                {l.label}
                {l.id !== 'local' && !CLOUD_READY ? ' (sign-in coming soon)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="place-cell">
          <span className="place-label">Folder</span>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">No folder</option>
            {placeFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="place-cell wide">
          <span className="place-label">List</span>
          <select
            value={inChoice ? task.listId : ''}
            onChange={(e) => e.target.value && void updateTask(task.id, { listId: e.target.value })}
          >
            {!inChoice && <option value="">{placeLists.length ? 'Choose a list…' : 'No lists here yet'}</option>}
            {placeLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
