import { useState } from 'react';
import { requestUnrestricted, useBackgroundStatus } from '../lib/background';
import { FocusAlarm } from '../lib/focusAlarmPlugin';
import { sendTestReminder } from '../lib/notifications';
import { isNative } from '../lib/platform';
import { useUI } from '../state/ui';

/**
 * Shown on Android when battery optimisation may hold back reminders while the
 * app is closed. Renders nothing when everything is fine (or on the web).
 */
export function BackgroundNotice() {
  const status = useBackgroundStatus();
  if (!isNative || !status || status.unrestricted) return null;
  return (
    <div className="bg-notice" role="note">
      <span>Android may hold back reminders while the app is closed.</span>
      <div className="btn-row">
        <button type="button" className="btn small" onClick={() => void requestUnrestricted()}>
          Allow in background
        </button>
      </div>
    </div>
  );
}

/** Settings: background status, the fix, and a test reminder. */
export function ReminderSettings() {
  const status = useBackgroundStatus();
  const { showToast } = useUI();
  const [testing, setTesting] = useState(false);
  if (!isNative) {
    return <p className="muted small">Reminders and alarms ring in the Android app. In a browser they only show while the page is open.</p>;
  }
  const test = async () => {
    setTesting(true);
    try {
      await sendTestReminder();
      showToast('Test reminder in 1 minute. Close the app now to check.');
    } finally {
      setTesting(false);
    }
  };
  return (
    <>
      <p className="muted small">
        Running in the background:{' '}
        {status === null ? (
          '…'
        ) : status.unrestricted ? (
          <span className="bg-status ok">allowed</span>
        ) : (
          <span className="bg-status bad">restricted, so reminders can be late or missed while the app is closed</span>
        )}
      </p>
      <div className="btn-row">
        {status && !status.unrestricted && (
          <button type="button" className="btn primary" onClick={() => void requestUnrestricted()}>
            Allow in background
          </button>
        )}
        <button type="button" className="btn" onClick={() => void test()} disabled={testing}>
          Send a test reminder
        </button>
        <button type="button" className="btn" onClick={() => void FocusAlarm.openAppSettings()}>
          App settings
        </button>
      </div>
      <p className="muted small">
        Some phones (Samsung, Xiaomi, OnePlus and others) also stop apps that aren't open. If the test reminder doesn't arrive, open App settings → Battery and choose Unrestricted, and take the app off any "sleeping apps" list.
      </p>
    </>
  );
}
