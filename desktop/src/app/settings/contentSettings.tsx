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
  description: string;
};

export const contentSettingsPages: Array<SettingsPageItem<ContentSettingsPage>> = [
  { id: 'overview', label: 'Overview', description: 'Title and summary' },
  { id: 'cover', label: 'Cover', description: 'Preview and generate' },
  { id: 'discovery', label: 'Discovery', description: 'Resources and image credit' },
  { id: 'links', label: 'Links', description: 'Repository and demo' },
  { id: 'relations', label: 'Relations', description: 'Convert and connect' },
  { id: 'publishing', label: 'Visibility', description: 'Public or private' },
  { id: 'source', label: 'Source', description: 'Identifiers and files' },
];

export const seriesSettingsPages: Array<SettingsPageItem<SeriesSettingsPage>> = [
  { id: 'overview', label: 'Overview', description: 'Title and summary' },
  { id: 'cover', label: 'Cover', description: 'Upload or generate' },
  { id: 'publishing', label: 'Publishing', description: 'Series availability' },
  { id: 'source', label: 'Source', description: 'Identifier and file' },
];

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
      {items.map(({ id, label: itemLabel, description }) => (
        <button
          key={id}
          type="button"
          className={activePage === id ? 'active' : ''}
          aria-current={activePage === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <span>
            <strong>{itemLabel}</strong>
            <small>{description}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}

export function SettingsPageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="content-settings-page-intro">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
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
