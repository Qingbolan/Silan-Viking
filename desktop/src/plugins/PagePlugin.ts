import type { ComponentType, ReactNode } from 'react';

export interface PagePluginContext {
  language: string;
  openPage(id: string): void;
  openDashboard(): void;
}
export interface PagePlugin {
  readonly apiVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  readonly icon?: ReactNode;
  readonly Page: ComponentType<PagePluginContext>;
  readonly Actions?: ComponentType<PagePluginContext>;
}

export class PagePluginRegistry {
  readonly pages: readonly PagePlugin[];
  constructor(plugins: readonly PagePlugin[]) {
    const ids = new Set<string>();
    for (const plugin of plugins) {
      if (plugin.apiVersion !== 1) throw new Error(`Unsupported page API: ${plugin.id}`);
      if (!/^[a-z][a-z0-9.-]*$/.test(plugin.id)) throw new Error(`Invalid page ID: ${plugin.id}`);
      if (ids.has(plugin.id)) throw new Error(`Duplicate page: ${plugin.id}`);
      ids.add(plugin.id);
    }
    this.pages = Object.freeze([...plugins].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  }
  find(id: string) { return this.pages.find(page => page.id === id); }
}
