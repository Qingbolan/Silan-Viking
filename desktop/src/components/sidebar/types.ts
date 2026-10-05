import type { EntityFilter } from '../../types';

export type SidebarGlyphName =
  | 'blog'
  | 'dashboard'
  | 'moment'
  | 'project'
  | 'resume'
  | 'settings'
  | 'source';

export type WorkspaceSidebarItem = {
  id: EntityFilter;
  label: string;
  count: number;
};

export type WorkspaceSidebarContext = {
  dashboardActive: boolean;
  activePageId?: string;
  onPageOpen?: (id: string) => void;
  activeItem: EntityFilter | null;
  attentionCount: number;
  avatarLabel: string;
  avatarUrl: string;
  displayName: string;
  items: WorkspaceSidebarItem[];
  onDashboardOpen: () => void;
  onItemOpen: (item: EntityFilter) => void;
  onSettingsOpen: () => void;
};

