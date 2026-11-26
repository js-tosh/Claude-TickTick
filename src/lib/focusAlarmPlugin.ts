import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type RingtoneGroup = 'alarm' | 'notification' | 'ringtone';

export interface Ringtone {
  title: string;
  uri: string;
  group: RingtoneGroup;
}

/** JS side of android/app/src/main/java/com/family/tasks/FocusAlarmPlugin.java */
export interface FocusAlarmPlugin {
  listRingtones(): Promise<{ ringtones: Ringtone[] }>;
  preview(options: { uri: string | null }): Promise<void>;
  stopPreview(): Promise<void>;
  ensureChannel(options: { id: string; name: string; description: string; soundUri: string | null }): Promise<void>;
  deleteChannel(options: { id: string }): Promise<void>;
  openChannelSettings(options: { id: string }): Promise<void>;
  /** Ring the showing focus alarm again at these times (ms since epoch). Replaces earlier ones. */
  scheduleRings(options: { at: number[] }): Promise<void>;
  cancelRings(): Promise<void>;
  /** unrestricted: Android won't hold back alarms to save battery while the app is closed. */
  backgroundStatus(): Promise<{ unrestricted: boolean; exactAlarms: boolean }>;
  requestUnrestricted(): Promise<void>;
  openAppSettings(): Promise<void>;
  /**
   * Re-post each notification a second after it appears with buttons that work
   * without opening the app (on a watch or the lock screen). Replaces the group's earlier set.
   */
  setButtonFixes(options: { group: ButtonFixGroup; items: ButtonFix[] }): Promise<void>;
  /** The focus phases after the showing alarm, so "Start break" on the watch can schedule the next alarm. */
  setFocusPlan(options: { plan: FocusPlan | null }): Promise<void>;
  /** The "timer running" notification (Pause / Resume / End); null removes it. */
  setFocusStatus(options: { status: FocusStatus | null; plan?: FocusPlan }): Promise<void>;
  /** Changes made from notification buttons since last asked; the list is emptied. */
  takeQueuedActions(): Promise<{ actions: QueuedAction[] }>;
  cancelTaskSnooze(options: { taskId: string }): Promise<void>;
  addListener(event: 'queuedActions', fn: () => void): Promise<PluginListenerHandle>;
}

export type ButtonFixGroup = 'task' | 'habit' | 'focus' | 'snooze';

export interface ButtonFix {
  id: number;
  /** When the notification appears (ms since epoch). */
  at: number;
  /** open: the button opens the app instead of working in the background. */
  actions: { id: string; title: string; open?: boolean }[];
  extra: Record<string, unknown>;
}

export interface FocusPlan {
  timerId: string;
  activity: string;
  channelId: string;
  /** The phases after the one that is running, in order. */
  phases: { kind: 'focus' | 'break'; ms: number }[];
}

export interface FocusStatus {
  timerId: string;
  activity: string;
  /** When the session started. */
  startedAt: number;
  phase: 'focus' | 'break';
  state: 'running' | 'paused' | 'waiting';
  /** Running: when the phase ends. */
  endsAt?: number;
  /** Paused: time left in the phase. */
  remainingMs?: number;
  /** What follows the running phase (null: the session ends). */
  to: 'focus' | 'break' | null;
  /** Waiting: the phase waiting to be started. */
  waitingFor?: 'focus' | 'break';
}

/** A notification button pressed while the app may not have been running. */
export interface QueuedAction {
  at: number;
  kind: 'task' | 'habit' | 'focus';
  actionId: string;
  taskId?: string;
  habitId?: string;
  date?: string;
  timerId?: string;
}

const webStub: FocusAlarmPlugin = {
  listRingtones: async () => ({ ringtones: [] }),
  preview: async () => undefined,
  stopPreview: async () => undefined,
  ensureChannel: async () => undefined,
  deleteChannel: async () => undefined,
  openChannelSettings: async () => undefined,
  scheduleRings: async () => undefined,
  cancelRings: async () => undefined,
  backgroundStatus: async () => ({ unrestricted: true, exactAlarms: true }),
  requestUnrestricted: async () => undefined,
  openAppSettings: async () => undefined,
  setButtonFixes: async () => undefined,
  setFocusPlan: async () => undefined,
  setFocusStatus: async () => undefined,
  takeQueuedActions: async () => ({ actions: [] }),
  cancelTaskSnooze: async () => undefined,
  addListener: async () => ({ remove: async () => undefined }),
};

export const FocusAlarm = registerPlugin<FocusAlarmPlugin>('FocusAlarm', { web: () => Promise.resolve(webStub) });
