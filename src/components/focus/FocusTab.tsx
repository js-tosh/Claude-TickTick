import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { db } from '../../db/db';
import { deleteFocusSession } from '../../db/focus';
import { useSettings } from '../../state/settings';
import { FocusSettingsDialog } from './FocusSettingsDialog';
import { useToday } from '../../hooks/useToday';
import { computeFocusStats, recentActivities } from '../../lib/focusStats';
import { isNative } from '../../lib/platform';
import {
  BREAK_MIN,
  finishTotals,
  formatClock,
  formatDuration,
  formatMinutes,
  phaseAt,
  phaseRemaining,
  sessionRemaining,
} from '../../lib/pomodoro';
import {
  askRating,
  clearLastCheckedIn,
  confirmFocusPhase,
  pauseFocus,
  resumeFocus,
  skipFocusPhase,
  startFocus,
  stopFocus,
  useFocusTimer,
} from '../../state/focusTimer';
import { useUI } from '../../state/ui';
import { FOCUS_REPEAT_MIN } from '../../lib/notifications';
import { CalendarIcon, MoreIcon, PauseIcon, PlayIcon, SettingsIcon, SkipIcon, StarIcon, StopIcon } from '../Icons';
import { Menu } from '../Menu';
import { ScheduleDialog } from './ScheduleDialog';
import { TimerRing } from './TimerRing';

const MIN = 60_000;

function formatAgo(ms: number): string {
  const m = Math.floor(ms / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export function FocusTab() {
  const { timer, now, lastActivity, alarmsAsNotifications, lastCheckedIn } = useFocusTimer();
  const { focusMin } = useSettings();
  const sessions = useLiveQuery(() => db.focusSessions.orderBy('startedAt').reverse().toArray(), []);
  const habits = useLiveQuery(() => db.habits.orderBy('sortOrder').toArray(), []) ?? [];
  const linkedHabit = useLiveQuery(() => (timer?.habitId ? db.habits.get(timer.habitId) : undefined), [timer?.habitId]);
  const [activity, setActivity] = useState(lastActivity);
  const [habitId, setHabitId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { showToast, openDialog } = useUI();
  const today = useToday();

  // A session that ended (by End or on its own) may have checked a habit in.
  useEffect(() => {
    if (!lastCheckedIn) return;
    showToast(`${lastCheckedIn.icon} ${lastCheckedIn.name} checked in for today`);
    clearLastCheckedIn();
  }, [lastCheckedIn, showToast]);

  const phase = timer ? phaseAt(timer, timer.phaseIndex) : null;
  const remaining = timer ? phaseRemaining(timer, now) : focusMin * MIN;
  const progress = timer && phase ? 1 - remaining / phase.ms : 0;
  const paused = !!timer && timer.pausedAt !== null;
  const waiting = !!timer && timer.awaitingConfirm;
  const waitingFor = phase?.kind === 'break' ? 'break' : 'focus';
  const sessionLeft = timer ? sessionRemaining(timer, now) : null;
  const liveFocusMs = timer ? finishTotals(timer, now).focusMs : 0;

  const stats = useMemo(
    () => computeFocusStats(sessions ?? [], new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, today],
  );
  const recent = useMemo(() => recentActivities(sessions ?? []), [sessions]);

  const onStop = async () => {
    const r = await stopFocus();
    if (r === 'discarded') showToast('Sessions shorter than a minute are not saved');
  };

  const confirmDelete = (id: string, name: string) =>
    openDialog({
      kind: 'confirm',
      title: 'Delete this session?',
      message: `The "${name}" session will be removed from your focus history.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => deleteFocusSession(id),
    });

  const pickHabit = (h: { id: string; name: string }) => {
    if (habitId === h.id) {
      setHabitId(null);
      return;
    }
    setHabitId(h.id);
    setActivity(h.name);
  };
  const onActivityChange = (v: string) => {
    setActivity(v);
    const linked = habits.find((h) => h.id === habitId);
    if (linked && v.trim() !== linked.name) setHabitId(null);
  };

  let hint: string;
  if (!timer) hint = `Focus runs ${focusMin}-minute blocks with 5-minute breaks until you end it. Schedule session sets a total length.`;
  else if (waiting)
    hint = isNative
      ? `Nothing counts until you start it. The alarm repeats every ${FOCUS_REPEAT_MIN} minutes until you do.`
      : 'Nothing counts until you start it.';
  else if (!isNative) hint = 'Keep this page open. The alarm rings here at the end of each block.';
  else if (!alarmsAsNotifications) hint = 'Notifications are off, so alarms only ring while the app is open.';
  else hint = `The alarm rings when this ${phase?.kind === 'break' ? 'break' : 'block'} ends, even with the screen off, and waits for you.`;

  const phaseLabel = !timer
    ? 'Ready'
    : waiting
      ? waitingFor === 'break'
        ? 'Break ready'
        : 'Focus ready'
      : paused
        ? 'Paused'
        : phase?.kind === 'break'
          ? 'Break'
          : 'Focus';

  return (
    <div className="page focus-page">
      <header className="page-header">
        <h1>Focus</h1>
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Focus settings">
          <SettingsIcon />
        </button>
      </header>
      <div className="page-scroll">
        <section className="focus-hero" aria-label="Timer">
          {timer ? (
            <div className="focus-activity-label">
              <span className="muted small">{timer.mode === 'scheduled' ? `Scheduled · ${formatMinutes(timer.plannedMinutes ?? 0)}` : `Focusing on · ${timer.focusMin}/${BREAK_MIN}`}</span>
              <strong>{timer.activity}</strong>
              {linkedHabit && (
                <span className="habit-link-badge">
                  {linkedHabit.icon} {linkedHabit.name} is checked in when you end
                </span>
              )}
            </div>
          ) : (
            <div className="activity-field">
              <label htmlFor="focus-activity" className="field-label">
                What are you focusing on?
              </label>
              <input
                id="focus-activity"
                type="text"
                value={activity}
                onChange={(e) => onActivityChange(e.target.value)}
                placeholder="e.g. Math homework"
                maxLength={80}
                enterKeyHint="go"
                autoComplete="off"
              />
              {habits.length > 0 && (
                <div className="chip-row" aria-label="Habits">
                  {habits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className={`chip habit-chip${habitId === h.id ? ' on' : ''}`}
                      aria-pressed={habitId === h.id}
                      onClick={() => pickHabit(h)}
                      title="Checks this habit in when the session ends"
                    >
                      {h.icon} {h.name}
                    </button>
                  ))}
                </div>
              )}
              {recent.filter((a) => !habits.some((h) => h.name === a)).length > 0 && (
                <div className="chip-row">
                  {recent
                    .filter((a) => !habits.some((h) => h.name === a))
                    .map((a) => (
                      <button key={a} type="button" className={`chip${a === activity && !habitId ? ' on' : ''}`} onClick={() => onActivityChange(a)}>
                        {a}
                      </button>
                    ))}
                </div>
              )}
              {habitId && <p className="muted small habit-link-note">This session checks the habit in for today when you end it.</p>}
            </div>
          )}

          <TimerRing progress={progress} phase={phase?.kind ?? 'focus'} paused={paused} waiting={waiting}>
            <div className="ring-phase">{phaseLabel}</div>
            <div className="ring-time" role="timer" aria-live="off">
              {formatClock(remaining)}
            </div>
            {timer && waiting && timer.waitingSince !== null && (
              <div className="ring-sub waiting">
                {phase?.kind === 'break' ? 'Focus block' : 'Break'} ended {formatAgo(now - timer.waitingSince)}
              </div>
            )}
            {timer && !waiting && (
              <div className="ring-sub">
                {timer.mode === 'scheduled' && sessionLeft !== null
                  ? `${formatClock(sessionLeft)} left in session`
                  : `Round ${Math.floor(timer.phaseIndex / 2) + 1}`}
              </div>
            )}
          </TimerRing>

          <div className="focus-controls">
            {!timer && (
              <>
                <button type="button" className="btn primary big" onClick={() => startFocus({ activity, mode: 'endless', habitId })}>
                  <PlayIcon size={18} /> Focus {focusMin}
                </button>
                <button type="button" className="btn big" onClick={() => setScheduling(true)}>
                  <CalendarIcon size={18} /> Schedule session
                </button>
              </>
            )}
            {timer && waiting && (
              <>
                <button type="button" className="btn primary big" onClick={confirmFocusPhase}>
                  <PlayIcon size={18} /> {waitingFor === 'break' ? 'Start break' : 'Start focus'}
                </button>
                <button type="button" className="btn big danger" onClick={onStop}>
                  <StopIcon size={18} /> End
                </button>
              </>
            )}
            {timer && !paused && !waiting && (
              <>
                <button type="button" className="btn big" onClick={pauseFocus}>
                  <PauseIcon size={18} /> Pause
                </button>
                {timer.mode === 'endless' && (
                  <button type="button" className="btn big" onClick={skipFocusPhase}>
                    <SkipIcon size={18} /> {phase?.kind === 'break' ? 'Skip break' : 'Take break'}
                  </button>
                )}
                <button type="button" className="btn big danger" onClick={onStop}>
                  <StopIcon size={18} /> End
                </button>
              </>
            )}
            {timer && paused && !waiting && (
              <>
                <button type="button" className="btn primary big" onClick={resumeFocus}>
                  <PlayIcon size={18} /> Resume
                </button>
                <button type="button" className="btn big danger" onClick={onStop}>
                  <StopIcon size={18} /> End
                </button>
              </>
            )}
          </div>
          <p className="focus-hint muted small">{hint}</p>
        </section>

        <section className="card-section" aria-label="Focus totals">
          <div className="stat-grid three">
            <div className="stat-card">
              <span className="stat-label">Today</span>
              <span className="stat-value">{formatDuration(stats.todayMs + liveFocusMs)}</span>
              <span className="stat-note muted small">
                {stats.todaySessions} session{stats.todaySessions === 1 ? '' : 's'}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Last 7 days</span>
              <span className="stat-value">{formatDuration(stats.weekMs + liveFocusMs)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Avg. rating</span>
              <span className="stat-value">{stats.avgRating === null ? '–' : stats.avgRating.toFixed(1)}</span>
              <span className="stat-note muted small">of 5, {stats.ratedSessions} rated</span>
            </div>
          </div>
        </section>

        {stats.activities.length > 0 && (
          <section className="card-section">
            <h2 className="card-title">By activity</h2>
            <ul className="activity-list">
              {stats.activities.slice(0, 8).map((a) => (
                <li key={a.name.toLowerCase()}>
                  <span className="activity-name">{a.name}</span>
                  <span className="activity-meta muted small">
                    {a.sessions} session{a.sessions === 1 ? '' : 's'}
                    {a.avgRating !== null && ` · rated ${a.avgRating.toFixed(1)}`}
                  </span>
                  <span className="activity-time">{formatDuration(a.focusMs)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card-section">
          <h2 className="card-title">History</h2>
          {!sessions?.length ? (
            <p className="muted small">Finished sessions show up here with their rating.</p>
          ) : (
            <ul className="session-list">
              {sessions.slice(0, 30).map((s) => (
                <li key={s.id} className="session-item">
                  <div className="session-main">
                    <span className="session-title">
                      {s.habitId && habits.find((h) => h.id === s.habitId) ? `${habits.find((h) => h.id === s.habitId)!.icon} ` : ''}
                      {s.activity}
                    </span>
                    <span className="session-meta muted small">
                      {format(s.startedAt, 'EEE, MMM d · h:mm a')} · {formatDuration(s.focusMs)} focus
                      {s.mode === 'scheduled' && s.plannedMinutes ? ` · of ${formatMinutes(s.plannedMinutes)}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="session-rating"
                    onClick={() => askRating(s.id)}
                    aria-label={s.rating ? `Rated ${s.rating} of 5. Change rating` : 'Rate this session'}
                  >
                    {s.rating ? (
                      <span className="stars" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <StarIcon key={n} size={14} filled={n <= (s.rating ?? 0)} />
                        ))}
                      </span>
                    ) : (
                      <span className="rate-link">Rate</span>
                    )}
                  </button>
                  <Menu
                    label={`Options for ${s.activity} session`}
                    trigger={<MoreIcon size={16} />}
                    items={[{ label: 'Delete session', danger: true, onSelect: () => confirmDelete(s.id, s.activity) }]}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {scheduling && (
        <ScheduleDialog
          initialActivity={activity}
          onClose={() => setScheduling(false)}
          onStart={(minutes, act) => {
            setScheduling(false);
            setActivity(act);
            startFocus({ activity: act, mode: 'scheduled', plannedMinutes: minutes, habitId: act === activity ? habitId : null });
          }}
        />
      )}
      {settingsOpen && <FocusSettingsDialog onClose={() => setSettingsOpen(false)} timerRunning={!!timer} />}
    </div>
  );
}
