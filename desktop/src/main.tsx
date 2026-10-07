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

export function mountApplication(ready: () => void, fail: (error: unknown) => void) {
  const themeSession = createThemeSession(document, () => window.localStorage);
  void themeSession.initialize();

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ApplicationBoundary onFailure={fail}>
        <Ready onReady={ready} />
        <ThemeProvider session={themeSession}>
          <StartupExperience>
            <WorkspaceBootstrapGate>
              <PaidAiGateProvider>
                <App />
              </PaidAiGateProvider>
            </WorkspaceBootstrapGate>
          </StartupExperience>
        </ThemeProvider>
      </ApplicationBoundary>
    </React.StrictMode>,
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  React.useEffect(onReady, [onReady]);
  return null;
}

class ApplicationBoundary extends React.Component<
  { children: React.ReactNode; onFailure: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error); }
  render() { return this.state.failed ? null : this.props.children; }
}
