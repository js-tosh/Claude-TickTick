import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local text state for an input that saves itself: shortly after typing stops,
 * on blur (call flush), and when the component unmounts — so closing the task
 * panel with the Android back button or Escape never drops an edit.
 */
export function useDraft(initial: string, commit: (value: string) => void, delayMs = 600) {
  const [value, setValue] = useState(initial);
  const latest = useRef(value);
  latest.current = value;
  const saved = useRef(initial);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const flush = useCallback(() => {
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    commitRef.current(latest.current);
  }, []);

  /** Replace the draft without saving (e.g. revert an invalid edit). */
  const reset = useCallback((v: string) => {
    saved.current = v;
    latest.current = v;
    setValue(v);
  }, []);

  useEffect(() => {
    if (value === saved.current) return;
    const t = setTimeout(flush, delayMs);
    return () => clearTimeout(t);
  }, [value, flush, delayMs]);

  useEffect(() => () => flush(), [flush]);

  return { value, setValue, flush, reset };
}
