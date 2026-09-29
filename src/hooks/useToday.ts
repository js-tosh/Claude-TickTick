import { useSyncExternalStore } from 'react';
import { todayKey } from '../lib/dates';

/**
 * Today's date key, updated at midnight and whenever the app comes back to the
 * foreground, so views left open overnight roll over to the new day.
 */
let current = todayKey();
const listeners = new Set<() => void>();

function check() {
  const next = todayKey();
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

function msToMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 1, 0);
  return next.getTime() - now.getTime();
}

if (typeof window !== 'undefined') {
  const schedule = () =>
    setTimeout(() => {
      check();
      schedule();
    }, msToMidnight());
  schedule();
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useToday(): string {
  return useSyncExternalStore(subscribe, () => current);
}
