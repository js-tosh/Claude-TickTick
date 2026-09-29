import { dayToKey, keyToDay, weekdayOfDay } from './daynum';

/** Sunday-first, like the habit calendar in the reference design. */
export const WEEK_STARTS_ON = 0;

/** 42 day keys (6 weeks) covering the month, starting on the week-start day. */
export function monthGrid(year: number, month0: number, weekStartsOn = WEEK_STARTS_ON): string[] {
  const first = Math.round(Date.UTC(year, month0, 1) / 86_400_000);
  const offset = (weekdayOfDay(first) - weekStartsOn + 7) % 7;
  const start = first - offset;
  return Array.from({ length: 42 }, (_, i) => dayToKey(start + i));
}

/** The 7 day keys of the week containing `key`. */
export function weekKeys(key: string, weekStartsOn = WEEK_STARTS_ON): string[] {
  const n = keyToDay(key);
  const start = n - ((weekdayOfDay(n) - weekStartsOn + 7) % 7);
  return Array.from({ length: 7 }, (_, i) => dayToKey(start + i));
}

/** The last `count` days ending with `key` (oldest first). */
export function lastDays(key: string, count: number): string[] {
  const n = keyToDay(key);
  return Array.from({ length: count }, (_, i) => dayToKey(n - (count - 1 - i)));
}

export function addMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const t = year * 12 + month0 + delta;
  return { year: Math.floor(t / 12), month0: ((t % 12) + 12) % 12 };
}

export function keyParts(key: string): { year: number; month0: number; day: number } {
  return { year: Number(key.slice(0, 4)), month0: Number(key.slice(5, 7)) - 1, day: Number(key.slice(8, 10)) };
}
