import type { Habit } from '../../db/types';

export function HabitAvatar({ habit, size = 36 }: { habit: Pick<Habit, 'icon' | 'color'>; size?: number }) {
  return (
    <span className="habit-avatar" style={{ background: habit.color, width: size, height: size, fontSize: Math.round(size * 0.56) }} aria-hidden="true">
      {habit.icon}
    </span>
  );
}

export type RingState = 'done' | 'partial' | 'empty' | 'off' | 'future';

const R = 10;
const C = 2 * Math.PI * R;

/**
 * A day's check-in state: filled with a check when done, an arc for partial
 * progress, an empty ring when due, and hatched when the habit isn't due.
 */
export function CheckRing({ state, progress = 0, size = 24 }: { state: RingState; progress?: number; size?: number }) {
  return (
    <svg className={`check-ring cr-${state}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {state === 'done' ? (
        <>
          <circle cx="12" cy="12" r="11" className="ring-fill" />
          <path d="M7.2 12.4l3.1 3.1 6.4-6.6" className="ring-check" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r={R} className="ring-bg" />
          {state === 'partial' && (
            <circle
              cx="12"
              cy="12"
              r={R}
              className="ring-progress"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.max(0.04, Math.min(1, progress)))}
              transform="rotate(-90 12 12)"
            />
          )}
          {state === 'off' && <path d="M6.5 17.5l11-11" className="ring-hatch" />}
        </>
      )}
    </svg>
  );
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
