import type { ContentRailMode, ContentRailPanel } from '../app/settings/contentSettings';
import type { EntityFilter } from '../types';

export type WorkspaceNavigationSnapshot = {
  screen: 'dashboard' | 'content' | 'settings' | 'plugin';
  pageId?: string;
  entityFilter: EntityFilter;
  selectedDocumentId: string;
  selectedSeriesId: string;
  editorOpen: boolean;
  railMode: ContentRailMode;
  railPanel: ContentRailPanel;
};

export type WorkspaceLocation =
  | { kind: 'plugin'; pageId: string }
  | { kind: 'dashboard' }
  | { kind: 'settings' }
  | { kind: 'shelf'; entityFilter: EntityFilter }
  | { kind: 'series'; entityFilter: EntityFilter; seriesId: string }
  | {
      kind: 'editor';
      entityFilter: EntityFilter;
      documentId: string;
      seriesId: string;
      railMode: ContentRailMode;
      railPanel: ContentRailPanel;
    };

export type WorkspaceNavigationHistory = {
  entries: WorkspaceLocation[];
  index: number;
};

const historyLimit = 100;

export const workspaceLocationFrom = (
  snapshot: WorkspaceNavigationSnapshot,
): WorkspaceLocation => {
  if (snapshot.screen === 'plugin') return { kind: 'plugin', pageId: snapshot.pageId || '' };
  if (snapshot.screen === 'dashboard') return { kind: 'dashboard' };
  if (snapshot.screen === 'settings') return { kind: 'settings' };
  if (snapshot.editorOpen && snapshot.selectedDocumentId) {
    return {
      kind: 'editor',
      entityFilter: snapshot.entityFilter,
      documentId: snapshot.selectedDocumentId,
      seriesId: snapshot.selectedSeriesId,
      railMode: snapshot.railMode,
      railPanel: snapshot.railPanel,
    };
  }
  if (snapshot.selectedSeriesId) {
    return {
      kind: 'series',
      entityFilter: snapshot.entityFilter,
      seriesId: snapshot.selectedSeriesId,
    };
  }
  return { kind: 'shelf', entityFilter: snapshot.entityFilter };
};

export const workspaceLocationKey = (location: WorkspaceLocation) => {
  switch (location.kind) {
    case 'plugin': return `plugin:${location.pageId}`;
    case 'dashboard':
    case 'settings':
      return location.kind;
    case 'shelf':
      return `shelf:${location.entityFilter}`;
    case 'series':
      return `series:${location.entityFilter}:${location.seriesId}`;
    case 'editor':
      return [
        'editor',
        location.entityFilter,
        location.documentId,
        location.seriesId,
        location.railMode,
        location.railPanel,
      ].join(':');
  }
};

export const createWorkspaceNavigationHistory = (
  initialLocation: WorkspaceLocation,
): WorkspaceNavigationHistory => ({
  entries: [initialLocation],
  index: 0,
});

export const recordWorkspaceLocation = (
  history: WorkspaceNavigationHistory,
  location: WorkspaceLocation,
): WorkspaceNavigationHistory => {
  const current = history.entries[history.index];
  if (current && workspaceLocationKey(current) === workspaceLocationKey(location)) {
    return history;
  }

  const entries = [...history.entries.slice(0, history.index + 1), location]
    .slice(-historyLimit);
  return {
    entries,
    index: entries.length - 1,
  };
};

export const moveWorkspaceNavigationHistory = (
  history: WorkspaceNavigationHistory,
  direction: -1 | 1,
): WorkspaceNavigationHistory => {
  const index = Math.min(
    history.entries.length - 1,
    Math.max(0, history.index + direction),
  );
  return index === history.index ? history : { ...history, index };
};

export const canMoveWorkspaceNavigationHistory = (
  history: WorkspaceNavigationHistory,
  direction: -1 | 1,
) => direction === -1
  ? history.index > 0
  : history.index < history.entries.length - 1;
