import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UIProvider, applyTheme } from './state/ui';
import { isNative, requestPersistentStorage } from './lib/platform';
import './styles/global.css';

// Apply the saved theme before first paint to avoid a flash.
try {
  const saved = localStorage.getItem('tt.theme');
  if (saved) applyTheme(JSON.parse(saved));
} catch {
  /* ignore */
}

// The service worker is only for the installable web version. Inside the
// Android app the files already ship with the APK, and a service worker there
// could keep serving an old version after an update.
if (!isNative) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  requestPersistentStorage();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UIProvider>
      <App />
    </UIProvider>
  </StrictMode>,
);
