import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { db } from './db/db';
import { ensureInbox } from './db/repo';
import type { Folder, List, Task } from './db/types';
import { useAllTasks, useCounts, useFolders, useInbox, useLists, useTags } from './hooks/useData';
import { useToday } from './hooks/useToday';
import { runTopBackHandler, useBackHandler } from './lib/backStack';
import { groupLogs } from './lib/habitStats';
import {
  CONFIRM_ACTION_ID,
  onNotificationTap,
  scheduleHabitReminders,
  scheduleTaskReminders,
  snoozeTaskReminder,
  TASK_DONE_ACTION_ID,
  TASK_SNOOZE_ACTION_ID,
  SNOOZE_MINUTES as SNOOZE_MIN,
} from './lib/notifications';
import { setTaskDone } from './db/repo';
import { confirmFocusPhase } from './state/focusTimer';
import { isNative } from './lib/platform';
import { useUI, type Theme } from './state/ui';
import { Sidebar } from './components/Sidebar';
import { MainPane } from './components/MainPane';
import { TaskDetail } from './components/TaskDetail';
import { Dialogs } from './components/dialogs';
import { TabBar } from './components/TabBar';
import { CalendarTab } from './components/calendar/CalendarTab';
import { MatrixTab } from './components/matrix/MatrixTab';
import { FocusTab } from './components/focus/FocusTab';
import { FocusRatingDialog } from './components/focus/FocusRatingDialog';
import { HabitsTab } from './components/habits/HabitsTab';

export default function App() {
  const folders = useFolders();
  const lists = useLists();
  const inbox = useInbox();
  const tasks = useAllTasks();
  const habitCount = useLiveQuery(() => db.habits.count(), []) ?? 0;
  const sessionCount = useLiveQuery(() => db.focusSessions.count(), []) ?? 0;
  const { tab, setTab, selectedTaskId, selectTask, dialog, toast, showToast, view, setView, theme } = useUI();
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => {
    void ensureInbox();
  }, []);

  // If the current list was deleted (or the saved view points at a missing list) fall back to Inbox.
  useEffect(() => {
    if (!lists) return;
    if (view.kind === 'list' && !lists.some((l) => l.id === view.listId)) setView({ kind: 'inbox' });
  }, [lists, view, setView]);

  // Escape closes the detail panel when no dialog is open (dialogs handle their own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog && selectedTaskId && !document.querySelector('dialog[open]')) selectTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, selectedTaskId, selectTask]);

  // Android back: close the top layer; on another tab go back to Tasks; else leave the app.
  useBackHandler(tab !== 'tasks', () => setTab('tasks'));
  useAndroidBackButton();
  useNotificationTaps(setTab, selectTask, showToast);
  useSystemBarStyle(theme);

  if (!folders || !lists || !inbox || !tasks) {
    return <div className="boot">Loading…</div>;
  }

  return (
    <div className={`shell${keyboardOpen ? ' kb-open' : ''}`}>
      <TabBar />
      <div className="tab-panel">
        {tab === 'tasks' && <TasksTab folders={folders} lists={lists} inbox={inbox} tasks={tasks} />}
        {tab === 'calendar' && <CalendarTab tasks={tasks} lists={lists} folders={folders} inbox={inbox} />}
        {tab === 'matrix' && <MatrixTab tasks={tasks} lists={lists} folders={folders} inbox={inbox} />}
        {tab === 'focus' && <FocusTab />}
        {tab === 'habits' && <HabitsTab />}
      </div>
      <Dialogs folders={folders} lists={lists} taskCount={tasks.length} habitCount={habitCount} sessionCount={sessionCount} />
      <FocusRatingDialog />
      <HabitReminderSync />
      <TaskReminderSync tasks={tasks} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function TasksTab({ folders, lists, inbox, tasks }: { folders: Folder[]; lists: List[]; inbox: List; tasks: Task[] }) {
  const tags = useTags(tasks);
  const counts = useCounts(tasks, inbox.id);
  const { selectedTaskId } = useUI();
  return (
    <div className={`app${selectedTaskId ? ' has-detail' : ''}`}>
      <Sidebar folders={folders} lists={lists} tags={tags} counts={counts} />
      <MainPane tasks={tasks} lists={lists} folders={folders} inbox={inbox} />
      {selectedTaskId && <TaskDetail key={selectedTaskId} taskId={selectedTaskId} lists={lists} folders={folders} />}
    </div>
  );
}

/** Keeps task reminder notifications in step with the tasks (Android only). */
function TaskReminderSync({ tasks }: { tasks: Task[] }) {
  const today = useToday();
  const resumes = useResumeCount();
  // Only what can affect the schedule, so typing in a task's notes doesn't re-sync.
  const key = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'open' && !t.parentId && t.dueDate && t.reminderMinutes !== null && t.reminderMinutes !== undefined)
        .map((t) => `${t.id}|${t.title}|${t.dueDate}|${t.dueTime}|${t.reminderMinutes}|${t.reminderTime}`)
        .join('\n'),
    [tasks],
  );
  useEffect(() => {
    if (!isNative) return;
    const t = setTimeout(() => void scheduleTaskReminders(tasks), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, today, resumes]);
  return null;
}

/** Keeps the habit reminder notifications in step with habits and check-ins (Android only). */
function HabitReminderSync() {
  const today = useToday();
  const resumes = useResumeCount();
  const habits = useLiveQuery(() => db.habits.toArray(), []);
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(today).toArray(), [today]);
  useEffect(() => {
    if (!isNative || !habits || !logs) return;
    const t = setTimeout(() => void scheduleHabitReminders(habits, groupLogs(logs)), 800);
    return () => clearTimeout(t);
  }, [habits, logs, resumes]);
  return null;
}

function useResumeCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'visible') setN((x) => x + 1);
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return n;
}

function useAndroidBackButton() {
  useEffect(() => {
    if (!isNative) return;
    let remove: (() => void) | null = null;
    let cancelled = false;
    void import('@capacitor/app').then(async ({ App: CapApp }) => {
      const h = await CapApp.addListener('backButton', () => {
        if (!runTopBackHandler()) void CapApp.minimizeApp();
      });
      if (cancelled) void h.remove();
      else remove = () => void h.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
}

function useNotificationTaps(setTab: (t: 'tasks' | 'focus' | 'habits') => void, selectTask: (id: string | null) => void, showToast: (m: string) => void) {
  useEffect(() => {
    let off: (() => void) | null = null;
    let cancelled = false;
    void onNotificationTap(({ kind, actionId, taskId }) => {
      if (kind === 'focus') {
        setTab('focus');
        if (actionId === CONFIRM_ACTION_ID) confirmFocusPhase();
      } else if (kind === 'habit') {
        setTab('habits');
      } else if (kind === 'task' && taskId) {
        void (async () => {
          const task = await db.tasks.get(taskId);
          if (!task) return;
          if (actionId === TASK_DONE_ACTION_ID) {
            await setTaskDone(taskId, true);
            showToast(`Done: ${task.title}`);
          } else if (actionId === TASK_SNOOZE_ACTION_ID) {
            await snoozeTaskReminder(task);
            showToast(`Reminder snoozed ${SNOOZE_MIN} min`);
          } else {
            setTab('tasks');
            selectTask(taskId);
          }
        })();
      }
    }).then((f) => {
      if (cancelled) f();
      else off = f;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [setTab, selectTask, showToast]);
}

/** Light or dark status-bar icons to match the app theme. */
function useSystemBarStyle(theme: Theme) {
  useEffect(() => {
    if (!isNative) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file', 'reset']);

/** True while the on-screen keyboard is up, so the tab bar can step aside. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const height = () => vv?.height ?? window.innerHeight;
    let base = { w: window.innerWidth, h: height() };
    const check = () => {
      const w = window.innerWidth;
      const h = height();
      if (Math.abs(w - base.w) > 40) {
        base = { w, h }; // rotated
        setOpen(false);
        return;
      }
      if (h > base.h) base.h = h;
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((el as HTMLInputElement).type)));
      setOpen(typing && base.h - h > 150);
    };
    const target: EventTarget = vv ?? window;
    target.addEventListener('resize', check);
    document.addEventListener('focusout', check);
    return () => {
      target.removeEventListener('resize', check);
      document.removeEventListener('focusout', check);
    };
  }, []);
  return open;
}
