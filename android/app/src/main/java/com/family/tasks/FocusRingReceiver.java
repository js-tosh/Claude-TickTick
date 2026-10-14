package com.family.tasks;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.notification.StatusBarNotification;

/**
 * Makes a focus alarm ring more than once. A focus alarm notification plays
 * its sound once when it appears; this receiver is woken a few seconds later
 * and posts the same notification again with alerting turned back on, so it
 * rings again. Nothing happens if the alarm is no longer showing (it was
 * tapped, swiped away, or the next phase was started), so the extra rings
 * stop by themselves.
 */
public class FocusRingReceiver extends BroadcastReceiver {

    static final String ACTION = "com.family.tasks.FOCUS_RING_AGAIN";
    /** Focus alarm notification ids (FOCUS_IDS in src/lib/notifications.ts). */
    static final int FOCUS_ID_MIN = 1000;
    static final int FOCUS_ID_MAX = 1999;
    /** Request codes for the extra rings; enough for every repeat of one alarm. */
    static final int MAX_RINGS = 64;

    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        StatusBarNotification newest = null;
        try {
            for (StatusBarNotification sbn : manager.getActiveNotifications()) {
                if (sbn.getId() < FOCUS_ID_MIN || sbn.getId() > FOCUS_ID_MAX) continue;
                if (newest == null || sbn.getPostTime() > newest.getPostTime()) newest = sbn;
            }
        } catch (Exception ignored) {
            return;
        }
        if (newest == null) return;
        Notification n = newest.getNotification();
        // The notification plugin sets "only alert once", which would make the re-post silent.
        n.flags &= ~Notification.FLAG_ONLY_ALERT_ONCE;
        n.when = System.currentTimeMillis();
        manager.notify(newest.getTag(), newest.getId(), n);
    }

    private static PendingIntent pending(Context context, int index, int flags) {
        Intent intent = new Intent(context, FocusRingReceiver.class).setAction(ACTION);
        int f = flags | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(context, index, intent, f);
    }

    /** Wake up at each of these times (ms since epoch) and ring the showing alarm again. */
    static void schedule(Context context, long[] times) {
        cancel(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
        long now = System.currentTimeMillis();
        for (int i = 0; i < times.length && i < MAX_RINGS; i++) {
            if (times[i] <= now) continue;
            PendingIntent pi = pending(context, i, PendingIntent.FLAG_UPDATE_CURRENT);
            if (exact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, times[i], pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, times[i], pi);
            } else {
                alarms.setExact(AlarmManager.RTC_WAKEUP, times[i], pi);
            }
        }
    }

    static void cancel(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int i = 0; i < MAX_RINGS; i++) {
            PendingIntent pi = pending(context, i, PendingIntent.FLAG_NO_CREATE);
            if (pi == null) continue;
            if (alarms != null) alarms.cancel(pi);
            pi.cancel();
        }
    }
}
