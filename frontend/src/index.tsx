import React from 'react';
import ReactDOM, { hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import './styles/design-system.css';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Recover stale lazy-chunk references after a deployment, at most once per minute.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'silan-preload-recovery';
  try {
    const previous = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - previous < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch {
    // Leave the original error visible if recovery cannot be safely bounded.
  }
});

const rootElement = document.getElementById('root') as HTMLElement;

const clientId = (import.meta as any)?.env?.VITE_GOOGLE_CLIENT_ID as string | undefined || '423692235373-d2v539b53sm9cppehm4dqgnmjf8o7n23.apps.googleusercontent.com';

const RootApp = (
  <GoogleOAuthProvider clientId={clientId}>
    <App />
  </GoogleOAuthProvider>
);


const app = (
  <React.StrictMode>
    {RootApp}
  </React.StrictMode>
);

if (rootElement.hasChildNodes() && rootElement.dataset.silanPrerenderShell !== 'true') {
  hydrateRoot(rootElement, app);
} else {
  ReactDOM.createRoot(rootElement).render(app);
}
