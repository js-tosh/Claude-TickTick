import type { CapacitorConfig } from '@capacitor/cli';

// The Android app is the same Vite build wrapped in a native WebView.
// Data stays on the device: IndexedDB inside the app's private storage.
const config: CapacitorConfig = {
  appId: 'com.family.tasks',
  appName: 'Tasks',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      // res/drawable/ic_stat_tasks.xml: white check-box glyph for the status bar.
      smallIcon: 'ic_stat_tasks',
      iconColor: '#4772FA',
    },
  },
};

export default config;
