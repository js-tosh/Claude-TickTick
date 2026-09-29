import { useEffect, useMemo, useState } from 'react';
import { FocusAlarm, type Ringtone, type RingtoneGroup } from '../../lib/focusAlarmPlugin';
import { ensureFocusChannel, openFocusAlarmSettings } from '../../lib/notifications';
import { isNative } from '../../lib/platform';
import { BREAK_MIN, FOCUS_MIN_OPTIONS, type FocusMinutes } from '../../lib/pomodoro';
import { updateSettings, useSettings, type AlarmSound } from '../../state/settings';
import { useUI } from '../../state/ui';
import { PauseIcon, PlayIcon } from '../Icons';
import { Modal } from '../Modal';

const GROUPS: { id: RingtoneGroup; label: string }[] = [
  { id: 'alarm', label: 'Alarm sounds' },
  { id: 'ringtone', label: 'Ringtones' },
  { id: 'notification', label: 'Notification sounds' },
];

export function FocusSettingsDialog({ onClose, timerRunning }: { onClose: () => void; timerRunning: boolean }) {
  const settings = useSettings();
  const { showToast } = useUI();
  const [ringtones, setRingtones] = useState<Ringtone[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    FocusAlarm.listRingtones()
      .then((r) => {
        if (!cancelled) setRingtones(r.ringtones);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setRingtones([]);
          setError(`Could not read the phone's sounds: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
      });
    return () => {
      cancelled = true;
      void FocusAlarm.stopPreview();
    };
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<RingtoneGroup, Ringtone[]>();
    for (const r of ringtones ?? []) {
      const arr = m.get(r.group) ?? [];
      arr.push(r);
      m.set(r.group, arr);
    }
    return m;
  }, [ringtones]);

  const choose = async (sound: AlarmSound | null) => {
    updateSettings({ alarmSound: sound });
    if (isNative) {
      try {
        await ensureFocusChannel();
      } catch (e) {
        setError(`Could not set that sound: ${e instanceof Error ? e.message : 'unknown error'}`);
        return;
      }
    }
    showToast(sound ? `Alarm sound: ${sound.title}` : 'Alarm sound: app chime');
  };

  const togglePreview = async (uri: string) => {
    if (playing === uri) {
      await FocusAlarm.stopPreview();
      setPlaying(null);
      return;
    }
    try {
      await FocusAlarm.preview({ uri });
      setPlaying(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not play that sound.');
    }
  };

  const selectedUri = settings.alarmSound?.uri ?? null;

  return (
    <Modal title="Focus settings" onClose={onClose} wide>
      <section className="settings-section">
        <h3>Focus block length</h3>
        <div className="segmented full" role="radiogroup" aria-label="Focus block length">
          {FOCUS_MIN_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={settings.focusMin === m}
              className={settings.focusMin === m ? 'on' : ''}
              onClick={() => updateSettings({ focusMin: m as FocusMinutes })}
            >
              {m} min
            </button>
          ))}
        </div>
        <p className="muted small">
          Breaks stay {BREAK_MIN} minutes. {timerRunning ? 'The session that is running keeps its current length; the new one applies from the next session.' : 'Applies to Focus and to scheduled sessions.'}
        </p>
      </section>

      <section className="settings-section">
        <h3>Alarm sound</h3>
        {!isNative ? (
          <p className="muted small">In the Android app you can pick any of the phone's ringtones here. The web version plays its own chime.</p>
        ) : (
          <>
            <ul className="sound-list">
              <SoundRow title="App chime" note="Built in" selected={selectedUri === null} onSelect={() => choose(null)} />
              {ringtones === null && <li className="muted small sound-loading">Reading the phone's sounds…</li>}
              {GROUPS.map(({ id, label }) => {
                const items = grouped.get(id);
                if (!items?.length) return null;
                return (
                  <li key={id} className="sound-group">
                    <h4>{label}</h4>
                    <ul>
                      {items.map((r) => (
                        <SoundRow
                          key={r.uri}
                          title={r.title}
                          selected={selectedUri === r.uri}
                          playing={playing === r.uri}
                          onSelect={() => choose({ title: r.title, uri: r.uri })}
                          onPreview={() => togglePreview(r.uri)}
                        />
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => openFocusAlarmSettings().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open settings.'))}>
                More options in Android settings
              </button>
            </div>
            <p className="muted small">The alarm plays at the phone's alarm volume, so it rings even when notifications are quiet.</p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </Modal>
  );
}

function SoundRow({
  title,
  note,
  selected,
  playing,
  onSelect,
  onPreview,
}: {
  title: string;
  note?: string;
  selected: boolean;
  playing?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
}) {
  return (
    <li className={`sound-row${selected ? ' on' : ''}`}>
      <button type="button" className="sound-pick" role="radio" aria-checked={selected} onClick={onSelect}>
        <span className="sound-radio" aria-hidden="true" />
        <span className="sound-title">{title}</span>
        {note && <span className="muted small">{note}</span>}
      </button>
      {onPreview && (
        <button type="button" className="icon-btn" onClick={onPreview} aria-label={playing ? `Stop ${title}` : `Play ${title}`}>
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
      )}
    </li>
  );
}
