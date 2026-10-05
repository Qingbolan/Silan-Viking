import type { ArticleAttribution, ContentKind } from '../../types';

export type ContentRailPanel = 'parts' | 'settings' | 'reactions';
export type ContentRailMode = 'files' | 'interaction' | 'outline';

export const nextContentRailMode: Record<ContentRailMode, ContentRailMode> = {
  files: 'interaction',
  interaction: 'outline',
  outline: 'files',
};

export type ContentSettingsPage =
  | 'overview'
  | 'cover'
  | 'discovery'
  | 'links'
  | 'relations'
  | 'publishing'
  | 'source';

export type SeriesSettingsPage =
  | 'overview'
  | 'cover'
  | 'publishing'
  | 'source';

export type RelationTargetKind = 'blog' | 'project';

type SettingsPageItem<Page extends string> = {
  id: Page;
  label: string;
};

export const contentSettingsPages: Array<SettingsPageItem<ContentSettingsPage>> = [
  { id: 'overview', label: 'Overview' },
  { id: 'cover', label: 'Cover' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'links', label: 'Links' },
  { id: 'relations', label: 'Relations' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'source', label: 'Source' },
];

export const seriesSettingsPages: Array<SettingsPageItem<SeriesSettingsPage>> = [
  { id: 'overview', label: 'Overview' },
  { id: 'cover', label: 'Cover' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'source', label: 'Source' },
];

/**
 * The settings pages one content kind shows. Shared pages (Overview,
 * Relations, Publishing, Source) keep the same order and names for every
 * kind; kind-specific pages slot in between.
 */
export function contentSettingsPagesFor(kind: ContentKind, hasCover: boolean) {
  return contentSettingsPages.filter((page) => (
    (page.id !== 'cover' || hasCover)
    && (page.id !== 'discovery' || kind === 'blog')
    && (page.id !== 'links' || kind === 'project')
    && (page.id !== 'relations' || kind === 'blog' || kind === 'moment')
  ));
}

/** A page heading is always its navigation label, so the two cannot drift. */
export const contentSettingsPageTitle = (page: ContentSettingsPage) => (
  contentSettingsPages.find((item) => item.id === page)?.label || page
);

export const seriesSettingsPageTitle = (page: SeriesSettingsPage) => (
  seriesSettingsPages.find((item) => item.id === page)?.label || page
);

export const defaultArticleAttribution = (): ArticleAttribution => ({
  project_name: '',
  publication_venue: '',
  project_url: '',
  external_resources: [],
  image_author: '',
  image_site_url: '',
  image_watermark_mode: 'off',
  image_watermark_position: 'bottom-right',
});

export function SettingsPageNavigation<Page extends string>({
  items,
  activePage,
  onChange,
  label,
}: {
  items: Array<SettingsPageItem<Page>>;
  activePage: Page;
  onChange: (page: Page) => void;
  label: string;
}) {
  return (
    <nav className="content-settings-page-nav" aria-label={label}>
      {items.map(({ id, label: itemLabel }) => (
        <button
          key={id}
          type="button"
          className={activePage === id ? 'active' : ''}
          aria-current={activePage === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <span>
            <strong>{itemLabel}</strong>
          </span>
        </button>
      ))}
    </nav>
  );
}

export function SettingsPageIntro({
  title,
}: {
  title: string;
}) {
  return (
    <header className="content-settings-page-intro">
      <h2>{title}</h2>
    </header>
  );
}

export const metadataSummaryLabel = (kind: ContentKind) => {
  switch (kind) {
    case 'blog': return 'Excerpt';
    case 'project': return 'Description';
    default: return '';
  }
};

export const metadataCoverLabel = (kind: ContentKind) => {
  switch (kind) {
    case 'blog': return 'Featured image';
    case 'project': return 'Thumbnail';
    default: return '';
  }
};
