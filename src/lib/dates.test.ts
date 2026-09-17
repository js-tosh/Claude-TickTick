import { describe, expect, it } from 'vitest';
import { formatDueLabel, nextOccurrence, relativeBucket } from './dates';

const NOW = new Date(2026, 8, 16, 10, 0, 0); // Wed Sep 16 2026

describe('relativeBucket', () => {
  it('classifies dates around today', () => {
    expect(relativeBucket('2026-09-15', NOW)).toBe('overdue');
    expect(relativeBucket('2026-09-16', NOW)).toBe('today');
    expect(relativeBucket('2026-09-17', NOW)).toBe('tomorrow');
    expect(relativeBucket('2026-09-20', NOW)).toBe('week');
    expect(relativeBucket('2026-10-20', NOW)).toBe('later');
  });
});

describe('formatDueLabel', () => {
  it('uses friendly words near today', () => {
    expect(formatDueLabel('2026-09-16', null, NOW)).toBe('Today');
    expect(formatDueLabel('2026-09-17', null, NOW)).toBe('Tomorrow');
    expect(formatDueLabel('2026-09-15', null, NOW)).toBe('Yesterday');
    expect(formatDueLabel('2026-09-19', null, NOW)).toBe('Saturday');
    expect(formatDueLabel('2026-10-19', null, NOW)).toBe('Mon, Oct 19');
    expect(formatDueLabel('2027-01-02', null, NOW)).toBe('Jan 2, 2027');
  });
  it('appends the time', () => {
    expect(formatDueLabel('2026-09-16', '14:30', NOW)).toBe('Today 2:30 PM');
  });
});

describe('nextOccurrence', () => {
  it('advances by the repeat interval', () => {
    expect(nextOccurrence('2026-09-16', 'daily', NOW)).toBe('2026-09-17');
    expect(nextOccurrence('2026-09-16', 'weekly', NOW)).toBe('2026-09-23');
    expect(nextOccurrence('2026-09-16', 'monthly', NOW)).toBe('2026-10-16');
    expect(nextOccurrence('2026-09-16', 'yearly', NOW)).toBe('2027-09-16');
    expect(nextOccurrence('2026-09-16', 'none', NOW)).toBeNull();
  });
  it('skips weekends for weekdays', () => {
    expect(nextOccurrence('2026-09-18', 'weekdays', NOW)).toBe('2026-09-21'); // Fri -> Mon
  });
  it('catches up an overdue repeating task to the future', () => {
    expect(nextOccurrence('2026-09-01', 'daily', NOW)).toBe('2026-09-17');
    expect(nextOccurrence('2026-08-05', 'weekly', NOW)).toBe('2026-09-23');
  });
});
