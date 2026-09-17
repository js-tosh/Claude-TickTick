import { useEffect } from 'react';
import { ensureInbox } from './db/repo';
import { useAllTasks, useCounts, useFolders, useInbox, useLists, useTags } from './hooks/useData';
import { useUI } from './state/ui';
import { Sidebar } from './components/Sidebar';
import { MainPane } from './components/MainPane';
import { TaskDetail } from './components/TaskDetail';
import { Dialogs } from './components/dialogs';

export default function App() {
  const folders = useFolders();
  const lists = useLists();
  const inbox = useInbox();
  const tasks = useAllTasks();
  const tags = useTags(tasks);
  const counts = useCounts(tasks, inbox?.id);
  const { selectedTaskId, selectTask, dialog, toast, view, setView } = useUI();

  useEffect(() => {
    void ensureInbox();
  }, []);

  // If the current list was deleted (or the saved view points at a missing list) fall back to Inbox.
  useEffect(() => {
    if (!lists) return;
    if (view.kind === 'list' && !lists.some((l) => l.id === view.listId)) setView({ kind: 'inbox' });
  }, [lists, view, setView]);

  // Escape closes the detail panel when no dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog && selectedTaskId) selectTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, selectedTaskId, selectTask]);

  if (!folders || !lists || !inbox || !tasks) {
    return <div className="boot">Loading…</div>;
  }

  return (
    <div className={`app${selectedTaskId ? ' has-detail' : ''}`}>
      <Sidebar folders={folders} lists={lists} tags={tags} counts={counts} />
      <MainPane tasks={tasks} lists={lists} folders={folders} inbox={inbox} />
      {selectedTaskId && <TaskDetail key={selectedTaskId} taskId={selectedTaskId} lists={lists} folders={folders} />}
      <Dialogs folders={folders} lists={lists} taskCount={tasks.length} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
