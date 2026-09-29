import { addDays, format, nextDay, startOfDay, type Day } from 'date-fns';
import type { Priority } from '../db/types';
import { DATE_KEY } from './dates';

export interface ParsedQuickAdd {
  title: string;
  priority: Priority | null;
  tags: string[];
  dueDate: string | null;
  /** "12:10", "3pm", "at 9:30am" → 'HH:mm' */
  dueTime: string | null;
  /** "@Work" → "Work": the list (or folder) the task should go to. */
  listRef: string | null;
}

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i;

/** "3pm" → "15:00", "9:30am" → "09:30", "12:10" → "12:10"; null if not a time. */
export function parseTimeToken(tok: string): string | null {
  const m = TIME_RE.exec(tok);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (!ampm && !m[2]) return null; // a bare number is not a time
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
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
 *   "Close ticket @Work"   (list or folder named Work)
 * Anything not recognised stays in the title.
 */
export function parseQuickAdd(raw: string, now: Date = new Date()): ParsedQuickAdd {
  const tokens = raw.trim().split(/\s+/);
  const kept: string[] = [];
  let priority: Priority | null = null;
  const tags: string[] = [];
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  let listRef: string | null = null;
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

    // List or folder: @Work (only the first one counts)
    if (tok.startsWith('@') && tok.length > 1 && listRef === null) {
      listRef = tok.slice(1);
      continue;
    }

    // Times: "12:10", "3pm", "at 9:30am" (the word "at" before a time is dropped).
    if (dueTime === null) {
      const isAt = lower === 'at' && i + 1 < tokens.length;
      const t = parseTimeToken(isAt ? tokens[i + 1] : tok);
      if (t) {
        dueTime = t;
        if (isAt) i++;
        continue;
      }
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

  return { title: kept.join(' ').trim(), priority, tags, dueDate, dueTime, listRef };
}

/** Compare names loosely: "personal-projects" matches "Personal Projects". */
export function namesMatch(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return norm(a) === norm(b);
}

/**
 * Turn "@Work" into a list id: a list named Work first, otherwise the first
 * list inside a folder named Work. null when nothing matches.
 */
export function resolveListRef(
  ref: string,
  lists: { id: string; name: string; folderId: string | null; sortOrder: number }[],
  folders: { id: string; name: string }[],
): string | null {
  const list = lists.find((l) => namesMatch(l.name, ref));
  if (list) return list.id;
  const folder = folders.find((f) => namesMatch(f.name, ref));
  if (!folder) return null;
  const inside = lists.filter((l) => l.folderId === folder.id).sort((a, b) => a.sortOrder - b.sortOrder);
  return inside[0]?.id ?? null;
}
