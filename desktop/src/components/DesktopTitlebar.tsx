import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  desktopWindowPlatform,
  usesCustomWindowControls,
  windowNavigationInsetFor,
} from '../lib/desktopWindow';

type WorkspaceNavigationTitlebarProps = {
  showWorkspaceNavigation?: true;
  sidebarOpen: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  titlebarTitle?: string;
  titlebarMeta?: React.ReactNode;
  titlebarOptions?: React.ReactNode;
  onSidebarToggle: () => void;
  onBack: () => void;
  onForward: () => void;
  onCompose: () => void;
};

type StaticTitlebarProps = {
  showWorkspaceNavigation: false;
  title: string;
};

type DesktopTitlebarProps = WorkspaceNavigationTitlebarProps | StaticTitlebarProps;

function TitlebarGlyph({
  name,
}: {
  name: 'sidebar' | 'back' | 'forward' | 'compose' | 'library' | 'minimize' | 'maximize' | 'close';
}) {
  return (
    <svg
      className="window-navigation-glyph"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'sidebar' && (
        <>
          <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5" />
          <path d="M8 3.5v13" />
        </>
      )}
      {name === 'back' && <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />}
      {name === 'forward' && <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />}
      {name === 'compose' && (
        <>
          <path d="M10.75 4H5.25A1.25 1.25 0 0 0 4 5.25v9.5A1.25 1.25 0 0 0 5.25 16h9.5A1.25 1.25 0 0 0 16 14.75V9.5" />
          <path d="m9.25 11.75.35-2.1 5.65-5.65.75-.75 1.75.25 1.75 1s.25 1-.5 1.75L12.6 12.4l-2.1.35-1.25-1Z" />
        </>
      )}
      {name === 'library' && (
        <>
          <path d="M3.25 6.25h13.5v9.5a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1v-9.5Z" />
          <path d="M3.25 6.25V4.5a1 1 0 0 1 1-1h4l1.5 1.75h6a1 1 0 0 1 1 1" />
        </>
      )}
      {name === 'minimize' && <path d="M4 10h12" />}
      {name === 'maximize' && <rect x="4" y="4" width="12" height="12" rx="1" />}
      {name === 'close' && <path d="m5 5 10 10M15 5 5 15" />}
    </svg>
  );
}

export function DesktopTitlebar(props: DesktopTitlebarProps) {
  const showWorkspaceNavigation = props.showWorkspaceNavigation !== false;
  const [fullscreen, setFullscreen] = React.useState(false);

  React.useEffect(() => {
    if (desktopWindowPlatform !== 'macos') return undefined;

    const appWindow = getCurrentWindow();
    let active = true;
    let stopListening: (() => void) | undefined;
    const syncFullscreenState = async () => {
      const nextFullscreen = await appWindow.isFullscreen();
      if (active) setFullscreen(nextFullscreen);
    };

    void syncFullscreenState();
    void appWindow.onResized(() => void syncFullscreenState()).then((unlisten) => {
      if (active) stopListening = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      stopListening?.();
    };
  }, []);

  const navigationInset = windowNavigationInsetFor(desktopWindowPlatform, fullscreen);

  return (
    <header
      className="desktop-titlebar"
      data-fullscreen={fullscreen ? 'true' : 'false'}
      data-workspace-navigation={showWorkspaceNavigation ? 'visible' : 'hidden'}
      style={{ '--window-navigation-inset': `${navigationInset}px` } as React.CSSProperties}
    >
      <div
        className="desktop-titlebar-drag-region"
        data-tauri-drag-region
        aria-hidden="true"
        onDoubleClick={usesCustomWindowControls
          ? () => void getCurrentWindow().toggleMaximize()
          : undefined}
      />
      {showWorkspaceNavigation && (
        <nav className="window-navigation" aria-label="Window navigation">
          <button
            type="button"
            className="window-navigation-button"
            onClick={props.onSidebarToggle}
            aria-label={props.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={props.sidebarOpen}
            title={props.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <TitlebarGlyph name="sidebar" />
          </button>
          <button
            type="button"
            className="window-navigation-button"
            onClick={props.onBack}
            disabled={!props.canGoBack}
            aria-label="Go back"
            title="Go back"
          >
            <TitlebarGlyph name="back" />
          </button>
          <button
            type="button"
            className="window-navigation-button"
            onClick={props.onForward}
            disabled={!props.canGoForward}
            aria-label="Go forward"
            title="Go forward"
          >
            <TitlebarGlyph name="forward" />
          </button>
          <button
            type="button"
            className="window-navigation-button"
            onClick={props.onCompose}
            aria-label="Catch a moment"
            title="Catch a moment"
          >
            <TitlebarGlyph name="compose" />
          </button>
        </nav>
      )}
      {!showWorkspaceNavigation && (
        <div className="desktop-titlebar-context">
          <TitlebarGlyph name="library" />
          <strong>{props.title}</strong>
        </div>
      )}
      {showWorkspaceNavigation && (props.titlebarTitle || props.titlebarMeta || props.titlebarOptions) && (
        <div className="desktop-titlebar-options">
          {(props.titlebarTitle || props.titlebarMeta) && (
            <div className="desktop-titlebar-heading">
              {props.titlebarTitle && <strong className="desktop-titlebar-page-title">{props.titlebarTitle}</strong>}
              {props.titlebarMeta && <div className="desktop-titlebar-meta">{props.titlebarMeta}</div>}
            </div>
          )}
          {props.titlebarOptions}
        </div>
      )}
      {usesCustomWindowControls && (
        <div className="desktop-window-controls" role="group" aria-label="Window controls">
          <button type="button" onClick={() => void getCurrentWindow().minimize()} aria-label="Minimize" title="Minimize">
            <TitlebarGlyph name="minimize" />
          </button>
          <button type="button" onClick={() => void getCurrentWindow().toggleMaximize()} aria-label="Maximize or restore" title="Maximize or restore">
            <TitlebarGlyph name="maximize" />
          </button>
          <button type="button" className="desktop-window-close" onClick={() => void getCurrentWindow().close()} aria-label="Close" title="Close">
            <TitlebarGlyph name="close" />
          </button>
        </div>
      )}
    </header>
  );
}
