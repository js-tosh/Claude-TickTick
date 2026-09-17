import { useMemo } from 'react';
import type { Folder, List, Task } from '../db/types';
import { useViewData } from '../hooks/useData';
import { deleteCompletedInList } from '../db/repo';
import { todayKey } from '../lib/dates';
import { useUI, type SortBy } from '../state/ui';
import { MenuIcon, MoreIcon } from './Icons';
import { Menu, type MenuEntry } from './Menu';
import { QuickAdd } from './QuickAdd';
import { TaskList } from './TaskList';

interface Props {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  inbox: List;
}

const SORT_LABELS: Record<SortBy, string> = {
  manual: 'Manual (newest first)',
  dueDate: 'Due date',
  priority: 'Priority',
  title: 'Title',
};

export function MainPane({ tasks, lists, folders, inbox }: Props) {
  const ui = useUI();
  const { view, sortBy, setSortBy, showCompleted, setShowCompleted, openDialog, setSidebarOpen } = ui;
  const data = useViewData(view, tasks, inbox.id, sortBy);

  const currentList = view.kind === 'list' ? lists.find((l) => l.id === view.listId) : view.kind === 'inbox' ? inbox : undefined;
  const folder = currentList?.folderId ? folders.find((f) => f.id === currentList.folderId) : undefined;

  const title = useMemo(() => {
    switch (view.kind) {
      case 'inbox':
        return 'Inbox';
      case 'today':
        return 'Today';
      case 'week':
        return 'Next 7 Days';
      case 'all':
        return 'All';
      case 'completed':
        return 'Completed';
      case 'list':
        return currentList?.name ?? 'List';
      case 'tag':
        return `#${view.tag}`;
      case 'search':
        return `Search: ${view.query}`;
    }
  }, [view, currentList]);

  // Where quick-added tasks go and which defaults they get.
  const quickAddListId = currentList?.id ?? inbox.id;
  const quickDefaults =
    view.kind === 'today' || view.kind === 'week'
      ? { dueDate: todayKey() }
      : view.kind === 'tag'
        ? { tags: [view.tag] }
        : undefined;
  const canQuickAdd = view.kind !== 'completed' && view.kind !== 'search';

  const emptyMessage = (() => {
    switch (view.kind) {
      case 'today':
        return 'Nothing due today. Enjoy the calm.';
      case 'week':
        return 'Nothing due in the next 7 days.';
      case 'completed':
        return 'Completed tasks will show up here.';
      case 'search':
        return 'No tasks match your search.';
      case 'tag':
        return 'No tasks with this tag.';
      default:
        return 'No tasks yet. Add one above.';
    }
  })();

  const menuItems: MenuEntry[] = [
    { heading: 'Sort by' },
    ...(Object.keys(SORT_LABELS) as SortBy[]).map((s) => ({
      label: SORT_LABELS[s],
      checked: sortBy === s,
      onSelect: () => setSortBy(s),
    })),
    'separator',
    { label: 'Show completed', checked: showCompleted, onSelect: () => setShowCompleted(!showCompleted) },
  ];
  if (currentList) {
    menuItems.push('separator');
    if (!currentList.isInbox) {
      menuItems.push({ label: 'Edit list', onSelect: () => openDialog({ kind: 'list', listId: currentList.id }) });
    }
    menuItems.push({
      label: 'Clear completed tasks',
      danger: true,
      disabled: !data || data.completed.length === 0,
      onSelect: () =>
        openDialog({
          kind: 'confirm',
          title: 'Clear completed tasks?',
          message: `${data?.completed.length ?? 0} completed task(s) in "${currentList.name}" will be permanently deleted.`,
          confirmLabel: 'Clear',
          danger: true,
          onConfirm: () => deleteCompletedInList(currentList.id),
        }),
    });
  }

  return (
    <main className="main" aria-label={title}>
      <header className="main-header">
        <button type="button" className="icon-btn hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <MenuIcon />
        </button>
        <div className="main-title">
          {folder && <div className="crumb-static">{folder.name}</div>}
          <h1>
            {currentList?.color && <span className="list-dot" style={{ background: currentList.color }} />}
            {title}
            {data && data.total > 0 && <span className="title-count">{data.total}</span>}
          </h1>
        </div>
        <Menu label="View options" trigger={<MoreIcon />} items={menuItems} />
      </header>

      {canQuickAdd && (
        <QuickAdd
          key={quickAddListId + (view.kind === 'tag' ? view.tag : '')}
          listId={quickAddListId}
          defaults={quickDefaults}
          placeholder={
            view.kind === 'today'
              ? 'Add a task for today…'
              : view.kind === 'tag'
                ? `Add a task tagged #${view.tag}…`
                : undefined
          }
        />
      )}

      {data ? (
        <TaskList
          data={data}
          allTasks={tasks}
          lists={lists}
          showList={!currentList}
          emptyMessage={emptyMessage}
          showCompleted={showCompleted || view.kind === 'completed'}
          headingStyle={view.kind === 'week' || view.kind === 'completed' ? 'date' : 'plain'}
        />
      ) : (
        <div className="empty">Loading…</div>
      )}
    </main>
  );
}
