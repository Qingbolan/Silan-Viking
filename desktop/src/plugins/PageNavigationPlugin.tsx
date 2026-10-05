import type { SidebarPlugin } from '../components/sidebar/SidebarFactory';
import type { WorkspaceSidebarContext } from '../components/sidebar/types';
import { pagePlugins } from './registry';

export class PageNavigationPlugin implements SidebarPlugin {
  readonly id = 'extension-pages'; readonly slot = 'navigation' as const; readonly order = 20;
  render(context: WorkspaceSidebarContext) {
    if (!pagePlugins.pages.length) return null;
    return <section className="sidebar-library" aria-label="Extensions">
      {pagePlugins.pages.map(page => <button key={page.id} type="button"
        className={`entity-button ${context.activePageId === page.id ? 'active' : ''}`}
        aria-current={context.activePageId === page.id ? 'page' : undefined}
        onClick={() => context.onPageOpen?.(page.id)}>
        <span className="entity-button-icon">{page.icon ?? '◇'}</span><span>{page.title}</span>
      </button>)}
    </section>;
  }
}
