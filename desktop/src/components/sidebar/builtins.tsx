import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import { SidebarGlyph, glyphForItem } from './SidebarGlyph';
import type { SidebarPlugin } from './SidebarFactory';
import type { WorkspaceSidebarContext } from './types';

function NavigationItem({ label, icon, count, active, onOpen }: {
  label: string; icon: React.ReactNode; count?: number; active: boolean; onOpen: () => void;
}) {
  return <button type="button" className={`entity-button ${active ? 'active' : ''}`}
    onClick={onOpen} aria-current={active ? 'page' : undefined}>
    <span className="entity-button-icon">{icon}</span><span>{label}</span>
    {count !== undefined && count > 0 && <strong>{count}</strong>}
  </button>;
}

export class WorkspaceNavigationPlugin implements SidebarPlugin {
  readonly id = 'workspace'; readonly slot = 'navigation' as const; readonly order = 0;
  render(context: WorkspaceSidebarContext) {
    return <><WorkspaceSwitcher /><NavigationItem label="Dashboard" icon={<SidebarGlyph name="dashboard" />}
      count={context.attentionCount} active={context.dashboardActive} onOpen={context.onDashboardOpen} /></>;
  }
}

export class LibraryNavigationPlugin implements SidebarPlugin {
  readonly id = 'library'; readonly slot = 'navigation' as const; readonly order = 10;
  render(context: WorkspaceSidebarContext) {
    return <section className="sidebar-library" aria-label="Library">
      {context.items.map(item => <NavigationItem key={item.id} label={item.label}
        icon={<SidebarGlyph name={glyphForItem(item.id)} />} count={item.count}
        active={context.activeItem === item.id} onOpen={() => context.onItemOpen(item.id)} />)}
    </section>;
  }
}

export class AccountSidebarPlugin implements SidebarPlugin {
  readonly id = 'account'; readonly slot = 'footer' as const; readonly order = 0;
  render({ avatarUrl, avatarLabel, displayName, onSettingsOpen }: WorkspaceSidebarContext) {
    return (
        <div className="sidebar-account">
          <button
            type="button"
            className="sidebar-account-trigger"
            onClick={onSettingsOpen}
            title="Open workspace settings"
            aria-label="Open workspace settings"
          >
            <span className="sidebar-account-avatar" data-empty={!avatarUrl}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" aria-hidden="true" />
                : <span aria-hidden="true">{avatarLabel}</span>}
            </span>
            <span className="sidebar-account-copy">
              <strong>{displayName}</strong>
            </span>
            <span className="sidebar-account-settings" aria-hidden="true">
              <SidebarGlyph name="settings" size={16} />
            </span>
          </button>
        </div>
    );
  }
}
