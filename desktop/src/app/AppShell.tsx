import type { CSSProperties, ReactNode } from 'react';
import { WorkspaceSwitchNotice } from '../components/WorkspaceSwitcher';

type AppShellProps = {
  settingsOpen: boolean;
  sidebarOpen: boolean;
  windowChromeClassName: string;
  momentsActive: boolean;
  hasMomentsBackground: boolean;
  mainStyle?: CSSProperties;
  titlebar: ReactNode;
  sidebar: ReactNode;
  overlays: ReactNode;
  children: ReactNode;
};

/** Window layout owns chrome and overlay placement, never workspace mutations. */
export function AppShell({ settingsOpen, sidebarOpen, windowChromeClassName,
  momentsActive, hasMomentsBackground, mainStyle, titlebar, sidebar, overlays, children,
}: AppShellProps) {
  return <div className={`shell ${sidebarOpen && !settingsOpen ? 'sidebar-open' : ''} ${settingsOpen ? 'settings-open' : ''} ${windowChromeClassName}`}>
    {titlebar}
    {!settingsOpen && sidebar}
    <main
      className={`main ${momentsActive ? 'main-moments' : ''} ${settingsOpen ? 'main-settings' : ''}`}
      data-has-moments-background={momentsActive && hasMomentsBackground ? 'true' : undefined}
      style={mainStyle}
    >
      <WorkspaceSwitchNotice />
      {children}
    </main>
    {overlays}
  </div>;
}
