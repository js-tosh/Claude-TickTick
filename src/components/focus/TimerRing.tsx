import type { ReactNode } from 'react';

interface Props {
  /** 0‥1 of the current phase elapsed. */
  progress: number;
  phase: 'focus' | 'break';
  paused: boolean;
  children: ReactNode;
}

const R = 110;
const C = 2 * Math.PI * R;

export function TimerRing({ progress, phase, paused, children }: Props) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className={`timer-ring ${phase}${paused ? ' paused' : ''}`}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="ring-track" cx="120" cy="120" r={R} />
        <circle
          className="ring-arc"
          cx="120"
          cy="120"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
          transform="rotate(-90 120 120)"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
