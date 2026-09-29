import { useState } from 'react';
import { format } from 'date-fns';
import { buildScheduledPlan, formatMinutes, SCHEDULE_MAX_STEPS, SCHEDULE_STEP_MIN } from '../../lib/pomodoro';
import { MinusIcon, PlusIcon } from '../Icons';
import { Modal } from '../Modal';

interface Props {
  initialActivity: string;
  onClose: () => void;
  onStart: (minutes: number, activity: string) => void;
}

export function ScheduleDialog({ initialActivity, onClose, onStart }: Props) {
  const [steps, setSteps] = useState(2);
  const [activity, setActivity] = useState(initialActivity);
  const minutes = steps * SCHEDULE_STEP_MIN;
  const plan = buildScheduledPlan(minutes);
  const blocks = plan.filter((p) => p.kind === 'focus').length;
  const breaks = plan.length - blocks;
  const endsAt = format(new Date(Date.now() + minutes * 60_000), 'h:mm a');

  return (
    <Modal
      title="Schedule session"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={() => onStart(minutes, activity)}>
            Start {formatMinutes(minutes)}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Activity</span>
        <input id="schedule-activity" type="text" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. Math homework" maxLength={80} />
      </label>
      <div className="field">
        <span className="field-label">Length</span>
        <div className="stepper" role="group" aria-label="Session length">
          <button type="button" className="icon-btn" onClick={() => setSteps((s) => s - 1)} disabled={steps <= 1} aria-label="45 minutes less">
            <MinusIcon />
          </button>
          <output className="stepper-value" aria-live="polite">
            {formatMinutes(minutes)}
          </output>
          <button type="button" className="icon-btn" onClick={() => setSteps((s) => s + 1)} disabled={steps >= SCHEDULE_MAX_STEPS} aria-label="45 minutes more">
            <PlusIcon />
          </button>
        </div>
        <span className="muted small">Changes in 45-minute steps.</span>
      </div>
      <div className="plan-bar" aria-hidden="true">
        {plan.map((p, i) => (
          <span key={i} className={`plan-seg ${p.kind}`} style={{ flexGrow: p.ms }} />
        ))}
      </div>
      <p className="muted small">
        {blocks} focus block{blocks === 1 ? '' : 's'} and {breaks} break{breaks === 1 ? '' : 's'}. The alarm rings at each change, and the
        session ends around {endsAt}.
      </p>
    </Modal>
  );
}
