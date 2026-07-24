import React from 'react';
import type { EntityFilter } from '../types';

type SidebarGlyphName =
  | 'blog'
  | 'dashboard'
  | 'menu'
  | 'moment'
  | 'project'
  | 'resume'
  | 'search'
  | 'settings'
  | 'source';

type WorkspaceSidebarItem = {
  id: EntityFilter;
  label: string;
  count: number;
};

type WorkspaceSidebarProps = {
  open: boolean;
  dashboardActive: boolean;
  activeItem: EntityFilter | null;
  attentionCount: number;
  avatarLabel: string;
  avatarUrl: string;
  displayName: string;
  items: WorkspaceSidebarItem[];
  query: string;
  onDashboardOpen: () => void;
  onItemOpen: (item: EntityFilter) => void;
  onQueryChange: (query: string) => void;
  onSettingsOpen: () => void;
  onToggle: () => void;
};

const glyphForItem = (item: EntityFilter): SidebarGlyphName => {
  switch (item) {
    case 'resume':
      return 'resume';
    case 'moment':
      return 'moment';
    case 'blog':
      return 'blog';
    case 'project':
      return 'project';
    default:
      return 'source';
  }
};

function SidebarGlyph({
  name,
  size = 17,
}: {
  name: SidebarGlyphName;
  size?: number;
}) {
  return (
    <svg
      className="sidebar-glyph"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'menu' && (
        <>
          <path d="M4 5.25h12" />
          <path d="M4 10h12" />
          <path d="M4 14.75h12" />
        </>
      )}
      {name === 'dashboard' && (
        <>
          <rect x="3.25" y="3.25" width="5.25" height="5.25" rx="1" />
          <rect x="11.5" y="3.25" width="5.25" height="5.25" rx="1" />
          <rect x="3.25" y="11.5" width="5.25" height="5.25" rx="1" />
          <rect x="11.5" y="11.5" width="5.25" height="5.25" rx="1" />
        </>
      )}
      {name === 'resume' && (
        <>
          <circle cx="10" cy="6.25" r="2.75" />
          <path d="M4.5 16.5v-1.25A5.5 5.5 0 0 1 10 9.75a5.5 5.5 0 0 1 5.5 5.5v1.25" />
        </>
      )}
      {name === 'moment' && (
        <>
          <circle cx="10" cy="10" r="6.75" />
          <circle cx="10" cy="10" r="2.15" />
          <path d="M10 3.25v2.4M10 14.35v2.4M3.25 10h2.4M14.35 10h2.4" />
        </>
      )}
      {name === 'blog' && (
        <>
          <path d="M3.25 4.25h4.5A2.25 2.25 0 0 1 10 6.5v10.25a2.75 2.75 0 0 0-2.75-2.75h-4V4.25Z" />
          <path d="M16.75 4.25h-4.5A2.25 2.25 0 0 0 10 6.5v10.25A2.75 2.75 0 0 1 12.75 14h4V4.25Z" />
        </>
      )}
      {name === 'project' && (
        <>
          <path d="M3.25 6.5h13.5v9.25a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V6.5Z" />
          <path d="M7 6.5V4.25a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6.5M3.25 10.5h13.5" />
          <path d="M8.5 10.5v1.25h3V10.5" />
        </>
      )}
      {name === 'search' && (
        <>
          <circle cx="8.75" cy="8.75" r="5.25" />
          <path d="m12.75 12.75 3.75 3.75" />
        </>
      )}
      {name === 'source' && (
        <>
          <path d="M5 2.75h6l4 4v10.5H5V2.75Z" />
          <path d="M11 2.75v4h4M7.5 10h5M7.5 13h5" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle cx="10" cy="10" r="2.5" />
          <path d="M8.8 2.75h2.4l.45 2a6 6 0 0 1 1.65.95l1.95-.6 1.2 2.08-1.5 1.4a6 6 0 0 1 0 1.9l1.5 1.4-1.2 2.08-1.95-.6a6 6 0 0 1-1.65.95l-.45 2H8.8l-.45-2a6 6 0 0 1-1.65-.95l-1.95.6-1.2-2.08 1.5-1.4a6 6 0 0 1 0-1.9l-1.5-1.4 1.2-2.08 1.95.6a6 6 0 0 1 1.65-.95l.45-2Z" />
        </>
      )}
    </svg>
  );
}

export function WorkspaceSidebar({
  open,
  dashboardActive,
  activeItem,
  attentionCount,
  avatarLabel,
  avatarUrl,
  displayName,
  items,
  query,
  onDashboardOpen,
  onItemOpen,
  onQueryChange,
  onSettingsOpen,
  onToggle,
}: WorkspaceSidebarProps) {
  return (
    <>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
        aria-expanded={open}
      >
        <SidebarGlyph name="menu" size={16} />
      </button>

      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Workspace sidebar">
        <header className="brand">
          <div className="brand-avatar" data-empty={!avatarUrl}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" aria-hidden="true" />
              : <span aria-hidden="true">{avatarLabel}</span>}
          </div>
          <div className="brand-copy">
            <div className="brand-title">{displayName}</div>
            <div className="brand-subtitle">Silan-Viking workspace</div>
          </div>
        </header>

        <nav className="entity-nav" aria-label="Workspace navigation">
          <div className="sidebar-section-label">Workspace</div>
          <button
            type="button"
            className={`entity-button ${dashboardActive ? 'active' : ''}`}
            onClick={onDashboardOpen}
            aria-current={dashboardActive ? 'page' : undefined}
          >
            <span className="entity-button-icon"><SidebarGlyph name="dashboard" /></span>
            <span>Dashboard</span>
            <strong>{attentionCount}</strong>
          </button>

          <div className="sidebar-section-label sidebar-section-label-library">Library</div>
          {items.map((item) => {
            const active = activeItem === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`entity-button ${active ? 'active' : ''}`}
                onClick={() => onItemOpen(item.id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="entity-button-icon"><SidebarGlyph name={glyphForItem(item.id)} /></span>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            );
          })}
        </nav>

        <footer className="sidebar-footer">
          <label className="search">
            <SidebarGlyph name="search" size={16} />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search workspace"
              aria-label="Search workspace"
            />
          </label>
          <div className="source-note">
            <SidebarGlyph name="source" size={15} />
            <span><strong>content/</strong> is the source</span>
            <button
              type="button"
              onClick={onSettingsOpen}
              title="Workspace settings"
              aria-label="Workspace settings"
            >
              <SidebarGlyph name="settings" size={16} />
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
