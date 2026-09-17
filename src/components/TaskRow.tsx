import type { List, Task } from '../db/types';
import { formatDueLabel, relativeBucket } from '../lib/dates';
import { setTaskDone } from '../db/repo';
import { ChevronIcon, RepeatIcon } from './Icons';

interface Props {
  task: Task;
  subtasks?: Task[];
  list?: List;
  showList: boolean;
  selected: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onSelect: (id: string) => void;
  depth?: number;
}

export function TaskRow({ task, subtasks = [], list, showList, selected, expanded, onToggleExpand, onSelect, depth = 0 }: Props) {
  const done = task.status === 'done';
  const openSubs = subtasks.filter((s) => s.status === 'open').length;
  const bucket = task.dueDate ? relativeBucket(task.dueDate) : null;

  return (
    <div
      className={`task-row p${task.priority}${done ? ' done' : ''}${selected ? ' selected' : ''}`}
      style={depth ? { paddingLeft: `${depth * 28 + 12}px` } : undefined}
      onClick={() => onSelect(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
    >
      {subtasks.length > 0 ? (
        <button
          type="button"
          className={`expand-btn${expanded ? ' open' : ''}`}
          aria-label={expanded ? 'Hide subtasks' : 'Show subtasks'}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
        >
          <ChevronIcon size={14} />
        </button>
      ) : (
        <span className="expand-spacer" />
      )}
      <label className="checkbox-wrap" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => setTaskDone(task.id, e.target.checked)}
          aria-label={done ? `Mark "${task.title}" not done` : `Complete "${task.title}"`}
        />
        <span className="checkbox" />
      </label>
      <div className="task-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {task.dueDate && (
            <span className={`meta-chip due ${bucket ?? ''}`}>
              {formatDueLabel(task.dueDate, task.dueTime)}
              {task.repeat !== 'none' && <RepeatIcon size={12} />}
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="meta-chip">
              {subtasks.length - openSubs}/{subtasks.length}
            </span>
          )}
          {task.notes.trim() && <span className="meta-chip">notes</span>}
          {task.tags.map((t) => (
            <span key={t} className="meta-chip tag">
              #{t}
            </span>
          ))}
          {showList && list && (
            <span className="meta-chip list">
              {list.color && <span className="list-dot small" style={{ background: list.color }} />}
              {list.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
