import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress Vite WebSocket errors which are common in the preview environment
window.addEventListener('error', (e) => {
  const msg = e.message || (e.error && e.error.message) || '';
  if (msg.includes('WebSocket') || msg.includes('[vite]')) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  }
}, true);

window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.message || e.reason)) || '';
  if (typeof msg === 'string' && (msg.includes('WebSocket') || msg.includes('[vite]'))) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
