import { useSyncExternalStore } from 'react';
import { FOCUS_MIN, FOCUS_MIN_OPTIONS, type FocusMinutes } from '../lib/pomodoro';

/** A ringtone picked from the phone; null = the app's bundled chime. */
export interface AlarmSound {
  title: string;
  uri: string;
}

export interface Settings {
  focusMin: FocusMinutes;
  alarmSound: AlarmSound | null;
}

const KEY = 'tt.settings';
const defaults: Settings = { focusMin: FOCUS_MIN, alarmSound: null };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const v = JSON.parse(raw) as Partial<Settings>;
    const focusMin = (FOCUS_MIN_OPTIONS as readonly number[]).includes(v.focusMin ?? 0) ? (v.focusMin as FocusMinutes) : FOCUS_MIN;
    const alarmSound =
      v.alarmSound && typeof v.alarmSound.uri === 'string' && typeof v.alarmSound.title === 'string' ? v.alarmSound : null;
    return { focusMin, alarmSound };
  } catch {
    return defaults;
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}
