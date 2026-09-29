import { startOfDay } from 'date-fns';
import type { FocusSession } from '../db/types';

export interface ActivityStats {
  name: string;
  focusMs: number;
  sessions: number;
  /** Average of rated sessions, null if none were rated. */
  avgRating: number | null;
  lastAt: number;
}

export interface FocusStats {
  todayMs: number;
  todaySessions: number;
  weekMs: number;
  avgRating: number | null;
  ratedSessions: number;
  activities: ActivityStats[];
}

const DAY = 86_400_000;

/** Totals for the Focus tab. "This week" is today and the six days before it. */
export function computeFocusStats(sessions: FocusSession[], now: Date): FocusStats {
  const todayStart = startOfDay(now).getTime();
  const weekStart = todayStart - 6 * DAY;
  let todayMs = 0;
  let todaySessions = 0;
  let weekMs = 0;
  let ratingSum = 0;
  let rated = 0;
  const acts = new Map<string, ActivityStats & { ratingSum: number; rated: number }>();
  for (const s of sessions) {
    if (s.startedAt >= todayStart) {
      todayMs += s.focusMs;
      todaySessions++;
    }
    if (s.startedAt >= weekStart) weekMs += s.focusMs;
    if (s.rating) {
      ratingSum += s.rating;
      rated++;
    }
    const key = s.activity.trim().toLowerCase();
    const a = acts.get(key) ?? { name: s.activity.trim(), focusMs: 0, sessions: 0, avgRating: null, lastAt: 0, ratingSum: 0, rated: 0 };
    a.focusMs += s.focusMs;
    a.sessions++;
    if (s.rating) {
      a.ratingSum += s.rating;
      a.rated++;
    }
    if (s.startedAt > a.lastAt) {
      a.lastAt = s.startedAt;
      a.name = s.activity.trim();
    }
    acts.set(key, a);
  }
  const activities = [...acts.values()]
    .map(({ ratingSum: sum, rated: n, ...rest }) => ({ ...rest, avgRating: n ? sum / n : null }))
    .sort((a, b) => b.focusMs - a.focusMs);
  return { todayMs, todaySessions, weekMs, avgRating: rated ? ratingSum / rated : null, ratedSessions: rated, activities };
}

/** Distinct activity names, most recently used first. */
export function recentActivities(sessions: FocusSession[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...sessions].sort((a, b) => b.startedAt - a.startedAt)) {
    const key = s.activity.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.activity.trim());
    if (out.length >= limit) break;
  }
  return out;
}
