import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Authentication } from './auth';
import App from './App';
import { NearbyProvider } from './components/NearbyBoard';
import './styles.css';
import './redesign.css';
import { isNative } from './native';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Authentication>
      <NearbyProvider>
        <App />
      </NearbyProvider>
    </Authentication>
  </StrictMode>,
);
if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
