import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress Vite WebSocket and Firestore WebChannel errors which are common in the preview environment
const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('WebChannelConnection') || msg.includes('RPC \'Listen\' stream')) return;
  originalWarn.apply(console, args);
};

const originalError = console.error;
console.error = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('[vite] failed to connect to websocket')) return;
  originalError.apply(console, args);
};

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
