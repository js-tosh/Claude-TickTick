package com.family.tasks;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Notification buttons that work without opening the app, so they can be
 * pressed on a watch (notifications are mirrored to Wear OS) or on the lock
 * screen. The notification plugin's own buttons open the app; a second after
 * a notification appears, FIX re-posts it with buttons that send a broadcast
 * here instead. A button then:
 *  - does what it can natively right away (dismiss, snooze, schedule the next
 *    focus-timer alarm), and
 *  - queues the change for the app (task done, habit checked in, timer phase
 *    confirmed at a given time), which applies it the next time it runs, or
 *    at once if it is running (FocusAlarmPlugin.emitQueued).
 */
public class NotificationActions extends BroadcastReceiver {

    static final String ACTION_FIX = "com.family.tasks.NOTIFICATION_FIX";
    static final String ACTION_BUTTON = "com.family.tasks.NOTIFICATION_BUTTON";
    static final String ACTION_POST = "com.family.tasks.NOTIFICATION_POST";

    private static final String PREFS = "notification_actions";
    private static final String QUEUE = "queue";
    private static final String FOCUS_PLAN = "focusPlan";
    private static final String SNOOZES = "snoozes";

    /** Focus alarm notifications posted from here (src/lib/notifications.ts keeps clear of them). */
    static final int NATIVE_FOCUS_ID = 1976;
    static final int FOCUS_REPEATS = 12;
    static final long REPEAT_MS = 5 * 60_000L;
    static final long RING_GAP_MS = 20_000L;
    static final int RINGS = 3;
    static final int BREAK_MIN = 5;
    static final int SNOOZE_MIN = 10;
    static final int SNOOZE_ID_BASE = 20000;

    // -------------------------------------------------------------------------

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        try {
            if (action.startsWith(ACTION_FIX)) fix(context, intent);
            else if (action.startsWith(ACTION_BUTTON)) button(context, intent);
            else if (action.startsWith(ACTION_POST)) post(context, intent);
        } catch (Exception ignored) {
            // A failed extra step must never crash the app in the background.
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static NotificationManager nm(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    private static StatusBarNotification active(Context c, int id) {
        for (StatusBarNotification sbn : nm(c).getActiveNotifications()) if (sbn.getId() == id) return sbn;
        return null;
    }

    // ---- Re-posting with background buttons -------------------------------

    /** Ask for FIX at `at` (just after the plugin shows notification `id`). */
    static void scheduleFix(Context c, String group, int id, long at, JSONArray actions, JSONObject extra) {
        Intent i = new Intent(c, NotificationActions.class).setAction(ACTION_FIX + ":" + id);
        i.putExtra("id", id);
        i.putExtra("actions", actions.toString());
        i.putExtra("extra", extra.toString());
        PendingIntent pi = PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
        setAlarm(c, at, pi);
        SharedPreferences p = prefs(c);
        String key = "fix:" + group;
        String ids = p.getString(key, "");
        p.edit().putString(key, ids.isEmpty() ? String.valueOf(id) : ids + "," + id).apply();
    }

    static void cancelFixes(Context c, String group) {
        SharedPreferences p = prefs(c);
        String key = "fix:" + group;
        for (String s : p.getString(key, "").split(",")) {
            if (s.isEmpty()) continue;
            int id = Integer.parseInt(s);
            Intent i = new Intent(c, NotificationActions.class).setAction(ACTION_FIX + ":" + id);
            cancelAlarm(c, PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_NO_CREATE | immutable()));
        }
        p.edit().remove(key).apply();
    }

    private void fix(Context c, Intent intent) throws Exception {
        int id = intent.getIntExtra("id", -1);
        StatusBarNotification sbn = active(c, id);
        if (sbn == null) return;
        JSONArray actions = new JSONArray(intent.getStringExtra("actions"));
        JSONObject extra = new JSONObject(intent.getStringExtra("extra"));
        Notification.Builder b = Notification.Builder.recoverBuilder(c, sbn.getNotification());
        b.setActions(buttons(c, id, actions, extra));
        b.setOnlyAlertOnce(true); // a quiet update: it already rang
        nm(c).notify(sbn.getTag(), id, b.build());
    }

    private static Notification.Action[] buttons(Context c, int id, JSONArray actions, JSONObject extra) {
        Notification.Action[] out = new Notification.Action[actions.length()];
        for (int k = 0; k < actions.length(); k++) {
            JSONObject a = actions.optJSONObject(k);
            String actionId = a.optString("id");
            PendingIntent pi;
            if (a.optBoolean("open", false)) {
                pi = openApp(c, id * 10 + k);
            } else {
                Intent i = new Intent(c, NotificationActions.class).setAction(ACTION_BUTTON + ":" + id + ":" + actionId);
                i.putExtra("id", id);
                i.putExtra("actionId", actionId);
                i.putExtra("extra", extra.toString());
                pi = PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
            }
            out[k] = new Notification.Action.Builder(null, a.optString("title"), pi).build();
        }
        return out;
    }

    private static PendingIntent openApp(Context c, int requestCode) {
        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch == null) launch = new Intent(c, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, requestCode, launch, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    // ---- Buttons ------------------------------------------------------------

    private void button(Context c, Intent intent) throws Exception {
        int id = intent.getIntExtra("id", -1);
        String actionId = intent.getStringExtra("actionId");
        JSONObject extra = new JSONObject(intent.getStringExtra("extra"));
        String kind = extra.optString("kind");
        long now = System.currentTimeMillis();
        JSONObject item = new JSONObject().put("at", now).put("actionId", actionId).put("kind", kind);

        if ("task".equals(kind) && "snooze".equals(actionId)) {
            snooze(c, id, extra.optString("taskId"));
            return; // nothing for the app to do
        }
        nm(c).cancel(id);
        if ("task".equals(kind)) {
            cancelSnooze(c, extra.optString("taskId"));
            item.put("taskId", extra.optString("taskId"));
        } else if ("habit".equals(kind)) {
            item.put("habitId", extra.optString("habitId")).put("date", extra.optString("date"));
        } else if ("focus".equals(kind)) {
            item.put("timerId", extra.optString("timerId"));
            startNextFocusPhase(c, "skipBreak".equals(actionId), now);
        }
        enqueue(c, item);
        FocusAlarmPlugin.emitQueued();
    }

    private static synchronized void enqueue(Context c, JSONObject item) throws Exception {
        SharedPreferences p = prefs(c);
        JSONArray q = new JSONArray(p.getString(QUEUE, "[]"));
        q.put(item);
        p.edit().putString(QUEUE, q.toString()).apply();
    }

    /** Everything queued since the app last looked, oldest first; the queue is emptied. */
    static synchronized JSONArray takeQueue(Context c) {
        SharedPreferences p = prefs(c);
        JSONArray q;
        try {
            q = new JSONArray(p.getString(QUEUE, "[]"));
        } catch (Exception e) {
            q = new JSONArray();
        }
        p.edit().remove(QUEUE).apply();
        return q;
    }

    // ---- Snooze -------------------------------------------------------------

    private void snooze(Context c, int id, String taskId) throws Exception {
        StatusBarNotification sbn = active(c, id);
        nm(c).cancel(id);
        if (sbn == null) return;
        int snoozeId = SNOOZE_ID_BASE + (int) ((System.currentTimeMillis() / 1000) % 1000);
        Notification n = sbn.getNotification();
        n.flags &= ~Notification.FLAG_ONLY_ALERT_ONCE; // ring again when it comes back
        schedulePost(c, snoozeId, System.currentTimeMillis() + SNOOZE_MIN * 60_000L, n);
        if (taskId != null && !taskId.isEmpty()) {
            JSONObject map = new JSONObject(prefs(c).getString(SNOOZES, "{}"));
            map.put(taskId, snoozeId);
            prefs(c).edit().putString(SNOOZES, map.toString()).apply();
        }
    }

    /** A task was completed or deleted: drop a snoozed reminder still waiting for it. */
    static void cancelSnooze(Context c, String taskId) {
        try {
            JSONObject map = new JSONObject(prefs(c).getString(SNOOZES, "{}"));
            if (!map.has(taskId)) return;
            int snoozeId = map.getInt(taskId);
            cancelPost(c, snoozeId);
            nm(c).cancel(snoozeId);
            map.remove(taskId);
            prefs(c).edit().putString(SNOOZES, map.toString()).apply();
        } catch (Exception ignored) {}
    }

    // ---- Posting a prepared notification later -----------------------------

    private static void schedulePost(Context c, int id, long at, Notification n) {
        Intent i = new Intent(c, NotificationActions.class).setAction(ACTION_POST + ":" + id);
        i.putExtra("id", id);
        i.putExtra("notification", n);
        setAlarm(c, at, PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable()));
    }

    private static void cancelPost(Context c, int id) {
        Intent i = new Intent(c, NotificationActions.class).setAction(ACTION_POST + ":" + id);
        cancelAlarm(c, PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_NO_CREATE | immutable()));
    }

    private void post(Context c, Intent intent) {
        int id = intent.getIntExtra("id", -1);
        Notification n;
        if (Build.VERSION.SDK_INT >= 33) {
            n = intent.getParcelableExtra("notification", Notification.class);
        } else {
            n = intent.getParcelableExtra("notification");
        }
        if (n == null) return;
        n.when = System.currentTimeMillis();
        nm(c).notify(id, n);
    }

    // ---- Focus timer: the next phase, started from a button ----------------

    /**
     * The app stores the phases that follow the alarm that is showing, so a
     * button can start the next one and schedule its alarm while the app is
     * closed. The app re-plans everything the next time it runs.
     */
    static void setFocusPlan(Context c, String planJson) {
        prefs(c).edit().putString(FOCUS_PLAN, planJson).apply();
    }

    static void clearFocus(Context c) {
        prefs(c).edit().remove(FOCUS_PLAN).apply();
        for (int k = 0; k < FOCUS_REPEATS; k++) {
            cancelPost(c, NATIVE_FOCUS_ID + k);
            nm(c).cancel(NATIVE_FOCUS_ID + k);
        }
        cancelFixes(c, "focus");
    }

    private static void startNextFocusPhase(Context c, boolean skipBreak, long now) throws Exception {
        String raw = prefs(c).getString(FOCUS_PLAN, null);
        // Stop whatever focus alarms were pending: the plugin's and our own.
        cancelPluginFocusAlarms(c);
        FocusRingReceiver.cancel(c);
        clearFocus(c);
        if (raw == null) return;
        JSONObject plan = new JSONObject(raw);
        JSONArray phases = plan.getJSONArray("phases");
        int start = skipBreak ? 1 : 0;
        if (skipBreak && (phases.length() == 0 || !"break".equals(phases.getJSONObject(0).optString("kind")))) return;
        if (phases.length() <= start) return;
        JSONObject phase = phases.getJSONObject(start);
        JSONObject after = phases.length() > start + 1 ? phases.getJSONObject(start + 1) : null;
        String to = after == null ? null : after.optString("kind");
        long at = now + phase.getLong("ms");
        String activity = plan.optString("activity", "Focus");
        String channelId = plan.optString("channelId");
        String timerId = plan.optString("timerId");

        JSONObject extra = new JSONObject().put("kind", "focus").put("timerId", timerId).put("to", to == null ? JSONObject.NULL : to);
        long[] rings = new long[FOCUS_REPEATS * (RINGS - 1)];
        for (int k = 0; k < FOCUS_REPEATS; k++) {
            int id = NATIVE_FOCUS_ID + k;
            String[] t = focusTexts(to, activity, k);
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(c, channelId)
                : new Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_stat_tasks)
                .setColor(Color.parseColor("#4772fa"))
                .setContentTitle(t[0])
                .setContentText(t[1])
                .setStyle(new Notification.BigTextStyle().bigText(t[1]))
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_HIGH)
                .setContentIntent(openApp(c, id))
                .setActions(buttons(c, id, focusButtons(to), extra));
            schedulePost(c, id, at + k * REPEAT_MS, b.build());
            for (int r = 1; r < RINGS; r++) rings[k * (RINGS - 1) + r - 1] = at + k * REPEAT_MS + r * RING_GAP_MS;
        }
        FocusRingReceiver.schedule(c, rings);

        // What follows this phase, for the next button press.
        JSONArray rest = new JSONArray();
        for (int k = start + 1; k < phases.length(); k++) rest.put(phases.get(k));
        plan.put("phases", rest);
        setFocusPlan(c, plan.toString());
    }

    private static JSONArray focusButtons(String to) throws Exception {
        JSONArray a = new JSONArray();
        if (to == null) {
            a.put(new JSONObject().put("id", "confirm").put("title", "Rate session").put("open", true));
        } else if ("break".equals(to)) {
            a.put(new JSONObject().put("id", "confirm").put("title", "Start break"));
            a.put(new JSONObject().put("id", "skipBreak").put("title", "Skip break"));
        } else {
            a.put(new JSONObject().put("id", "confirm").put("title", "Start focus"));
        }
        return a;
    }

    /** Same wording as focusTexts() in src/lib/notifications.ts. */
    private static String[] focusTexts(String to, String activity, int repeat) {
        if (to == null) {
            return new String[] {
                repeat > 0 ? "Session still waiting for a rating" : "Session complete",
                activity + ": tap Rate session to say how useful it was.",
            };
        }
        if ("break".equals(to)) {
            return new String[] {
                repeat > 0 ? "Your break is waiting" : "Focus block done",
                repeat > 0
                    ? activity + " ended " + repeat * 5 + " min ago. Tap Start break when you're ready."
                    : "Nice work on " + activity + ". Start your " + BREAK_MIN + "-minute break, or skip it and keep going.",
            };
        }
        return new String[] {
            repeat > 0 ? "Ready to focus again?" : "Break is over",
            repeat > 0
                ? "Your break ended " + repeat * 5 + " min ago. Tap Start focus to continue " + activity + "."
                : "Tap Start focus to get back to " + activity + ".",
        };
    }

    /** Cancel the notification plugin's pending focus alarms (ids 1000–1975), as its own cancel() does. */
    private static void cancelPluginFocusAlarms(Context c) {
        int flags = PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        for (int id = FocusRingReceiver.FOCUS_ID_MIN; id < NATIVE_FOCUS_ID; id++) {
            Intent i = new Intent().setClassName(c, "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher");
            cancelAlarm(c, PendingIntent.getBroadcast(c, id, i, flags));
        }
        for (StatusBarNotification sbn : nm(c).getActiveNotifications()) {
            if (sbn.getId() >= FocusRingReceiver.FOCUS_ID_MIN && sbn.getId() <= FocusRingReceiver.FOCUS_ID_MAX) nm(c).cancel(sbn.getTag(), sbn.getId());
        }
    }

    // ---- Alarm helpers ------------------------------------------------------

    static void setAlarm(Context c, long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    static void cancelAlarm(Context c, PendingIntent pi) {
        if (pi == null) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pi);
        pi.cancel();
    }
}
