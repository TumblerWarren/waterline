import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Authentication } from './auth';
import App from './App';
import './styles.css';
import { isNative } from './native';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Authentication>
      <App />
    </Authentication>
  </StrictMode>,
);
if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
