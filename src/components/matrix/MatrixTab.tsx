import { useMemo, useState } from 'react';
import type { Folder, List, Priority, Task } from '../../db/types';
import { setTaskDone } from '../../db/repo';
import { formatDueLabel, relativeBucket } from '../../lib/dates';
import { sortTasks } from '../../hooks/useData';
import { useUI } from '../../state/ui';
import { PlusIcon } from '../Icons';
import { QuickAddSheet } from '../QuickAddSheet';
import { TaskDetail } from '../TaskDetail';

interface Props {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  inbox: List;
}

const QUADRANTS: { priority: Priority; numeral: string; title: string; cls: string }[] = [
  { priority: 5, numeral: 'I', title: 'Urgent & Important', cls: 'q-high' },
  { priority: 3, numeral: 'II', title: 'Not Urgent & Important', cls: 'q-med' },
  { priority: 1, numeral: 'III', title: 'Urgent & Unimportant', cls: 'q-low' },
  { priority: 0, numeral: 'IV', title: 'Not Urgent & Unimportant', cls: 'q-none' },
];

/** Eisenhower matrix: the four priorities as four quadrants. */
export function MatrixTab({ tasks, lists, folders, inbox }: Props) {
  const { selectedTaskId, selectTask } = useUI();
  const [adding, setAdding] = useState<Priority | null>(null);
  const [showDone, setShowDone] = useState(false);

  const byPriority = useMemo(() => {
    const m = new Map<Priority, { open: Task[]; done: Task[] }>();
    for (const q of QUADRANTS) m.set(q.priority, { open: [], done: [] });
    for (const t of tasks) {
      if (t.parentId) continue;
      const bucket = m.get(t.priority) ?? m.get(0)!;
      (t.status === 'open' ? bucket.open : bucket.done).push(t);
    }
    for (const b of m.values()) {
      b.open = sortTasks(b.open, 'dueDate');
      b.done.sort((a, c) => (c.completedAt ?? 0) - (a.completedAt ?? 0));
    }
    return m;
  }, [tasks]);

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);

  return (
    <div className={`matrix-layout${selectedTaskId ? ' has-detail' : ''}`}>
      <main className="page matrix-main" aria-label="Eisenhower Matrix">
        <header className="page-header">
          <h1>Eisenhower Matrix</h1>
          <button type="button" className={`btn small${showDone ? ' on' : ''}`} onClick={() => setShowDone((v) => !v)} aria-pressed={showDone}>
            {showDone ? 'Hide done' : 'Show done'}
          </button>
        </header>
        <div className="matrix-grid">
          {QUADRANTS.map((q) => {
            const b = byPriority.get(q.priority)!;
            return (
              <section key={q.priority} className={`quadrant ${q.cls}`} aria-label={`${q.title}, ${b.open.length} open`}>
                <header className="quadrant-head">
                  <span className="quadrant-numeral" aria-hidden="true">
                    {q.numeral}
                  </span>
                  <span className="quadrant-title">{q.title}</span>
                  <span className="quadrant-count">{b.open.length}</span>
                  <button type="button" className="icon-btn subtle" onClick={() => setAdding(q.priority)} aria-label={`Add a task to ${q.title}`}>
                    <PlusIcon size={16} />
                  </button>
                </header>
                <div className="quadrant-body">
                  {b.open.length === 0 && !(showDone && b.done.length) && <div className="quadrant-empty muted small">Nothing here</div>}
                  {b.open.map((t) => (
                    <MatrixRow key={t.id} task={t} list={listById.get(t.listId)} selected={selectedTaskId === t.id} onSelect={selectTask} />
                  ))}
                  {showDone && b.done.map((t) => (
                    <MatrixRow key={t.id} task={t} list={listById.get(t.listId)} selected={selectedTaskId === t.id} onSelect={selectTask} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
      {selectedTaskId && <TaskDetail key={selectedTaskId} taskId={selectedTaskId} lists={lists} folders={folders} />}
      {adding !== null && (
        <QuickAddSheet
          listId={inbox.id}
          defaults={{ priority: adding }}
          note={`${QUADRANTS.find((q) => q.priority === adding)?.title} · adds to Inbox unless you write @list`}
          placeholder="Add a task…"
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

function MatrixRow({ task, list, selected, onSelect }: { task: Task; list?: List; selected: boolean; onSelect: (id: string) => void }) {
  const done = task.status === 'done';
  const bucket = task.dueDate ? relativeBucket(task.dueDate) : null;
  return (
    <div
      className={`matrix-row p${task.priority}${done ? ' done' : ''}${selected ? ' selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
    >
      <label className="checkbox-wrap" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={done} onChange={(e) => setTaskDone(task.id, e.target.checked)} aria-label={done ? `Mark "${task.title}" not done` : `Complete "${task.title}"`} />
        <span className="checkbox" />
      </label>
      <div className="matrix-row-main">
        <div className="matrix-row-title">{task.title}</div>
        {(task.dueDate || (list && !list.isInbox)) && (
          <div className="task-meta">
            {task.dueDate && <span className={`meta-chip due ${bucket ?? ''}`}>{formatDueLabel(task.dueDate, task.dueTime)}</span>}
            {list && !list.isInbox && <span className="meta-chip list">{list.name}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
