import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { rateFocusSession } from '../../db/focus';
import type { FocusSession } from '../../db/types';
import { formatDuration } from '../../lib/pomodoro';
import { clearPendingRating, useFocusSnapshot } from '../../state/focusTimer';
import { useUI } from '../../state/ui';
import { Modal } from '../Modal';

const LABELS: Record<number, string> = { 1: 'Not useful', 2: 'A little', 3: 'Okay', 4: 'Useful', 5: 'Very useful' };

/** Shown whenever a session has ended (or when re-rating one from history). */
export function FocusRatingDialog() {
  const { pendingRatingId } = useFocusSnapshot();
  const session = useLiveQuery(() => (pendingRatingId ? db.focusSessions.get(pendingRatingId) : undefined), [pendingRatingId]);
  if (!pendingRatingId || !session) return null;
  return <RatingForm key={session.id} session={session} />;
}

function RatingForm({ session }: { session: FocusSession }) {
  const [rating, setRating] = useState<number | null>(session.rating);
  const habit = useLiveQuery(() => (session.habitId ? db.habits.get(session.habitId) : undefined), [session.habitId]);
  const { showToast } = useUI();

  const save = async () => {
    if (rating === null) return;
    await rateFocusSession(session.id, rating);
    clearPendingRating();
    showToast(`Rated ${rating} of 5`);
  };

  return (
    <Modal
      title="How useful was this session?"
      onClose={clearPendingRating}
      className="rating-modal"
      footer={
        <>
          <button type="button" className="btn" onClick={clearPendingRating}>
            Skip
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={rating === null}>
            Save rating
          </button>
        </>
      }
    >
      <p className="rating-summary">
        <strong>{session.activity}</strong>
        <span className="muted">
          {formatDuration(session.focusMs)} of focus · {session.pomodoros} full block{session.pomodoros === 1 ? '' : 's'}
        </span>
        {habit && (
          <span className="habit-link-badge">
            {habit.icon} {habit.name} checked in for today
          </span>
        )}
      </p>
      <div className="rating-row" role="radiogroup" aria-label="Rating from 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}: ${LABELS[n]}`}
            className={`rating-btn${rating === n ? ' on' : ''}`}
            onClick={() => setRating(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="rating-scale muted small" aria-hidden="true">
        <span>Not useful</span>
        <span>Very useful</span>
      </div>
      {rating !== null && <p className="rating-picked">{LABELS[rating]}</p>}
    </Modal>
  );
}
