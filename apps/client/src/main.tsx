import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import './web/styles.css';
import '../global.css';
// Order matters: palette.css repoints legacy [#hex] utilities at tokens and has
// the same specificity as Tailwind's own rules, so it must load after them.
// dark.css / dark-extras.css are scoped to [data-theme="dark"] (higher
// specificity) and layer on top.
import './theme/palette.css';
import './theme/density.css';
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
