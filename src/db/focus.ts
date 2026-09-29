import { db } from './db';
import type { FocusSession } from './types';

export async function saveFocusSession(session: FocusSession): Promise<void> {
  await db.focusSessions.put(session);
}

export async function rateFocusSession(id: string, rating: number | null): Promise<void> {
  const clean = rating === null ? null : Math.min(5, Math.max(1, Math.round(rating)));
  await db.focusSessions.update(id, { rating: clean, updatedAt: Date.now() });
}

export async function deleteFocusSession(id: string): Promise<void> {
  await db.focusSessions.delete(id);
}
