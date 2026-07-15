export type ContentKind = 'blog' | 'project' | 'idea' | 'resume' | 'episode' | 'update';

export type EditorDocument = {
  id: string;
  part_id: string;
  entity_type: ContentKind;
  entity_id: string;
  series_id?: string | null;
  series_slug?: string | null;
  series_title?: string | null;
  series_description?: string | null;
  series_cover_url?: string | null;
  episode_number?: number | null;
  slug: string;
  role: string;
  canonical_language: string;
  title: string;
  status: string;
  visibility: string;
  date?: string | null;
  pinned?: boolean;
  updated_at: string;
  cover_url?: string | null;
  translations: EditorTranslation[];
};

export type EditorTranslation = {
  id: string;
  language: string;
  content: string;
  revision: string;
  source_path: string;
};

export type DashboardData = {
  total_views: number;
  total_likes: number;
  total_comments: number;
  pending_comments: number;
  human_interactions: number;
  crawler_interactions: number;
  ai_crawler_interactions: number;
  search_crawler_interactions: number;
  recent_items: DashboardItem[];
  deployed_views: number;
  deployed_likes: number;
  deployed_comments: number;
  deployed_human_interactions: number;
  deployed_ai_crawler_interactions: number;
  deployed_search_crawler_interactions: number;
  deployed_ai_chat_referrals: number;
  stats_synced_at: string | null;
};

export type StatsSyncReport = {
  synced: number;
  failed: number;
  stats: {
    views: number;
    likes: number;
    comments: number;
    human_interactions: number;
    ai_crawler_interactions: number;
    search_crawler_interactions: number;
    ai_chat_referrals: number;
    synced_at: string | null;
  };
};

export type DashboardItem = {
  entity_type: string;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  updated_at: string;
};

export type EntityFilter = 'all' | ContentKind;
export type IdeaCategory = 'inspiration' | 'thought' | 'decision' | 'state' | 'event';
export type CaptureTarget = 'blog' | 'idea' | 'update';
export type CapturePhase = 'closed' | 'opening' | 'editing' | 'confirming-close' | 'submitting' | 'failed' | 'closing';

export type ContentGroup = {
  id: string;
  kind: ContentKind;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  date?: string | null;
  pinned?: boolean;
  coverUrl?: string;
  documents: EditorDocument[];
  cardKind?: 'article' | 'series';
  episodeCount?: number;
  latestEpisode?: { title: string; episodeNumber?: number | null };
};

export type EpisodeGroup = ContentGroup & {
  episodeNumber?: number | null;
};

export type EpisodeSeries = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  coverUrl?: string | null;
  episodes: EpisodeGroup[];
};

export type EpisodeSeriesSource = {
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  status: string;
  revision: string;
  relative_path: string;
};

export type EpisodeSeriesInput = {
  title: string;
  description: string;
  cover_url: string;
  status: string;
};

export type ResumeFieldValue = string | number | boolean | string[] | null;

export type ResumeEntry = {
  entry_id: string;
  sort_order: number;
  shared: Record<string, ResumeFieldValue>;
  localized: Record<string, ResumeFieldValue>;
};

export type ResumeSection = {
  role: string;
  shape: 'entry_list' | 'key_value_list';
  canonical_language: string;
  entries: ResumeEntry[];
};

export type ResumePartSource = {
  role: string;
  language: string;
  revision: string;
  relative_path: string;
};

export type ResumeSocialLink = {
  platform: string;
  url: string;
  display_name: string;
};

export type ResumeProfile = {
  full_name: string;
  title: string;
  current_status: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  avatar_url: string;
  social_links: ResumeSocialLink[];
};

export type ResumeProfileSource = {
  language: string;
  revision: string;
  relative_path: string;
  profile: ResumeProfile;
  summary: string;
};

export type MomentsProfileAlignment = 'left' | 'right';

export type MomentsSettings = {
  profile: {
    display_name: string;
    avatar_url?: string | null;
    avatar_label: string;
    alignment: MomentsProfileAlignment;
  };
  cover: {
    background_image_url?: string | null;
    background_position: string;
    cover_height_px: number;
  };
};
