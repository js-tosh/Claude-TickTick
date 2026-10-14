package com.family.tasks;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import org.json.JSONArray;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small native helper for the focus timer's alarm:
 *  - lists the phone's ringtones, alarm and notification sounds,
 *  - previews one,
 *  - creates the alarm notification channel with a chosen sound
 *    (on Android 8+ the sound belongs to the channel, not the notification),
 *  - opens the channel's page in Android settings,
 *  - rings a showing alarm again a few seconds later (FocusRingReceiver),
 *  - checks and asks for permission to run in the background, which some
 *    phones need before reminders can ring while the app is closed.
 */
@CapacitorPlugin(name = "FocusAlarm")
public class FocusAlarmPlugin extends Plugin {

    private Ringtone preview;

    private static AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    @PluginMethod
    public void listRingtones(PluginCall call) {
        JSArray out = new JSArray();
        int[] types = { RingtoneManager.TYPE_ALARM, RingtoneManager.TYPE_NOTIFICATION, RingtoneManager.TYPE_RINGTONE };
        String[] groups = { "alarm", "notification", "ringtone" };
        for (int i = 0; i < types.length; i++) {
            try {
                RingtoneManager manager = new RingtoneManager(getContext());
                manager.setType(types[i]);
                Cursor cursor = manager.getCursor();
                if (cursor == null) continue;
                int position = 0;
                while (cursor.moveToNext()) {
                    Uri uri = manager.getRingtoneUri(position);
                    String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                    if (uri != null && title != null) {
                        JSObject item = new JSObject();
                        item.put("title", title);
                        item.put("uri", uri.toString());
                        item.put("group", groups[i]);
                        out.put(item);
                    }
                    position++;
                }
            } catch (Exception ignored) {
                // A missing provider on some phones just means fewer sounds to pick from.
            }
        }
        JSObject result = new JSObject();
        result.put("ringtones", out);
        call.resolve(result);
    }

    @PluginMethod
    public void preview(PluginCall call) {
        stopPreviewInternal();
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.resolve();
            return;
        }
        try {
            preview = RingtoneManager.getRingtone(getContext(), Uri.parse(uri));
            if (preview != null) {
                preview.setAudioAttributes(alarmAttributes());
                preview.play();
            }
        } catch (Exception e) {
            call.reject("Could not play that sound: " + e.getMessage());
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        stopPreviewInternal();
        call.resolve();
    }

    private void stopPreviewInternal() {
        if (preview != null) {
            try {
                preview.stop();
            } catch (Exception ignored) {}
            preview = null;
        }
    }

    @Override
    protected void handleOnPause() {
        stopPreviewInternal();
        super.handleOnPause();
    }

    /** Create the channel if it does not exist yet (a channel's sound cannot change afterwards). */
    @PluginMethod
    public void ensureChannel(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager.getNotificationChannel(id) == null) {
            NotificationChannel channel = new NotificationChannel(id, call.getString("name", "Focus timer alarm"), NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription(call.getString("description", ""));
            channel.enableVibration(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            String sound = call.getString("soundUri");
            Uri soundUri = sound != null && !sound.isEmpty()
                ? Uri.parse(sound)
                : Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/focus_alarm");
            channel.setSound(soundUri, alarmAttributes());
            manager.createNotificationChannel(channel);
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteChannel(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String id = call.getString("id");
            if (id != null && !id.isEmpty()) {
                NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                try {
                    manager.deleteNotificationChannel(id);
                } catch (Exception ignored) {}
            }
        }
        call.resolve();
    }

    /** Open this channel's page in Android settings (sound, vibration, importance). */
    @PluginMethod
    public void openChannelSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.putExtra(Settings.EXTRA_CHANNEL_ID, call.getString("id", ""));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }

    /** Times (ms since epoch) at which to ring the showing focus alarm again. */
    @PluginMethod
    public void scheduleRings(PluginCall call) {
        JSONArray at = call.getArray("at");
        long[] times = new long[at == null ? 0 : at.length()];
        for (int i = 0; i < times.length; i++) times[i] = at.optLong(i, 0);
        FocusRingReceiver.schedule(getContext(), times);
        call.resolve();
    }

    @PluginMethod
    public void cancelRings(PluginCall call) {
        FocusRingReceiver.cancel(getContext());
        call.resolve();
    }

    /** Whether Android may hold back this app's alarms while it is closed. */
    @PluginMethod
    public void backgroundStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean unrestricted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            unrestricted = pm == null || pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        }
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.AlarmManager alarms = (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            exact = alarms == null || alarms.canScheduleExactAlarms();
        }
        result.put("unrestricted", unrestricted);
        result.put("exactAlarms", exact);
        call.resolve(result);
    }

    /** Show Android's "Let this app always run in background?" prompt (or its settings page). */
    @PluginMethod
    public void requestUnrestricted(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve();
            return;
        }
        Intent ask = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        ask.setData(Uri.parse("package:" + getContext().getPackageName()));
        ask.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(ask);
            call.resolve();
            return;
        } catch (Exception ignored) {
            // Some phones don't offer the prompt; fall back to the app's settings page.
        }
        openAppDetails(call);
    }

    /** The app's page in Android settings (battery, notifications, "pause app activity"). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppDetails(call);
    }

    private void openAppDetails(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }
}
