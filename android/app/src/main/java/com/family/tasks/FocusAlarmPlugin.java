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
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small native helper for the focus timer's alarm:
 *  - lists the phone's ringtones, alarm and notification sounds,
 *  - previews one,
 *  - creates the alarm notification channel with a chosen sound
 *    (on Android 8+ the sound belongs to the channel, not the notification),
 *  - opens the channel's page in Android settings.
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
}
