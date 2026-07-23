import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import './web/styles.css';
import '../global.css';
import './theme/dark.css';
import './theme/dark-extras.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (!import.meta.env.DEV && 'serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('BCMS service worker registration failed:', error);
    });
  });
}
