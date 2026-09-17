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
};

export default config;
