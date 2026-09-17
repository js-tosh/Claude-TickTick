import { useMemo, useState } from 'react';
import type { List, Task } from '../db/types';
import type { ViewData } from '../hooks/useData';
import { formatDayHeading } from '../lib/dates';
import { useUI } from '../state/ui';
import { ChevronIcon } from './Icons';
import { TaskRow } from './TaskRow';

interface Props {
  data: ViewData;
  allTasks: Task[];
  lists: List[];
  showList: boolean;
  emptyMessage: string;
  showCompleted: boolean;
  headingStyle?: 'plain' | 'date';
}

export function TaskList({ data, allTasks, lists, showList, emptyMessage, showCompleted, headingStyle = 'plain' }: Props) {
  const { selectedTaskId, selectTask } = useUI();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [completedOpen, setCompletedOpen] = useState(true);

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const subsByParent = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.parentId) continue;
      if (!m.has(t.parentId)) m.set(t.parentId, []);
      m.get(t.parentId)!.push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [allTasks]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderTask = (t: Task) => {
    const subs = subsByParent.get(t.id) ?? [];
    const isOpen = expanded.has(t.id);
    return (
      <div key={t.id} className="task-group">
        <TaskRow
          task={t}
          subtasks={subs}
          list={listById.get(t.listId)}
          showList={showList}
          selected={selectedTaskId === t.id}
          expanded={isOpen}
          onToggleExpand={() => toggleExpand(t.id)}
          onSelect={selectTask}
        />
        {isOpen &&
          subs.map((s) => (
            <TaskRow
              key={s.id}
              task={s}
              list={listById.get(s.listId)}
              showList={false}
              selected={selectedTaskId === s.id}
              onSelect={selectTask}
              depth={1}
            />
          ))}
      </div>
    );
  };

  const nothingOpen = data.sections.every((s) => s.tasks.length === 0);
  const nothingAtAll = nothingOpen && data.completed.length === 0;

  return (
    <div className="task-list">
      {nothingAtAll && <div className="empty">{emptyMessage}</div>}
      {data.sections.map((s) => {
        if (s.tasks.length === 0 && (s.title === null || headingStyle !== 'date')) return null;
        return (
          <section key={s.key} className="task-section">
            {s.title && (
              <h3 className={`section-title${s.key === 'overdue' ? ' overdue' : ''}`}>
                {headingStyle === 'date' && s.key !== 'overdue' ? formatDayHeading(s.key) : s.title}
                <span className="section-count">{s.tasks.length}</span>
              </h3>
            )}
            {s.tasks.length === 0 ? <div className="section-empty">Nothing due</div> : s.tasks.map(renderTask)}
          </section>
        );
      })}
      {showCompleted && data.completed.length > 0 && (
        <section className="task-section completed-section">
          <button type="button" className="section-toggle" onClick={() => setCompletedOpen((v) => !v)} aria-expanded={completedOpen}>
            <span className={`chevron${completedOpen ? ' open' : ''}`}>
              <ChevronIcon size={14} />
            </span>
            Completed <span className="section-count">{data.completed.length}</span>
          </button>
          {completedOpen && data.completed.map(renderTask)}
        </section>
      )}
    </div>
  );
}
