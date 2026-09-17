import { addDays, format, nextDay, startOfDay, type Day } from 'date-fns';
import type { Priority } from '../db/types';
import { DATE_KEY } from './dates';

export interface ParsedQuickAdd {
  title: string;
  priority: Priority | null;
  tags: string[];
  dueDate: string | null;
}

const WEEKDAYS: Record<string, Day> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const PRIORITY_WORDS: Record<string, Priority> = {
  '1': 1, low: 1, l: 1,
  '2': 3, med: 3, medium: 3, m: 3,
  '3': 5, high: 5, h: 5,
};

/**
 * Parse TickTick-style shortcuts out of a quick-add string:
 *   "Pay rent tomorrow !high #home #money"
 *   "Call mom friday !2"
 *   "Dentist 2026-10-03"
 * Anything not recognised stays in the title.
 */
export function parseQuickAdd(raw: string, now: Date = new Date()): ParsedQuickAdd {
  const tokens = raw.trim().split(/\s+/);
  const kept: string[] = [];
  let priority: Priority | null = null;
  const tags: string[] = [];
  let dueDate: string | null = null;
  const today = startOfDay(now);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const lower = tok.toLowerCase();

    // Priority: !high, !h, !3, !low ...
    if (lower.startsWith('!') && lower.length > 1) {
      const p = PRIORITY_WORDS[lower.slice(1)];
      if (p !== undefined) {
        priority = p;
        continue;
      }
    }

    // Tag: #home
    if (tok.startsWith('#') && tok.length > 1) {
      tags.push(tok.slice(1));
      continue;
    }

    // Dates (only the first one found is used).
    if (dueDate === null) {
      if (lower === 'today' || lower === 'tod') {
        dueDate = format(today, DATE_KEY);
        continue;
      }
      if (lower === 'tomorrow' || lower === 'tmr' || lower === 'tom') {
        dueDate = format(addDays(today, 1), DATE_KEY);
        continue;
      }
      if (lower === 'next' && i + 1 < tokens.length) {
        const nxt = tokens[i + 1].toLowerCase();
        if (nxt === 'week') {
          dueDate = format(addDays(today, 7), DATE_KEY);
          i++;
          continue;
        }
        if (nxt in WEEKDAYS) {
          dueDate = format(nextDay(today, WEEKDAYS[nxt]), DATE_KEY);
          i++;
          continue;
        }
      }
      if (lower in WEEKDAYS) {
        dueDate = format(nextDay(today, WEEKDAYS[lower]), DATE_KEY);
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) {
        dueDate = tok;
        continue;
      }
    }

    kept.push(tok);
  }

  return { title: kept.join(' ').trim(), priority, tags, dueDate };
}
