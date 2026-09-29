import type { ComponentType } from 'react';
import { formatClock, phaseAt, phaseRemaining } from '../lib/pomodoro';
import { useFocusTimer } from '../state/focusTimer';
import { useUI, type Tab } from '../state/ui';
import { CalendarTabIcon, HabitTabIcon, MatrixTabIcon, TasksTabIcon, TimerIcon } from './Icons';

const TABS: { id: Tab; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'tasks', label: 'Tasks', Icon: TasksTabIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarTabIcon },
  { id: 'matrix', label: 'Matrix', Icon: MatrixTabIcon },
  { id: 'focus', label: 'Focus', Icon: TimerIcon },
  { id: 'habits', label: 'Habits', Icon: HabitTabIcon },
];

export function TabBar() {
  const { tab, setTab } = useUI();
  const { timer, now } = useFocusTimer();
  const phase = timer ? phaseAt(timer, timer.phaseIndex) : null;

  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ id, label, Icon }) => {
        const live = id === 'focus' && timer && phase;
        return (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? ' active' : ''}${live ? ` live ${phase.kind}` : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            aria-label={live ? `Focus, ${phase.kind} running` : label}
            onClick={() => setTab(id)}
          >
            <Icon size={22} />
            <span className="tab-label">{live ? (timer.awaitingConfirm ? 'Waiting' : formatClock(phaseRemaining(timer, now))) : label}</span>
          </button>
        );
      })}
    </nav>
  );
}
