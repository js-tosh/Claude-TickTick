import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type View =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'all' }
  | { kind: 'completed' }
  | { kind: 'list'; listId: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'search'; query: string };

export type SortBy = 'manual' | 'dueDate' | 'priority' | 'title';
export type Theme = 'system' | 'light' | 'dark';

export type Dialog =
  | { kind: 'folder'; folderId?: string }
  | { kind: 'list'; listId?: string; folderId?: string | null }
  | { kind: 'tag'; tag: string }
  | { kind: 'settings' }
  | { kind: 'confirm'; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void> }
  | null;

interface UIState {
  view: View;
  setView: (v: View) => void;
  selectedTaskId: string | null;
  selectTask: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  showCompleted: boolean;
  setShowCompleted: (v: boolean) => void;
  dialog: Dialog;
  openDialog: (d: Dialog) => void;
  closeDialog: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<UIState | null>(null);

const LS = {
  theme: 'tt.theme',
  sortBy: 'tt.sortBy',
  showCompleted: 'tt.showCompleted',
  view: 'tt.view',
};

function readLS<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: ignore */
  }
}

const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'light' || v === 'dark';
const isSort = (v: unknown): v is SortBy => v === 'manual' || v === 'dueDate' || v === 'priority' || v === 'title';
const isView = (v: unknown): v is View =>
  !!v && typeof v === 'object' && typeof (v as View).kind === 'string' && (v as View).kind !== 'search';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<View>(() => readLS(LS.view, { kind: 'inbox' } as View, isView));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => readLS(LS.theme, 'system' as Theme, isTheme));
  const [sortBy, setSortByState] = useState<SortBy>(() => readLS(LS.sortBy, 'manual' as SortBy, isSort));
  const [showCompleted, setShowCompletedState] = useState<boolean>(() => readLS(LS.showCompleted, true));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => applyTheme(theme), [theme]);

  const setView = useCallback((v: View) => {
    setViewState(v);
    setSelectedTaskId(null);
    setSidebarOpen(false);
    if (v.kind !== 'search') writeLS(LS.view, v);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    writeLS(LS.theme, t);
  }, []);

  const setSortBy = useCallback((s: SortBy) => {
    setSortByState(s);
    writeLS(LS.sortBy, s);
  }, []);

  const setShowCompleted = useCallback((v: boolean) => {
    setShowCompletedState(v);
    writeLS(LS.showCompleted, v);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const value = useMemo<UIState>(
    () => ({
      view,
      setView,
      selectedTaskId,
      selectTask: setSelectedTaskId,
      sidebarOpen,
      setSidebarOpen,
      theme,
      setTheme,
      sortBy,
      setSortBy,
      showCompleted,
      setShowCompleted,
      dialog,
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
      toast,
      showToast,
    }),
    [view, setView, selectedTaskId, sidebarOpen, theme, setTheme, sortBy, setSortBy, showCompleted, setShowCompleted, dialog, toast, showToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UIState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI must be used inside UIProvider');
  return v;
}
