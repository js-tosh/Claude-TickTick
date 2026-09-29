import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../db/types';
import { computeFocusStats, recentActivities } from './focusStats';

const NOW = new Date(2026, 8, 28, 18, 0, 0);
const MIN = 60_000;
let n = 0;
const s = (p: Partial<FocusSession>): FocusSession => ({
  id: `s${++n}`,
  activity: 'Math',
  mode: 'endless',
  plannedMinutes: null,
  startedAt: NOW.getTime() - MIN,
  endedAt: NOW.getTime(),
  focusMs: 25 * MIN,
  breakMs: 5 * MIN,
  pomodoros: 1,
  rating: null,
  updatedAt: 0,
  ...p,
});

describe('computeFocusStats', () => {
  const sessions = [
    s({ rating: 4 }),
    s({ activity: 'math ', rating: 2, focusMs: 50 * MIN }),
    s({ activity: 'Reading', startedAt: new Date(2026, 8, 25, 9).getTime(), focusMs: 30 * MIN, rating: 5 }),
    s({ activity: 'Old', startedAt: new Date(2026, 8, 1, 9).getTime(), focusMs: 90 * MIN }),
  ];
  const st = computeFocusStats(sessions, NOW);

  it('totals today and the last 7 days', () => {
    expect(st.todayMs).toBe(75 * MIN);
    expect(st.todaySessions).toBe(2);
    expect(st.weekMs).toBe(105 * MIN);
  });

  it('averages ratings overall and per activity, grouping names case-insensitively', () => {
    expect(st.avgRating).toBeCloseTo(11 / 3);
    expect(st.ratedSessions).toBe(3);
    const math = st.activities.find((a) => a.name.toLowerCase() === 'math');
    expect(math).toMatchObject({ sessions: 2, focusMs: 75 * MIN, avgRating: 3 });
    expect(st.activities[0].name).toBe('Old'); // most focus time first
    expect(st.activities.find((a) => a.name === 'Old')?.avgRating).toBeNull();
  });

  it('lists recent activities without duplicates', () => {
    expect(recentActivities(sessions)).toEqual(['Math', 'Reading', 'Old']);
  });
});
