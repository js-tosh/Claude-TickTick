import { describe, expect, it } from 'vitest';
import { FOCUS_REPEAT_MIN, FOCUS_RINGS, focusRingTimes } from './notifications';

describe('focusRingTimes', () => {
  it('rings each alarm 3 times, 20 s apart, every time it repeats', () => {
    const at = 1_000_000;
    const t = focusRingTimes(at);
    expect(FOCUS_RINGS).toBe(3);
    // The alarm's own ring at `at` is the first; these are the 2nd and 3rd.
    expect(t.slice(0, 4)).toEqual([at + 20_000, at + 40_000, at + FOCUS_REPEAT_MIN * 60_000 + 20_000, at + FOCUS_REPEAT_MIN * 60_000 + 40_000]);
    expect(t.length).toBe(12 * (FOCUS_RINGS - 1));
    // All fit in the native receiver's 64 slots.
    expect(t.length).toBeLessThanOrEqual(64);
  });
});
