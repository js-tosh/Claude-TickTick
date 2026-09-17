import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { UIProvider, applyTheme } from './state/ui';
import './styles/global.css';

// Apply the saved theme before first paint to avoid a flash.
try {
  const saved = localStorage.getItem('tt.theme');
  if (saved) applyTheme(JSON.parse(saved));
} catch {
  /* ignore */
}

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UIProvider>
      <App />
    </UIProvider>
  </StrictMode>,
);
