import type { ReactNode } from 'react';
import type { WorkspaceSidebarContext } from './types';

export type SidebarSlot = 'navigation' | 'footer';
export interface SidebarPlugin {
  readonly id: string;
  readonly slot: SidebarSlot;
  readonly order: number;
  render(context: WorkspaceSidebarContext): ReactNode;
}

/** Composition is explicit: replace, omit or add plugins at the application boundary. */
export class SidebarFactory {
  private readonly plugins: readonly SidebarPlugin[];

  constructor(plugins: readonly SidebarPlugin[]) {
    const ids = new Set<string>();
    for (const plugin of plugins) {
      if (ids.has(plugin.id)) throw new Error(`Duplicate sidebar plugin: ${plugin.id}`);
      ids.add(plugin.id);
    }
    this.plugins = [...plugins].sort((a, b) => a.order - b.order);
  }

  create(context: WorkspaceSidebarContext) {
    const slots: Record<SidebarSlot, { id: string; content: ReactNode }[]> = { navigation: [], footer: [] };
    for (const plugin of this.plugins) {
      slots[plugin.slot].push({ id: plugin.id, content: plugin.render(context) });
    }
    return slots;
  }
}
