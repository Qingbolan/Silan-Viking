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

export type ImportedMediaAsset = {
  uri: string;
  relative_path: string;
  file_name: string;
  byte_count: number;
  markdown: string;
};

export type GeoInsightReport = {
  document_id: string;
  translation_id: string;
  title: string;
  language: string;
  score: number;
  grade: string;
  summary: string;
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
    evidence: GeoEvidence[];
  }>;
  actions: Array<{
    priority: string;
    label: string;
    detail: string;
    evidence: GeoEvidence[];
  }>;
};

export type GeoEvidence = {
  source: "source_content" | "remote_stats" | "ai_crawler" | "ai_referral" | "llm_inference";
  detail: string;
};

export type DailyTraffic = {
  date: string;
  visits: number;
  content: Array<{
    content_type: string;
    title: string;
    visits: number;
    comments: number;
    evidence: TrafficEvidence[];
    visitors: VisitorLocation[];
  }>;
};

export type VisitorLocation = {
  country_code: string;
  city: string;
  latitude: string;
  longitude: string;
  ip_addresses: string[];
  visits: number;
};

export type TrafficEvidence = {
  agent: string;
  event: string;
  subject_kind: 'attributed_topic' | 'page' | 'landing_page' | 'search_query' | null;
  subject: string | null;
  visits: number;
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
  today_visits: number;
  daily_visits: DailyTraffic[];
  daily_seo_visits: DailyTraffic[];
  daily_geo_visits: DailyTraffic[];
  top_content: Array<{
    content_type: string;
    title: string;
    views: number;
  }>;
  top_sources: Array<{
    source: string;
    visits: number;
  }>;
  top_countries: Array<{
    country_code: string;
    city: string;
    latitude: string;
    longitude: string;
    ip_addresses: string[];
    visits: number;
  }>;
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

export type VersionStatus = {
  scope: VersionScope;
  scope_label: string;
  branch: string;
  head: string;
  dirty_count: number;
  changes: Array<{
    status: string;
    path: string;
  }>;
  recent_commits: Array<{
    hash: string;
    subject: string;
    relative_time: string;
  }>;
};

export type VersionScope = 'resume' | 'blog' | 'project' | 'idea' | 'update';

export type DeploymentPlan = {
  branch: string;
  head: string;
  deploy_target: string;
  dirty_count: number;
  media_asset_count: number;
  next_action: string;
  commit_activity: Array<{
    date: string;
    commit_count: number;
    scopes: VersionScope[];
  }>;
  scopes: Array<{
    scope: VersionScope;
    scope_label: string;
    dirty_count: number;
    clean: boolean;
  }>;
};

export type DeliverySyncStatus = {
  local_head: string;
  remote_head: string;
  local_commits: number;
  remote_commits: number;
  workspace_changes: number;
  state: 'synchronized' | 'local_ahead' | 'remote_ahead' | 'diverged' | 'remote_unknown';
};

export type DeployRunStatus = {
  success: boolean;
  content_commit: string;
  stdout: string;
  stderr: string;
};

export type RemoteContentVersion = {
  health: string;
  content_hash: string;
  content_commit: string;
  generated_at: string;
  media_root_ok: boolean;
};

export type DeployVerificationResult = {
  verified: boolean;
  expected_content_commit: string;
  remote: RemoteContentVersion;
  mismatch_reason: string | null;
};

export type DashboardItem = {
  entity_type: string;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  updated_at: string;
};

export type EntityCount = {
  entity_type: ContentKind;
  count: number;
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
