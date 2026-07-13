import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './index.css';
import './styles/design-system.css';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const clientId = (import.meta as any)?.env?.VITE_GOOGLE_CLIENT_ID as string | undefined || '423692235373-d2v539b53sm9cppehm4dqgnmjf8o7n23.apps.googleusercontent.com';

const RootApp = (
  <GoogleOAuthProvider clientId={clientId}>
    <App />
  </GoogleOAuthProvider>
);


root.render(
  <React.StrictMode>
    {RootApp}
  </React.StrictMode>
);
