import { PageNavigationPlugin } from '../plugins/PageNavigationPlugin';
import { Fragment } from 'react';
import { SidebarFactory } from './sidebar/SidebarFactory';
import { AccountSidebarPlugin, LibraryNavigationPlugin, WorkspaceNavigationPlugin } from './sidebar/builtins';
import type { WorkspaceSidebarContext } from './sidebar/types';

export const workspaceSidebarFactory = new SidebarFactory([
  new WorkspaceNavigationPlugin(), new LibraryNavigationPlugin(), new PageNavigationPlugin(), new AccountSidebarPlugin(),
]);

type WorkspaceSidebarProps = WorkspaceSidebarContext & { open: boolean; factory?: SidebarFactory };

export function WorkspaceSidebar({ open, factory = workspaceSidebarFactory, ...context }: WorkspaceSidebarProps) {
  const slots = factory.create(context);
  return <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Workspace sidebar"
    ref={element => { if (element) element.inert = !open; }} aria-hidden={!open}>
    <nav className="entity-nav" aria-label="Workspace navigation">
      {slots.navigation.map(entry => <Fragment key={entry.id}>{entry.content}</Fragment>)}
    </nav>
    <footer className="sidebar-footer">
      {slots.footer.map(entry => <Fragment key={entry.id}>{entry.content}</Fragment>)}
    </footer>
  </aside>;
}
