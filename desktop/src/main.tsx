import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App';
import { PaidAiGateProvider } from './components/PaidAiGate';
import { StartupExperience } from './components/StartupExperience';
import { WorkspaceBootstrapGate } from './components/WorkspaceOnboarding';
import './styles.css';
import { createThemeSession } from './theme/composition';
import { ThemeProvider } from './theme/ThemeProvider';

const themeSession = createThemeSession(document, () => window.localStorage);
void themeSession.initialize();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider session={themeSession}>
    <StartupExperience>
      <WorkspaceBootstrapGate>
        <PaidAiGateProvider>
          <App />
        </PaidAiGateProvider>
      </WorkspaceBootstrapGate>
    </StartupExperience>
    </ThemeProvider>
  </React.StrictMode>,
);
