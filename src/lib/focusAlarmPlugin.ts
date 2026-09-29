import { registerPlugin } from '@capacitor/core';

export type RingtoneGroup = 'alarm' | 'notification' | 'ringtone';

export interface Ringtone {
  title: string;
  uri: string;
  group: RingtoneGroup;
}

/** JS side of android/app/src/main/java/com/family/tasks/FocusAlarmPlugin.java */
export interface FocusAlarmPlugin {
  listRingtones(): Promise<{ ringtones: Ringtone[] }>;
  preview(options: { uri: string | null }): Promise<void>;
  stopPreview(): Promise<void>;
  ensureChannel(options: { id: string; name: string; description: string; soundUri: string | null }): Promise<void>;
  deleteChannel(options: { id: string }): Promise<void>;
  openChannelSettings(options: { id: string }): Promise<void>;
}

const webStub: FocusAlarmPlugin = {
  listRingtones: async () => ({ ringtones: [] }),
  preview: async () => undefined,
  stopPreview: async () => undefined,
  ensureChannel: async () => undefined,
  deleteChannel: async () => undefined,
  openChannelSettings: async () => undefined,
};

export const FocusAlarm = registerPlugin<FocusAlarmPlugin>('FocusAlarm', { web: () => Promise.resolve(webStub) });
