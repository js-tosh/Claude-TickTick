import { format, isSameDay } from 'date-fns';
import type { FocusSession, Habit } from '../../db/types';
import { BREAK_MIN, formatDuration, formatMinutes } from '../../lib/pomodoro';
import { StarIcon } from '../Icons';
import { Modal } from '../Modal';

interface Props {
  session: FocusSession;
  habit?: Habit;
  onClose: () => void;
  onRate: () => void;
}

/** A finished session from the History list: focus and break totals and how the breaks went. */
export function SessionDetail({ session: s, habit, onClose, onRate }: Props) {
  const tracked = typeof s.breaksOnTime === 'number';
  const onTime = s.breaksOnTime ?? 0;
  const over = s.breaksOver ?? 0;
  const skipped = s.breaksSkipped ?? 0;
  const span = isSameDay(s.startedAt, s.endedAt)
    ? `${format(s.startedAt, 'EEE, MMM d · h:mm a')} – ${format(s.endedAt, 'h:mm a')}`
    : `${format(s.startedAt, 'EEE, MMM d h:mm a')} – ${format(s.endedAt, 'EEE, MMM d h:mm a')}`;

  return (
    <Modal
      title="Session details"
      onClose={onClose}
      className="session-detail"
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="session-detail-head">
        <strong className="session-detail-title">
          {habit ? `${habit.icon} ` : ''}
          {s.activity}
        </strong>
        <span className="muted small">{span}</span>
        <span className="muted small">
          {s.mode === 'scheduled' && s.plannedMinutes ? `Scheduled session of ${formatMinutes(s.plannedMinutes)}` : 'Focus session'}
          {habit ? ` · checked in ${habit.name}` : ''}
        </span>
      </div>

      <div className="session-detail-rating">
        {s.rating ? (
          <span className="stars" aria-label={`Rated ${s.rating} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <StarIcon key={n} size={18} filled={n <= (s.rating ?? 0)} />
            ))}
          </span>
        ) : (
          <span className="muted small">Not rated</span>
        )}
        <button type="button" className="btn small" onClick={onRate}>
          {s.rating ? 'Change rating' : 'Rate'}
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total focus time</span>
          <span className="stat-value">{formatDuration(s.focusMs)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total break time</span>
          <span className="stat-value">{formatDuration(s.breakMs)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Full focus blocks</span>
          <span className="stat-value">{s.pomodoros}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Start to finish</span>
          <span className="stat-value">{formatDuration(Math.max(0, s.endedAt - s.startedAt))}</span>
        </div>
      </div>

      <h3 className="session-detail-sub">Breaks</h3>
      {tracked ? (
        <ul className="break-list">
          <li>
            <span className="break-dot on-time" aria-hidden="true" />
            <span className="break-label">Done in the {BREAK_MIN} minutes</span>
            <span className="break-count">{onTime}</span>
          </li>
          <li>
            <span className="break-dot over" aria-hidden="true" />
            <span className="break-label">
              Went over {BREAK_MIN} minutes
              {over > 0 && <span className="muted small"> · {formatDuration(s.breakOverMs ?? 0)} over in total</span>}
            </span>
            <span className="break-count">{over}</span>
          </li>
          <li>
            <span className="break-dot skipped" aria-hidden="true" />
            <span className="break-label">Skipped</span>
            <span className="break-count">{skipped}</span>
          </li>
        </ul>
      ) : (
        <p className="muted small">Break details are recorded for sessions from this version on.</p>
      )}
      {tracked && <p className="muted small">A break counts as on time when the next focus block starts within a minute of the break alarm.</p>}
    </Modal>
  );
}
