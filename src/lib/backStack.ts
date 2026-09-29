import { useEffect, useRef } from 'react';

/**
 * Android back button support. Anything that can be dismissed (a dialog, the
 * task detail, the drawer, the habit detail) registers a handler while it is
 * open; the back button runs the most recently registered one.
 */
type Entry = { run: () => void };
const stack: Entry[] = [];

export function runTopBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}

export function useBackHandler(active: boolean, handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { run: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
