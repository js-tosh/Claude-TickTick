import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  isSameYear,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';
import type { Repeat } from '../db/types';

export const DATE_KEY = 'yyyy-MM-dd';

/** Today's local date as 'YYYY-MM-DD'. */
export function todayKey(now: Date = new Date()): string {
  return format(now, DATE_KEY);
}

export function dateKey(d: Date): string {
  return format(d, DATE_KEY);
}

export function addDaysKey(key: string, days: number): string {
  return dateKey(addDays(parseKey(key), days));
}

/** Parse 'YYYY-MM-DD' as a local date. */
export function parseKey(key: string): Date {
  return startOfDay(parseISO(key));
}

export function isValidKey(key: string | null | undefined): key is string {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return isValid(parseISO(key));
}

/** Combine a date key and optional 'HH:mm' into a local Date. */
export function toDateTime(key: string, time: string | null): Date {
  const d = parseKey(key);
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export type Relative = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export function relativeBucket(key: string, now: Date = new Date()): Relative {
  const diff = differenceInCalendarDays(parseKey(key), now);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

/** Human label: 'Today', 'Tomorrow', 'Yesterday', 'Mon, Sep 21', 'Sep 21, 2027'. */
export function formatDueLabel(key: string, time: string | null, now: Date = new Date()): string {
  const d = parseKey(key);
  const diff = differenceInCalendarDays(d, now);
  let label: string;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff > 1 && diff < 7) label = format(d, 'EEEE');
  else if (isSameYear(d, now)) label = format(d, 'EEE, MMM d');
  else label = format(d, 'MMM d, yyyy');
  if (time) label += ` ${formatTime(time)}`;
  return label;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, 'h:mm a');
}

/** Section heading for a date-grouped view. */
export function formatDayHeading(key: string, now: Date = new Date()): string {
  const d = parseKey(key);
  const diff = differenceInCalendarDays(d, now);
  const base = format(d, 'EEEE, MMM d');
  if (diff === 0) return `Today · ${base}`;
  if (diff === 1) return `Tomorrow · ${base}`;
  return base;
}

/** Next occurrence for a repeating task, based on the previous due date. */
export function nextOccurrence(key: string, repeat: Repeat, now: Date = new Date()): string | null {
  if (repeat === 'none') return null;
  let d = parseKey(key);
  const today = startOfDay(now);
  // Advance at least once, and keep advancing until the date is in the future
  // (so completing a long-overdue daily task doesn't create another overdue one).
  for (let i = 0; i < 1000; i++) {
    d = step(d, repeat);
    if (d > today || (repeat === 'weekdays' && d >= today && i > 0)) break;
  }
  return dateKey(d);
}

function step(d: Date, repeat: Repeat): Date {
  switch (repeat) {
    case 'daily':
      return addDays(d, 1);
    case 'weekdays': {
      let n = addDays(d, 1);
      while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1);
      return n;
    }
    case 'weekly':
      return addWeeks(d, 1);
    case 'monthly':
      return addMonths(d, 1);
    case 'yearly':
      return addYears(d, 1);
    default:
      return d;
  }
}
