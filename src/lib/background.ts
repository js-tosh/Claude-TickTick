/**
 * Whether Android lets the app's reminders ring while it is closed. On many
 * phones battery optimisation (or a maker's own "sleeping apps" list) holds
 * back or drops the alarms of an app that isn't open, so reminders are missed.
 * Allowing the app to run unrestricted in the background fixes that.
 */
import { useEffect, useState } from 'react';
import { FocusAlarm } from './focusAlarmPlugin';
import { isNative } from './platform';

export interface BackgroundStatus {
  unrestricted: boolean;
  exactAlarms: boolean;
}

const ASKED_KEY = 'tt.askedUnrestricted';

export async function backgroundStatus(): Promise<BackgroundStatus> {
  if (!isNative) return { unrestricted: true, exactAlarms: true };
  try {
    return await FocusAlarm.backgroundStatus();
  } catch {
    return { unrestricted: true, exactAlarms: true };
  }
}

/** Show Android's "let it run in the background" prompt. */
export async function requestUnrestricted(): Promise<void> {
  if (!isNative) return;
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
  await FocusAlarm.requestUnrestricted();
}

/**
 * The first time the user sets a reminder or starts a focus session, ask once
 * (if needed). After that, the notice in Settings and the task panel remains.
 */
let asking: Promise<void> | null = null;
export function askUnrestrictedOnce(): Promise<void> {
  if (!isNative) return Promise.resolve();
  asking ??= (async () => {
    try {
      if (localStorage.getItem(ASKED_KEY)) return;
    } catch {
      return;
    }
    const s = await backgroundStatus();
    if (!s.unrestricted) await requestUnrestricted().catch(() => undefined);
  })();
  return asking;
}

/** Live status, re-checked whenever the app comes back (e.g. from the settings screen). */
export function useBackgroundStatus(): BackgroundStatus | null {
  const [status, setStatus] = useState<BackgroundStatus | null>(isNative ? null : { unrestricted: true, exactAlarms: true });
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState === 'visible') void backgroundStatus().then((s) => alive && setStatus(s));
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return status;
}
