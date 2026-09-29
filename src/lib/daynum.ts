/**
 * Fast calendar-day arithmetic on 'YYYY-MM-DD' keys.
 *
 * Keys are converted to an integer day number (days since 1970-01-01, computed
 * in UTC so daylight-saving changes can never shift a day). This is far cheaper
 * than date-fns parsing/formatting and is used in hot loops (streaks, grids).
 */
const DAY_MS = 86_400_000;

export function keyToDay(key: string): number {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayToKey(n: number): string {
  const dt = new Date(n * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

/** Sunday = 0 … Saturday = 6. 1970-01-01 was a Thursday. */
export function weekdayOfDay(n: number): number {
  return ((((n % 7) + 7) % 7) + 4) % 7;
}

export function weekdayOfKey(key: string): number {
  return weekdayOfDay(keyToDay(key));
}

export function shiftKey(key: string, days: number): string {
  return dayToKey(keyToDay(key) + days);
}

/** a − b in whole days. */
export function diffDays(a: string, b: string): number {
  return keyToDay(a) - keyToDay(b);
}

/** 'YYYY-MM' of a key. */
export function monthOf(key: string): string {
  return key.slice(0, 7);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
