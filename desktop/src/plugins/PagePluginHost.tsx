import { Component, type ReactNode } from 'react';
import type { PagePlugin, PagePluginContext } from './PagePlugin';

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">This page could not be opened.</p> : this.props.children;
  }
}

export function PagePluginHost({ plugin, context }: { plugin?: PagePlugin; context: PagePluginContext }) {
  if (!plugin) return <p role="status">Page unavailable.</p>;
  const { Page, Actions } = plugin;
  return <PageBoundary key={plugin.id}><section className="plugin-page">
    <header><h1>{plugin.title}</h1>{Actions && <Actions {...context} />}</header>
    <Page {...context} />
  </section></PageBoundary>;
}
