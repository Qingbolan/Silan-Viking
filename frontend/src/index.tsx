import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/design-system.css';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const clientId = (import.meta as any)?.env?.VITE_GOOGLE_CLIENT_ID as string | undefined || '423692235373-d2v539b53sm9cppehm4dqgnmjf8o7n23.apps.googleusercontent.com';

console.log('🔧 [index.tsx] Environment check:');
console.log('- import.meta.env:', (import.meta as any)?.env);
console.log('- clientId:', clientId);

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