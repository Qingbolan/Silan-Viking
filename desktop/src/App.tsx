import React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  Activity,
  AlertCircle,
  Archive,
  BarChart3,
  Bot,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  Lightbulb,
  LoaderCircle,
  Menu,
  PencilLine,
  Plus,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Scale,
  Search,
  Send,
  Sparkles,
  Type,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { CaptureSheet } from './components/CaptureSheet';
import { CommitWall, TrafficWall } from './components/CommitWall';
import { ContentCard } from './components/ContentCard';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ResumePage } from './components/ResumePage';
import { RefreshConfirmDialog } from './components/RefreshConfirmDialog';
import { SeriesDetail } from './components/SeriesDetail';
import { UpdateFeed } from './components/UpdateFeed';
import {
  arrangeBlogGroupsForGrid,
  badgeClass,
  docPath,
  selectPrimaryDocument,
} from './lib/content';
import {
  contentLifecycleFor,
  contentStateSummary,
  seriesLifecycleFor,
  type DocumentStateInput,
  type LifecycleAction,
  type SeriesLifecycleAction,
} from './lib/contentLifecycle';
import { formatSyncedAgo } from './lib/format';
import { cssBackgroundImage } from './lib/media';
import type {
  CapturePhase,
  CaptureTarget,
  ContentGroup,
  ContentKind,
  DashboardData,
  DashboardItem,
  DeploymentPlan,
  DeployRunStatus,
  DeployVerificationResult,
  EditorDocument,
  EntityCount,
  EntityFilter,
  EpisodeGroup,
  EpisodeSeriesInput,
  EpisodeSeriesSource,
  EpisodeSeries,
  GeoInsightReport,
  IdeaCategory,
  ImportedMediaAsset,
  MomentsSettings,
  StatsSyncReport,
  VersionStatus,
  VersionScope,
} from './types';

const masonryContentKinds = new Set<ContentKind>(['blog', 'project', 'idea']);
const editableMasonryContentKinds = new Set<ContentKind>(['blog', 'project', 'idea', 'episode', 'resume', 'update']);
const versionScopeFilters = new Set<EntityFilter>(['resume', 'blog', 'project', 'idea', 'update']);

const isVersionScope = (filter: EntityFilter): filter is VersionScope => (
  versionScopeFilters.has(filter)
);

const entityMeta: Record<EntityFilter, { label: string; eyebrow: string; empty: string; Icon: typeof Folder }> = {
  all: { label: 'Library', eyebrow: 'All content', empty: 'No matching Markdown content.', Icon: Folder },
  blog: { label: 'Blog', eyebrow: 'Articles & posts', empty: 'No blog posts yet. Write the first one.', Icon: BookOpen },
  project: { label: 'Projects', eyebrow: 'Work in progress', empty: 'No projects yet. Create the first one.', Icon: Briefcase },
  idea: { label: 'Ideas', eyebrow: 'Half-formed thoughts', empty: 'No ideas yet. Record the first one.', Icon: Lightbulb },
  resume: { label: 'Resume', eyebrow: 'Structured record', empty: 'No resume parts found.', Icon: UserRound },
  episode: { label: 'Episodes', eyebrow: 'Series & episodes', empty: 'No episodes yet.', Icon: Radio },
  update: { label: 'Updates', eyebrow: 'Changelog', empty: 'No updates yet.', Icon: Clock3 },
};

const navigationEntityFilters: EntityFilter[] = ['resume', 'update', 'blog', 'project', 'idea'];

const ideaCategories: Array<{ value: IdeaCategory; label: string; Icon: typeof Sparkles }> = [
  { value: 'inspiration', label: '灵感', Icon: Sparkles },
  { value: 'thought', label: '想法', Icon: Brain },
  { value: 'decision', label: '决定', Icon: Scale },
  { value: 'state', label: '状态', Icon: Activity },
  { value: 'event', label: '事件', Icon: CalendarDays },
];

const stateManagedKinds = new Set<ContentKind>(['blog', 'project', 'idea', 'episode']);

const destroyVditor = (editor: Vditor | null) => {
  if (!editor) return;
  const internal = (editor as unknown as { vditor?: { element?: HTMLElement } }).vditor;
  if (internal?.element) editor.destroy();
};

const lifecycleIconFor = (action: LifecycleAction | SeriesLifecycleAction) => {
  switch (action.id) {
    case 'publish':
    case 'publish-all':
      return <Send size={13} />;
    case 'unpublish':
    case 'unpublish-all':
    case 'hide':
      return <EyeOff size={13} />;
    case 'archive':
    case 'archive-all':
      return <Archive size={13} />;
    case 'restore':
      return <RotateCcw size={13} />;
    case 'show':
      return <Eye size={13} />;
    case 'activate':
    case 'experiment':
    case 'validate':
    case 'hypothesis':
      return <PlayCircle size={13} />;
    case 'pause':
      return <PauseCircle size={13} />;
    case 'complete':
    case 'conclude':
      return <CheckCircle2 size={13} />;
    case 'cancel':
      return <X size={13} />;
    default:
      return null;
  }
};

export default function App() {
  const [documents, setDocuments] = React.useState<EditorDocument[]>([]);
  const [entityCounts, setEntityCounts] = React.useState<Map<EntityFilter, number>>(() => new Map());
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [deploymentPlan, setDeploymentPlan] = React.useState<DeploymentPlan | null>(null);
  const [activityPage, setActivityPage] = React.useState<0 | 1>(0);
  const [deliveryPage, setDeliveryPage] = React.useState<0 | 1>(0);
  const [refreshingWorkspace, setRefreshingWorkspace] = React.useState(false);
  const [selectedCommitDay, setSelectedCommitDay] = React.useState<{ date: string; scopes: VersionScope[] } | null>(null);
  const [selectedTrafficDate, setSelectedTrafficDate] = React.useState<string | null>(null);
  const [freshnessTick, setFreshnessTick] = React.useState(0);
  const [deployingContent, setDeployingContent] = React.useState(false);
  const [deployVerification, setDeployVerification] = React.useState<DeployVerificationResult | null>(null);
  const [momentsSettings, setMomentsSettings] = React.useState<MomentsSettings | null>(null);
  const [screen, setScreen] = React.useState<'dashboard' | 'content'>('dashboard');
  const [selectedId, setSelectedId] = React.useState('');
  const [languageByDocument, setLanguageByDocument] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState('');
  const [entityFilter, setEntityFilter] = React.useState<EntityFilter>('all');
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingRefresh, setConfirmingRefresh] = React.useState(false);
  const [capturePhase, setCapturePhase] = React.useState<CapturePhase>('closed');
  const [captureOrigin, setCaptureOrigin] = React.useState({ x: 0, y: 0 });
  const [captureTarget, setCaptureTarget] = React.useState<CaptureTarget>('idea');
  const [captureNote, setCaptureNote] = React.useState('');
  const [captureCategory, setCaptureCategory] = React.useState<IdeaCategory>('inspiration');
  const [captureError, setCaptureError] = React.useState<string | null>(null);
  const [contentEditorOpen, setContentEditorOpen] = React.useState(false);
  // Typora-style: the toolbar is a setting, hidden by default — formatting
  // happens by typing Markdown syntax and native shortcuts (⌘B, ⌘I…).
  const [toolbarVisible, setToolbarVisible] = React.useState(
    () => window.localStorage.getItem('sv-editor-toolbar') === '1',
  );
  const [selectedSeriesId, setSelectedSeriesId] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [creatingProject, setCreatingProject] = React.useState(false);
  const [newProjectTitle, setNewProjectTitle] = React.useState('');
  const [newProjectSubmitting, setNewProjectSubmitting] = React.useState(false);
  const [newProjectError, setNewProjectError] = React.useState<string | null>(null);
  const [syncingStats, setSyncingStats] = React.useState(false);
  const [statsSyncError, setStatsSyncError] = React.useState<string | null>(null);
  const [versionStatus, setVersionStatus] = React.useState<VersionStatus | null>(null);
  const [shelfVersionStatus, setShelfVersionStatus] = React.useState<VersionStatus | null>(null);
  const [versionLoading, setVersionLoading] = React.useState(false);
  const [releasingScope, setReleasingScope] = React.useState<VersionScope | ''>('');
  const [versionError, setVersionError] = React.useState<string | null>(null);
  const [versionPanelOpen, setVersionPanelOpen] = React.useState(false);
  const [mediaDragActive, setMediaDragActive] = React.useState(false);
  const [mediaImporting, setMediaImporting] = React.useState(false);
  const [mediaDropError, setMediaDropError] = React.useState<string | null>(null);
  const [lastImportedAsset, setLastImportedAsset] = React.useState<ImportedMediaAsset | null>(null);
  const [geoPanelOpen, setGeoPanelOpen] = React.useState(false);
  const [geoInsights, setGeoInsights] = React.useState<GeoInsightReport | null>(null);
  const [geoLoading, setGeoLoading] = React.useState(false);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [stateSavingId, setStateSavingId] = React.useState('');
  const [seriesEditingSlug, setSeriesEditingSlug] = React.useState('');
  const [seriesSource, setSeriesSource] = React.useState<EpisodeSeriesSource | null>(null);
  const [seriesDraft, setSeriesDraft] = React.useState<EpisodeSeriesInput>({
    title: '',
    description: '',
    cover_url: '',
    status: 'ongoing',
  });
  const [seriesEditorLoading, setSeriesEditorLoading] = React.useState(false);
  const [seriesEditorSaving, setSeriesEditorSaving] = React.useState(false);
  const [seriesEditorError, setSeriesEditorError] = React.useState<string | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<Vditor | null>(null);
  const captureInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const newProjectInputRef = React.useRef<HTMLInputElement | null>(null);

  const entityCountsFromDocuments = (nextDocuments: EditorDocument[]) => {
    const itemIds = new Map<ContentKind, Set<string>>();
    nextDocuments.forEach((document) => {
      if (!itemIds.has(document.entity_type)) itemIds.set(document.entity_type, new Set());
      itemIds.get(document.entity_type)?.add(document.entity_id);
    });
    const counts = new Map<EntityFilter, number>();
    itemIds.forEach((ids, kind) => counts.set(kind, ids.size));
    counts.set('blog', (counts.get('blog') || 0) + (counts.get('episode') || 0));
    counts.set('all', Array.from(itemIds.values()).reduce((total, ids) => total + ids.size, 0));
    return counts;
  };

  const entityCountsFromRows = (rows: EntityCount[]) => {
    const counts = new Map<EntityFilter, number>();
    rows.forEach((row) => counts.set(row.entity_type, row.count));
    counts.set('blog', (counts.get('blog') || 0) + (counts.get('episode') || 0));
    counts.set('all', rows.reduce((total, row) => total + row.count, 0));
    return counts;
  };

  const filtered = React.useMemo(() => documents.filter((document) => {
    const text = [
      document.title,
      document.entity_type,
      document.slug,
      document.role,
      document.series_title,
      document.series_slug,
      ...document.translations.map((translation) => translation.language),
    ].filter(Boolean).join(' ').toLowerCase();
    const belongsToShelf = entityFilter === 'all'
      || document.entity_type === entityFilter
      || (entityFilter === 'blog' && document.entity_type === 'episode');
    return belongsToShelf
      && text.includes(query.trim().toLowerCase());
  }), [documents, entityFilter, query]);

  const contentGroups = React.useMemo(() => {
    const groups = new Map<string, ContentGroup>();
    filtered.filter((document) => document.entity_type !== 'episode').forEach((document) => {
      const id = `${document.entity_type}:${document.entity_id}`;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          kind: document.entity_type,
          title: document.title,
          slug: document.slug,
          status: document.status,
          visibility: document.visibility,
          date: document.date || null,
          pinned: Boolean(document.pinned),
          coverUrl: document.cover_url || undefined,
          documents: [],
          cardKind: document.entity_type === 'blog' ? 'article' : undefined,
        });
      }
      groups.get(id)?.documents.push(document);
    });
    return Array.from(groups.values());
  }, [filtered]);

  const episodeSeries = React.useMemo(() => {
    const seriesMap = new Map<string, {
      id: string;
      title: string;
      slug: string;
      description: string;
      coverUrl: string;
      episodes: Map<string, EpisodeGroup>;
    }>();
    filtered.filter((document) => document.entity_type === 'episode').forEach((document) => {
      const seriesId = document.series_id || document.series_slug || 'unfiled';
      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          id: seriesId,
          title: document.series_title || document.series_slug || 'Unfiled series',
          slug: document.series_slug || seriesId,
          description: document.series_description || '',
          coverUrl: document.series_cover_url || '',
          episodes: new Map(),
        });
      }
      const series = seriesMap.get(seriesId);
      if (series && !series.coverUrl && document.series_cover_url) {
        series.coverUrl = document.series_cover_url;
      }
      if (!series?.episodes.has(document.entity_id)) {
        series?.episodes.set(document.entity_id, {
          id: document.entity_id,
          kind: 'episode',
          title: document.title,
          slug: document.slug,
          status: document.status,
          visibility: document.visibility,
          date: document.date || null,
          pinned: Boolean(document.pinned),
          episodeNumber: document.episode_number,
          documents: [],
        });
      }
      series?.episodes.get(document.entity_id)?.documents.push(document);
    });
    return Array.from(seriesMap.values()).map((series): EpisodeSeries => ({
      id: series.id,
      title: series.title,
      slug: series.slug,
      description: series.description || null,
      coverUrl: series.coverUrl || null,
      episodes: Array.from(series.episodes.values()).sort(
        (left, right) => (left.episodeNumber || 0) - (right.episodeNumber || 0),
      ),
    }));
  }, [filtered]);

  const seriesCards = React.useMemo(() => episodeSeries.map((series): ContentGroup | null => {
    const firstEpisode = series.episodes[0];
    if (!firstEpisode) return null;
    const latestEpisode = [...series.episodes].sort(
      (left, right) => (right.episodeNumber || 0) - (left.episodeNumber || 0),
    )[0];
    const lifecycle = seriesLifecycleFor(series.episodes);
    return {
      id: `series:${series.id}`,
      kind: 'episode',
      title: series.title,
      slug: series.slug,
      status: lifecycle.statusLabel,
      visibility: lifecycle.visibilityLabel,
      coverUrl: series.coverUrl || undefined,
      documents: firstEpisode.documents,
      cardKind: 'series',
      episodeCount: series.episodes.length,
      latestEpisode: latestEpisode
        ? { title: latestEpisode.title, episodeNumber: latestEpisode.episodeNumber }
        : undefined,
    };
  }).filter((group): group is ContentGroup => group !== null), [episodeSeries]);

  const selectedSeries = React.useMemo(() => (
    episodeSeries.find((series) => `series:${series.id}` === selectedSeriesId) || null
  ), [episodeSeries, selectedSeriesId]);

  const selected = documents.find((document) => document.id === selectedId)
    || filtered[0]
    || null;
  const selectedLanguage = selected
    ? languageByDocument[selected.id]
      || selected.canonical_language
      || selected.translations[0]?.language
      || ''
    : '';
  const selectedTranslation = selected?.translations.find(
    (translation) => translation.language === selectedLanguage,
  ) || selected?.translations[0] || null;
  const dirty = selectedTranslation ? dirtyIds.has(selectedTranslation.id) : false;
  const versionScope = screen === 'content'
    && !contentEditorOpen
    && isVersionScope(entityFilter)
    ? entityFilter
    : null;
  const otherDirtyCount = selected
    ? selected.translations.filter((translation) => translation.id !== selectedTranslation?.id && dirtyIds.has(translation.id)).length
    : 0;
  const saveDockState = saving ? 'saving' : saveFailed ? 'error' : dirty ? 'dirty' : 'clean';
  const saveDockHeadline = saving
    ? `Saving ${selectedLanguage} · ${selected?.role}...`
    : saveFailed
      ? 'Save failed. Your changes are still open.'
      : dirty
        ? `Unsaved changes in ${selectedLanguage} · ${selected?.role}`
        : 'Source saved';
  const saveDockSubline = !saving && !saveFailed && otherDirtyCount > 0
    ? `${otherDirtyCount} other unsaved translation${otherDirtyCount > 1 ? 's' : ''}`
    : selectedTranslation?.source_path || 'No source selected';
  const currentShelf = entityMeta[entityFilter];
  const visibleItemCount = React.useMemo(
    () => new Set(filtered.map((document) => `${document.entity_type}:${document.entity_id}`)).size,
    [filtered],
  );
  const contentSummary = entityFilter === 'blog'
    ? `${contentGroups.filter((group) => group.kind === 'blog').length} articles · ${episodeSeries.length} series · ${episodeSeries.reduce((total, series) => total + series.episodes.length, 0)} episodes · ${filtered.length} Markdown parts`
    : entityFilter === 'episode'
    ? `${episodeSeries.length} series · ${visibleItemCount} episodes · ${filtered.length} Markdown parts`
    : `${visibleItemCount} items · ${filtered.length} Markdown parts`;
  const statsSyncedAt = dashboard?.stats_synced_at || null;
  const workspaceRefreshLabel = React.useMemo(
    () => formatSyncedAgo(statsSyncedAt).replace(/^Synced /, ''),
    [statsSyncedAt, freshnessTick],
  );
  const hasSyncedStats = Boolean(statsSyncedAt);
  const displayedViews = hasSyncedStats
    ? dashboard?.deployed_views ?? 0
    : dashboard?.total_views ?? 0;
  const displayedLikes = hasSyncedStats
    ? dashboard?.deployed_likes ?? 0
    : dashboard?.total_likes ?? 0;
  const displayedComments = hasSyncedStats
    ? dashboard?.deployed_comments ?? 0
    : dashboard?.total_comments ?? 0;
  const displayedHumanInteractions = hasSyncedStats
    ? dashboard?.deployed_human_interactions ?? 0
    : dashboard?.human_interactions ?? 0;
  const displayedAiCrawlerInteractions = hasSyncedStats
    ? dashboard?.deployed_ai_crawler_interactions ?? 0
    : dashboard?.ai_crawler_interactions ?? 0;
  const displayedSearchCrawlerInteractions = hasSyncedStats
    ? dashboard?.deployed_search_crawler_interactions ?? 0
    : dashboard?.search_crawler_interactions ?? 0;
  const displayedCrawlerInteractions = hasSyncedStats
    ? displayedAiCrawlerInteractions + displayedSearchCrawlerInteractions
    : dashboard?.crawler_interactions ?? 0;
  const displayedAiChatReferrals = hasSyncedStats
    ? dashboard?.deployed_ai_chat_referrals ?? 0
    : 0;
  const selectedCommitItems = selectedCommitDay
    ? (dashboard?.recent_items || []).filter((item) => {
        const scope = item.entity_type === 'episode' ? 'blog' : item.entity_type;
        return selectedCommitDay.scopes.includes(scope as VersionScope);
      })
    : [];
  const selectedTrafficDay = selectedTrafficDate
    ? dashboard?.daily_visits.find((day) => day.date === selectedTrafficDate) || null
    : null;
  const activityFilterLabel = selectedTrafficDay
    ? `${selectedTrafficDay.date} · Human traffic · ${selectedTrafficDay.visits} visits`
    : selectedCommitDay
      ? `${selectedCommitDay.date} · ${selectedCommitDay.scopes.join(' · ') || 'Content'}`
      : 'All content · Latest activity';

  React.useEffect(() => {
    if (loading || filtered.length === 0) return;
    if (!selectedId || !filtered.some((document) => document.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, loading, selectedId]);

  React.useEffect(() => {
    setSaveFailed(false);
  }, [selectedTranslation?.id]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setFreshnessTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (capturePhase === 'editing' || capturePhase === 'failed') {
      captureInputRef.current?.focus();
    }
  }, [capturePhase]);

  React.useEffect(() => {
    if (creatingProject) {
      newProjectInputRef.current?.focus();
    }
  }, [creatingProject]);

  React.useEffect(() => {
    if (!contentEditorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContentEditorOpen(false);
        return;
      }
      // Typora muscle memory: ⌘S / Ctrl+S saves the open translation.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveSelectedRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contentEditorOpen]);

  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDocuments = await invoke<EditorDocument[]>('list_documents');
      setDocuments(nextDocuments);
      setEntityCounts(entityCountsFromDocuments(nextDocuments));
      setSelectedId((current) => (
        current && nextDocuments.some((document) => document.id === current)
          ? current
          : nextDocuments[0]?.id || ''
      ));
      setLanguageByDocument((current) => {
        const next: Record<string, string> = {};
        nextDocuments.forEach((document) => {
          next[document.id] = current[document.id]
            || document.canonical_language
            || document.translations[0]?.language
            || '';
        });
        return next;
      });
      setDirtyIds(new Set());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntityCounts = React.useCallback(async () => {
    try {
      setEntityCounts(entityCountsFromRows(await invoke<EntityCount[]>('get_entity_counts')));
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const loadDashboard = React.useCallback(async () => {
    try {
      setDashboard(await invoke<DashboardData>('get_dashboard'));
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const loadDeploymentPlan = React.useCallback(async () => {
    try {
      setDeploymentPlan(await invoke<DeploymentPlan>('get_deployment_plan'));
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const deployContent = React.useCallback(async () => {
    if (deployingContent || !deploymentPlan || deploymentPlan.dirty_count > 0) return;
    setDeployingContent(true);
    setDeployVerification(null);
    setError(null);
    try {
      await invoke<DeployRunStatus>('deploy_content');
      const verification = await invoke<DeployVerificationResult>('verify_remote_content');
      setDeployVerification(verification);
      await loadDeploymentPlan();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setDeployingContent(false);
    }
  }, [deployingContent, deploymentPlan, loadDeploymentPlan]);

  const loadMomentsSettings = React.useCallback(async () => {
    try {
      setMomentsSettings(await invoke<MomentsSettings>('get_moments_settings'));
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  React.useEffect(() => {
    void loadEntityCounts();
  }, [loadEntityCounts]);

  React.useEffect(() => {
    if (screen === 'content') void loadDocuments();
  }, [screen, loadDocuments]);

  React.useEffect(() => {
    if (screen === 'dashboard') void loadDashboard();
  }, [screen, loadDashboard]);

  React.useEffect(() => {
    if (screen === 'dashboard') void loadDeploymentPlan();
  }, [screen, loadDeploymentPlan]);

  React.useEffect(() => {
    if (screen === 'content' && entityFilter === 'update') void loadMomentsSettings();
  }, [screen, entityFilter, loadMomentsSettings]);

  React.useEffect(() => {
    if (screen !== 'content' || !hostRef.current || !selected || !selectedTranslation) return;
    // `hostRef` is attached to two different DOM nodes depending on
    // `contentEditorOpen` (the plain editor-frame vs. the content-editor
    // overlay). Neither node identity nor `screen`/`selected.id`
    // necessarily change when the overlay opens on an already-selected
    // document, so `contentEditorOpen` must be a dependency too — otherwise
    // the effect skips and Vditor never mounts into the freshly rendered
    // overlay host, leaving a blank canvas.

    const host = hostRef.current;
    destroyVditor(editorRef.current);
    editorRef.current = null;
    host.innerHTML = '';

    const editor = new Vditor(host, {
      value: selectedTranslation.content,
      mode: 'wysiwyg',
      height: '100%',
      minHeight: 480,
      cache: { enable: false },
      lang: 'en_US',
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
        'quote', 'line', 'code', 'inline-code', 'link', 'table', '|',
        'undo', 'redo',
      ],
      input(value) {
        setDocuments((current) => current.map((document) => (
          document.id === selected.id
            ? {
                ...document,
                translations: document.translations.map((translation) => (
                  translation.id === selectedTranslation.id ? { ...translation, content: value } : translation
                )),
              }
            : document
        )));
        setDirtyIds((current) => new Set(current).add(selectedTranslation.id));
      },
    });

    // Typora behavior: clicking the empty canvas below (or beside) the last
    // block drops the caret at the end of the document so writing just
    // continues — no dead whitespace.
    const focusEndOnCanvasClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isCanvas = target === host
        || target.classList.contains('vditor')
        || target.classList.contains('vditor-content')
        || target.classList.contains('vditor-wysiwyg');
      if (!isCanvas) return;
      const editable = host.querySelector<HTMLElement>('.vditor-wysiwyg .vditor-reset');
      if (!editable) return;
      event.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editable.focus();
    };
    host.addEventListener('mousedown', focusEndOnCanvasClick);

    editorRef.current = editor;
    return () => {
      host.removeEventListener('mousedown', focusEndOnCanvasClick);
      if (editorRef.current === editor) editorRef.current = null;
      destroyVditor(editor);
    };
  }, [screen, selected?.id, selectedTranslation?.id, contentEditorOpen]);

  const openShelf = (filter: EntityFilter) => {
    setEntityFilter(filter);
    setScreen('content');
    setSelectedSeriesId('');
    setContentEditorOpen(false);
  };

  const openContentGroup = (group: ContentGroup) => {
    if (!editableMasonryContentKinds.has(group.kind)) return;
    const primary = selectPrimaryDocument(group);
    if (!primary) return;
    setSelectedId(primary.id);
    setLanguageByDocument((current) => ({
      ...current,
      [primary.id]: current[primary.id]
        || primary.canonical_language
        || primary.translations[0]?.language
        || '',
    }));
    setEntityFilter(group.kind === 'episode' ? 'blog' : group.kind);
    setScreen('content');
    // Opening an episode keeps (or establishes) its series as the screen
    // underneath, so closing the editor returns to the series management
    // view — Blog → Series → Episode unwinds in order. Same id fallback
    // chain as the series tree builder.
    if (group.kind === 'episode') {
      const seriesId = primary.series_id || primary.series_slug || 'unfiled';
      setSelectedSeriesId(`series:${seriesId}`);
    } else {
      setSelectedSeriesId('');
    }
    setContentEditorOpen(true);
  };

  const refreshDocuments = () => {
    if (dirtyIds.size > 0) {
      setConfirmingRefresh(true);
      return;
    }
    void loadDocuments();
  };

  const confirmRefresh = () => {
    setConfirmingRefresh(false);
    void loadDocuments();
  };

  const cancelRefresh = () => setConfirmingRefresh(false);

  const openVersionPanel = async (scope = versionScope) => {
    if (!scope) return;
    if (versionLoading) return;
    setVersionPanelOpen(true);
    setVersionLoading(true);
    setVersionError(null);
    try {
      setVersionStatus(await invoke<VersionStatus>('get_version_status', { scope }));
    } catch (reason) {
      setVersionError(String(reason));
    } finally {
      setVersionLoading(false);
    }
  };

  const closeVersionPanel = () => {
    if (versionLoading || releasingScope) return;
    setVersionPanelOpen(false);
  };

  const releaseCurrentScope = async (scope = versionScope) => {
    if (!scope) return;
    if (versionLoading || releasingScope) return;
    if (dirtyIds.size > 0) {
      setError('Save open Markdown edits before releasing this section.');
      return;
    }
    setReleasingScope(scope);
    setVersionError(null);
    try {
      const nextStatus = await invoke<VersionStatus>('release_scope', { scope });
      setVersionStatus(nextStatus);
      setShelfVersionStatus(nextStatus);
      await loadDocuments();
      if (deploymentPlan) await loadDeploymentPlan();
    } catch (reason) {
      setVersionError(String(reason));
      setVersionPanelOpen(true);
    } finally {
      setReleasingScope('');
    }
  };

  const refreshWorkspace = async () => {
    if (refreshingWorkspace) return;
    if (dirtyIds.size > 0) {
      setConfirmingRefresh(true);
      return;
    }
    setRefreshingWorkspace(true);
    setError(null);
    try {
      if (screen === 'dashboard') {
        setSyncingStats(true);
        setStatsSyncError(null);
        await invoke<StatsSyncReport>('sync_stats');
        await Promise.all([loadDocuments(), loadDashboard(), loadDeploymentPlan()]);
      } else {
        await loadDocuments();
        if (entityFilter === 'update') await loadMomentsSettings();
      }
    } catch (reason) {
      if (screen === 'dashboard') setStatsSyncError(String(reason));
      else setError(String(reason));
    } finally {
      setSyncingStats(false);
      setRefreshingWorkspace(false);
    }
  };

  const openCapture = (target: CaptureTarget) => {
    setCaptureTarget(target);
    setCaptureError(null);
    setCapturePhase('opening');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setCapturePhase('editing'));
    });
  };

  const openCaptureFromTrigger = (
    target: CaptureTarget,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setCaptureOrigin({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
    openCapture(target);
  };

  const requestCaptureClose = () => {
    if (capturePhase === 'submitting') return;
    if (captureNote.trim()) {
      setCapturePhase('confirming-close');
      return;
    }
    setCapturePhase('closing');
  };

  const discardCapture = () => {
    setCaptureNote('');
    setCaptureError(null);
    setCapturePhase('closing');
  };

  const submitCapture = async () => {
    const note = captureNote.trim();
    if (!note || capturePhase === 'submitting') return;
    setCapturePhase('submitting');
    setCaptureError(null);
    try {
      const created = captureTarget === 'update'
        ? await invoke<EditorDocument>('capture_update', { event: note })
        : captureTarget === 'idea'
          ? await invoke<EditorDocument>('capture_idea', { note, category: captureCategory })
          : await invoke<EditorDocument>('capture_blog', { draft: note, category: captureCategory });
      setDocuments((current) => [
        ...current.filter((document) => document.id !== created.id),
        created,
      ]);
      setLanguageByDocument((current) => ({
        ...current,
        [created.id]: created.canonical_language || created.translations[0]?.language || 'en',
      }));
      setSelectedId(created.id);
      setEntityFilter(captureTarget);
      setScreen('content');
      setSelectedSeriesId('');
      // A successful capture is the beginning of authoring, not the end of
      // it. Open every newly created prose item immediately so Blog and Idea
      // captures can be completed and published without hunting for the card.
      setContentEditorOpen(true);
      setCaptureNote('');
      await loadEntityCounts();
      setCapturePhase('closing');
    } catch (reason) {
      setCaptureError(String(reason));
      setCapturePhase('failed');
    }
  };

  const handleCaptureKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestCaptureClose();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitCapture();
    }
  };

  const openNewProject = () => {
    setNewProjectTitle('');
    setNewProjectError(null);
    setCreatingProject(true);
  };

  const cancelNewProject = () => {
    if (newProjectSubmitting) return;
    setCreatingProject(false);
  };

  const submitNewProject = async () => {
    const title = newProjectTitle.trim();
    if (!title || newProjectSubmitting) return;
    setNewProjectSubmitting(true);
    setNewProjectError(null);
    try {
      const created = await invoke<EditorDocument>('create_project', { title });
      setDocuments((current) => [
        ...current.filter((document) => document.id !== created.id),
        created,
      ]);
      setLanguageByDocument((current) => ({
        ...current,
        [created.id]: created.canonical_language || created.translations[0]?.language || 'en',
      }));
      setSelectedId(created.id);
      setEntityFilter('project');
      setScreen('content');
      setSelectedSeriesId('');
      await loadEntityCounts();
      setCreatingProject(false);
    } catch (reason) {
      setNewProjectError(String(reason));
    } finally {
      setNewProjectSubmitting(false);
    }
  };

  const handleNewProjectKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelNewProject();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitNewProject();
    }
  };

  const saveSelected = async () => {
    if (!selected || !selectedTranslation) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await invoke<EditorDocument>('save_document', {
        id: selectedTranslation.id,
        content: selectedTranslation.content,
        expectedRevision: selectedTranslation.revision,
      });
      setDocuments((current) => current.map((document) => {
        if (document.id !== saved.id) return document;
        return {
          ...saved,
          translations: document.translations.map((translation) => {
            if (translation.id === selectedTranslation.id) {
              return saved.translations.find((candidate) => candidate.id === translation.id) || translation;
            }
            if (dirtyIds.has(translation.id)) return translation;
            return saved.translations.find((candidate) => candidate.id === translation.id) || translation;
          }),
        };
      }));
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(selectedTranslation.id);
        return next;
      });
      setSaveFailed(false);
    } catch (reason) {
      setError(String(reason));
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  // Fresh-closure handle for the ⌘S keydown listener: the listener attaches
  // once per overlay open, but `saveSelected` closes over the live document
  // content — without this ref it would save a stale snapshot.
  const saveSelectedRef = React.useRef(saveSelected);
  React.useEffect(() => {
    saveSelectedRef.current = saveSelected;
  });

  const patchSelectedTranslationContent = React.useCallback((content: string) => {
    if (!selected || !selectedTranslation) return;
    setDocuments((current) => current.map((document) => (
      document.id === selected.id
        ? {
            ...document,
            translations: document.translations.map((translation) => (
              translation.id === selectedTranslation.id ? { ...translation, content } : translation
            )),
          }
        : document
    )));
    setDirtyIds((current) => new Set(current).add(selectedTranslation.id));
  }, [selected?.id, selectedTranslation?.id]);

  const insertMarkdownAtCursor = React.useCallback((markdown: string) => {
    if (!selectedTranslation) return;
    const block = `\n\n${markdown.trim()}\n`;
    const editor = editorRef.current;
    if (editor) {
      editor.insertValue(block, true);
      patchSelectedTranslationContent(editor.getValue());
      return;
    }
    patchSelectedTranslationContent(`${selectedTranslation.content}${block}`);
  }, [patchSelectedTranslationContent, selectedTranslation]);

  const importDroppedMedia = React.useCallback(async (paths: string[]) => {
    if (!selectedTranslation) {
      setMediaDropError('Open a Markdown translation before dropping media.');
      return;
    }
    const candidates = paths.filter(Boolean);
    if (candidates.length === 0) return;

    setMediaImporting(true);
    setMediaDropError(null);
    try {
      const imported: ImportedMediaAsset[] = [];
      for (const sourcePath of candidates) {
        imported.push(await invoke<ImportedMediaAsset>('import_media_asset', {
          id: selectedTranslation.id,
          sourcePath,
        }));
      }
      insertMarkdownAtCursor(imported.map((asset) => asset.markdown).join('\n\n'));
      setLastImportedAsset(imported[imported.length - 1] || null);
      if (deploymentPlan) void loadDeploymentPlan();
    } catch (reason) {
      setMediaDropError(String(reason));
    } finally {
      setMediaImporting(false);
    }
  }, [deploymentPlan, insertMarkdownAtCursor, loadDeploymentPlan, selectedTranslation]);

  React.useEffect(() => {
    if (!contentEditorOpen || !isTauri()) {
      setMediaDragActive(false);
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === 'enter' || payload.type === 'over') {
        setMediaDragActive(Boolean(selectedTranslation));
        return;
      }
      if (payload.type === 'leave') {
        setMediaDragActive(false);
        return;
      }
      if (payload.type === 'drop') {
        setMediaDragActive(false);
        void importDroppedMedia(payload.paths);
      }
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    }).catch((reason) => {
      setMediaDropError(String(reason));
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [contentEditorOpen, importDroppedMedia, selectedTranslation]);

  const openGeoPanel = async () => {
    if (!selectedTranslation || geoLoading) return;
    setGeoPanelOpen(true);
    setGeoLoading(true);
    setGeoError(null);
    try {
      setGeoInsights(await invoke<GeoInsightReport>('get_geo_insights', { id: selectedTranslation.id }));
    } catch (reason) {
      setGeoError(String(reason));
    } finally {
      setGeoLoading(false);
    }
  };

  React.useEffect(() => {
    setGeoInsights(null);
    setGeoError(null);
    setMediaDropError(null);
    setLastImportedAsset(null);
  }, [selectedTranslation?.id]);

  const toggleToolbar = () => setToolbarVisible((current) => {
    const next = !current;
    window.localStorage.setItem('sv-editor-toolbar', next ? '1' : '0');
    return next;
  });

  const stateTargetForGroup = (group: ContentGroup) => {
    const document = selectPrimaryDocument(group);
    const translation = document?.translations.find((item) => item.language === document.canonical_language)
      || document?.translations[0]
      || null;
    return { document, translation };
  };

  const mergeSavedDocument = React.useCallback((saved: EditorDocument) => {
    setDocuments((current) => current.map((document) => {
      const sameEntity = document.entity_type === saved.entity_type
        && document.entity_id === saved.entity_id;
      if (document.id === saved.id) return saved;
      if (!sameEntity) return document;
      return {
        ...document,
        status: saved.status,
        visibility: saved.visibility,
      };
    }));
  }, []);

  const saveGroupState = async (group: ContentGroup, state: DocumentStateInput) => {
    if (!stateManagedKinds.has(group.kind)) return;
    const { translation } = stateTargetForGroup(group);
    if (!translation) {
      setError(`No editable source found for ${group.title}`);
      return;
    }
    if (dirtyIds.has(translation.id)) {
      setError('Save the Markdown body before changing publish state.');
      return;
    }

    setStateSavingId(group.id);
    setError(null);
    try {
      const saved = await invoke<EditorDocument>('save_document_state', {
        id: translation.id,
        state,
        expectedRevision: translation.revision,
      });
      mergeSavedDocument(saved);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setStateSavingId('');
    }
  };

  const saveSeriesState = async (series: EpisodeSeries, state: DocumentStateInput) => {
    const targets = series.episodes.map((episode) => ({
      episode,
      ...stateTargetForGroup(episode),
    }));
    const missing = targets.find((target) => !target.translation);
    if (missing) {
      setError(`No editable source found for ${missing.episode.title}`);
      return;
    }
    const dirtyTarget = targets.find((target) => target.translation && dirtyIds.has(target.translation.id));
    if (dirtyTarget) {
      setError(`Save ${dirtyTarget.episode.title} before changing the whole series.`);
      return;
    }

    setStateSavingId(`series:${series.id}`);
    setError(null);
    try {
      for (const target of targets) {
        if (!target.translation) continue;
        const saved = await invoke<EditorDocument>('save_document_state', {
          id: target.translation.id,
          state,
          expectedRevision: target.translation.revision,
        });
        mergeSavedDocument(saved);
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setStateSavingId('');
    }
  };

  const renderStateControls = (group: ContentGroup, variant: 'card' | 'header' = 'card') => {
    if (group.cardKind === 'series') return null;
    if (!stateManagedKinds.has(group.kind)) return null;
    const { translation } = stateTargetForGroup(group);
    const stateDirty = Boolean(translation && dirtyIds.has(translation.id));
    const savingState = stateSavingId === group.id;
    const disabled = savingState || stateDirty || !translation;
    const lifecycle = contentLifecycleFor(group.kind, group.status, group.visibility);
    if (lifecycle.actions.length === 0) return null;

    return (
      <div
        className={`state-controls state-controls--${variant}`}
        title={stateDirty ? 'Save Markdown before changing lifecycle state' : undefined}
      >
        <span className="state-control-summary" aria-label={`${group.title} state`}>
          <span>{lifecycle.statusLabel}</span>
          <span data-visibility={lifecycle.visibility === 'private' ? 'private' : undefined}>{lifecycle.visibilityLabel}</span>
        </span>
        {lifecycle.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            className={`state-action state-action--${action.tone}`}
            title={action.description}
            onClick={() => void saveGroupState(group, action.nextState)}
          >
            {savingState ? <LoaderCircle className="state-spinner" size={13} /> : lifecycleIconFor(action)}
            {action.label}
          </button>
        ))}
      </div>
    );
  };

  const renderSeriesStateControls = (series: EpisodeSeries, variant: 'card' | 'header' = 'card') => {
    const lifecycle = seriesLifecycleFor(series.episodes);
    const savingState = stateSavingId === `series:${series.id}`;
    const stateDirty = series.episodes.some((episode) => {
      const { translation } = stateTargetForGroup(episode);
      return Boolean(translation && dirtyIds.has(translation.id));
    });
    const disabled = savingState || stateDirty || series.episodes.length === 0;

    return (
      <div
        className={`state-controls state-controls--${variant}`}
        title={stateDirty ? 'Save episode Markdown before changing the whole series' : undefined}
      >
        <span className="state-control-summary" aria-label={`${series.title} state`}>
          <span>{lifecycle.statusLabel}</span>
          <span data-visibility={lifecycle.visibility === 'private' ? 'private' : undefined}>{lifecycle.visibilityLabel}</span>
        </span>
        {lifecycle.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            className={`state-action state-action--${action.tone}`}
            title={action.description}
            onClick={() => void saveSeriesState(series, action.nextState)}
          >
            {savingState ? <LoaderCircle className="state-spinner" size={13} /> : lifecycleIconFor(action)}
            {action.label}
          </button>
        ))}
      </div>
    );
  };

  const openSeriesEditor = async (series: EpisodeSeries) => {
    if (seriesEditorLoading || seriesEditorSaving) return;
    setSeriesEditingSlug(series.slug);
    setSeriesSource(null);
    setSeriesDraft({
      title: series.title,
      description: series.description || '',
      cover_url: series.coverUrl || '',
      status: 'ongoing',
    });
    setSeriesEditorError(null);
    setSeriesEditorLoading(true);
    try {
      const source = await invoke<EpisodeSeriesSource>('get_episode_series_source', { slug: series.slug });
      setSeriesSource(source);
      setSeriesDraft({
        title: source.title,
        description: source.description,
        cover_url: source.cover_url,
        status: source.status || 'ongoing',
      });
    } catch (reason) {
      setSeriesEditorError(String(reason));
    } finally {
      setSeriesEditorLoading(false);
    }
  };

  const closeSeriesEditor = () => {
    if (seriesEditorSaving) return;
    setSeriesEditingSlug('');
    setSeriesSource(null);
    setSeriesEditorError(null);
  };

  const saveSeriesEditor = async () => {
    if (!seriesEditingSlug || !seriesSource || seriesEditorSaving) return;
    const next = {
      title: seriesDraft.title.trim(),
      description: seriesDraft.description.trim(),
      cover_url: seriesDraft.cover_url.trim(),
      status: seriesDraft.status.trim() || 'ongoing',
    };
    if (!next.title) {
      setSeriesEditorError('Series title is required.');
      return;
    }
    setSeriesEditorSaving(true);
    setSeriesEditorError(null);
    try {
      const saved = await invoke<EpisodeSeriesSource>('save_episode_series', {
        slug: seriesEditingSlug,
        series: next,
        expectedRevision: seriesSource.revision,
      });
      setSeriesSource(saved);
      setSeriesDraft({
        title: saved.title,
        description: saved.description,
        cover_url: saved.cover_url,
        status: saved.status || 'ongoing',
      });
      await loadDocuments();
      setSeriesEditingSlug('');
    } catch (reason) {
      setSeriesEditorError(String(reason));
    } finally {
      setSeriesEditorSaving(false);
    }
  };

  const renderDocumentRow = (document: EditorDocument, label = document.role) => (
    <button
      type="button"
      key={document.id}
      className={`document-row ${document.id === selected?.id ? 'active' : ''}`}
      onClick={() => setSelectedId(document.id)}
    >
      <FileText size={15} />
      <span className="document-copy">
        <strong>{label}</strong>
        <small>{document.translations.map((translation) => translation.language).join(' / ')}</small>
      </span>
      {document.translations.some((translation) => dirtyIds.has(translation.id)) && <span className="dirty-dot" />}
    </button>
  );

  const isMasonryShelf = masonryContentKinds.has(entityFilter as ContentKind);
  const isResumeShelf = entityFilter === 'resume';
  const isUpdateShelf = entityFilter === 'update';
  const resumeOverview = filtered.find((document) => document.entity_type === 'resume' && document.role === 'summary')
    || filtered.find((document) => document.entity_type === 'resume' && document.role === 'overview')
    || null;
  // Episodes never appear in `contentGroups` (they group under their series),
  // so the editor overlay resolves them from the series tree instead.
  const selectedContentGroup = selected && editableMasonryContentKinds.has(selected.entity_type)
    ? selected.entity_type === 'episode'
      ? episodeSeries
          .flatMap((series) => series.episodes)
          .find((episode) => episode.documents.some((document) => document.id === selected.id)
            || episode.id === selected.entity_id)
        || null
      : contentGroups.find((group) => group.id === `${selected.entity_type}:${selected.entity_id}`) || null
    : null;
  const masonryGroups = isMasonryShelf
    ? entityFilter === 'blog'
      ? arrangeBlogGroupsForGrid([
          ...contentGroups.filter((group) => group.kind === 'blog'),
          ...seriesCards,
        ])
      : contentGroups.filter((group) => group.kind === entityFilter)
    : [];
  const updateGroups = isUpdateShelf
    ? contentGroups.filter((group) => group.kind === 'update')
    : [];
  const updatesShellActive = screen === 'content' && isUpdateShelf && !contentEditorOpen;
  const shelfDockMode = versionScope && versionScope !== 'update'
    ? versionScope
    : null;
  const momentsCoverImage = cssBackgroundImage(momentsSettings?.cover.background_image_url);
  const mainStyle = updatesShellActive && momentsSettings
    ? {
        '--moments-cover-image': momentsCoverImage || undefined,
        '--moments-cover-position': momentsSettings.cover.background_position || 'center 42%',
        '--moments-cover-height': `${momentsSettings.cover.cover_height_px || 420}px`,
      } as React.CSSProperties
    : undefined;
  const scopedReleaseVisible = Boolean(
    versionScope
      && shelfVersionStatus?.scope === versionScope
      && shelfVersionStatus.dirty_count > 0,
  );

  React.useEffect(() => {
    if (!versionScope) {
      setShelfVersionStatus(null);
      return;
    }
    let cancelled = false;
    invoke<VersionStatus>('get_version_status', { scope: versionScope })
      .then((status) => {
        if (!cancelled) setShelfVersionStatus(status);
      })
      .catch(() => {
        if (!cancelled) setShelfVersionStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [versionScope, documents, dirtyIds.size]);

  return (
    <div className={`shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-expanded={sidebarOpen}
      >
        <Menu size={17} />
      </button>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div>
            <div className="brand-title">Silan-Viking</div>
            <div className="brand-subtitle">Personal Context System</div>
          </div>
        </div>

        <nav className="entity-nav" aria-label="Workspace navigation">
          <button
            type="button"
            className={`entity-button ${screen === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setScreen('dashboard');
            }}
          >
            <BarChart3 size={16} />
            <span>Dashboard</span>
            <strong>{dashboard?.pending_comments || 0}</strong>
          </button>
          <div className="nav-rule" />
          {navigationEntityFilters.map((filter) => {
            const { label, Icon } = entityMeta[filter];
            return (
              <button
                type="button"
                key={filter}
                className={`entity-button ${screen === 'content' && entityFilter === filter ? 'active' : ''}`}
                onClick={() => openShelf(filter)}
              >
                <Icon size={16} />
                <span>{label}</span>
                <strong>{entityCounts.get(filter) || 0}</strong>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <label className="search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>
          <div className="source-note">
            <FileText size={14} />
            <span><strong>content/</strong> is the source</span>
            <button
              type="button"
              onClick={() => void refreshWorkspace()}
              disabled={refreshingWorkspace}
              title="Refresh workspace"
              aria-label="Refresh workspace"
            >
              {refreshingWorkspace ? <LoaderCircle size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>
        </div>
      </aside>

      <main
        className={`main ${updatesShellActive ? 'main-updates' : ''}`}
        data-has-moments-background={updatesShellActive && momentsCoverImage ? 'true' : undefined}
        style={mainStyle}
      >
        {!updatesShellActive && (
          <header className="topbar">
            <div className="title-block">
              <div className="eyebrow">{screen === 'dashboard' ? 'Workspace' : currentShelf.eyebrow}</div>
              <h1>{screen === 'dashboard' ? 'Overview' : currentShelf.label}</h1>
              <div className="meta">
                {screen === 'dashboard' ? (
                  <>
                    <span>{displayedHumanInteractions} human interactions</span>
                    <span>{displayedAiCrawlerInteractions} AI · {displayedSearchCrawlerInteractions} search crawler hits</span>
                    <span>{dashboard?.pending_comments || 0} comments to review</span>
                    <span>{dirtyIds.size} unsaved Markdown files</span>
                  </>
                ) : (
                  <>
                    <span>{contentSummary}</span>
                    <span>{dirtyIds.size} unsaved</span>
                    {selected && <span>{docPath(selected)}</span>}
                  </>
                )}
              </div>
            </div>
            {screen === 'content' && !isUpdateShelf && isMasonryShelf && !contentEditorOpen && (
              <div className="library-head-actions">
                {entityFilter === 'blog' && (
                  <button type="button" className="new-entity-button" onClick={() => openCapture('blog')} title="Write blog" aria-label="Write blog">
                    <PencilLine size={15} />
                    <span>New</span>
                  </button>
                )}
                {entityFilter === 'project' && (
                  <button type="button" className="new-entity-button" onClick={openNewProject} title="New project" aria-label="New project">
                    <FolderPlus size={15} />
                    <span>New</span>
                  </button>
                )}
                {entityFilter === 'idea' && (
                  <button type="button" className="new-entity-button" onClick={() => openCapture('idea')} title="Record idea" aria-label="Record idea">
                    <Lightbulb size={15} />
                    <span>New</span>
                  </button>
                )}
              </div>
            )}
          </header>
        )}

        {error && (
          <div className="error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {screen === 'dashboard' ? (
          <section className="dashboard-area">
            <div className="dashboard-grid">
              <section className="activity-summary ds-acrylic" data-ds="">
                <div className="activity-carousel">
                  <div className="activity-carousel-bar">
                    <div className="activity-tabs" role="tablist" aria-label="Site activity views">
                      <button type="button" role="tab" aria-selected={activityPage === 0} onClick={() => setActivityPage(0)}>Sync status</button>
                      <button type="button" role="tab" aria-selected={activityPage === 1} onClick={() => setActivityPage(1)}>Traffic detail</button>
                    </div>
                    <div className="activity-carousel-controls">
                      <button type="button" onClick={() => setActivityPage(activityPage === 0 ? 1 : 0)} aria-label="Previous activity page"><ChevronLeft size={14} /></button>
                      <span>{activityPage + 1} / 2</span>
                      <button type="button" onClick={() => setActivityPage(activityPage === 0 ? 1 : 0)} aria-label="Next activity page"><ChevronRight size={14} /></button>
                    </div>
                  </div>
                  <div className="activity-carousel-page" key={activityPage}>
                    {activityPage === 0 ? (
                      <>
                        <div className="activity-primary">
                          <div className="activity-summary-head">
                            <div className="eyebrow">Site activity</div>
                          </div>
                          <h2>{displayedHumanInteractions}</h2>
                          <p>{hasSyncedStats ? 'human interactions synced from the deployed site' : 'human interactions recorded in the local projection'}</p>
                          <span className="sync-freshness">{formatSyncedAgo(statsSyncedAt)}</span>
                          {statsSyncError && (
                            <div className="dialog-error stats-sync-error" role="alert">
                              <AlertCircle size={13} />
                              <span>{statsSyncError}</span>
                            </div>
                          )}
                        </div>
                        <div className="activity-breakdown">
                          <div><span>Views</span><strong>{displayedViews}</strong></div>
                          <div><span>Likes</span><strong>{displayedLikes}</strong></div>
                          <div><span>Comments</span><strong>{displayedComments}</strong></div>
                          <div><span>Crawlers</span><strong>{displayedCrawlerInteractions}</strong></div>
                          <div><span>AI crawlers</span><strong>{displayedAiCrawlerInteractions}</strong></div>
                          <div><span>Search bots</span><strong>{displayedSearchCrawlerInteractions}</strong></div>
                          <div><span>AI chat</span><strong>{displayedAiChatReferrals}</strong></div>
                        </div>
                      </>
                    ) : (
                      <div className="traffic-detail">
                        <div className="traffic-today">
                          <span>Today</span>
                          <strong>+{dashboard?.today_visits ?? 0}</strong>
                          <p>human visits since 00:00 UTC</p>
                        </div>
                        <div className="traffic-ranking">
                          <span>Top content</span>
                          {(dashboard?.top_content || []).slice(0, 3).map((item) => (
                            <div key={`${item.content_type}-${item.title}`}>
                              <span>{item.title}</span><strong>{item.views}</strong>
                            </div>
                          ))}
                          {!dashboard?.top_content.length && <p>No content traffic yet.</p>}
                        </div>
                        <div className="traffic-ranking">
                          <span>Traffic sources</span>
                          {(dashboard?.top_sources || []).slice(0, 3).map((source) => (
                            <div key={source.source}>
                              <span>{source.source.replace(/_/g, ' ')}</span><strong>{source.visits}</strong>
                            </div>
                          ))}
                          {!dashboard?.top_sources.length && <p>No source traffic yet.</p>}
                        </div>
                        <div className="traffic-ranking traffic-countries">
                          <span>Countries</span>
                          {(dashboard?.top_countries || []).slice(0, 3).map((country) => (
                            <div key={`${country.country_code}-${country.city}-${country.latitude}-${country.longitude}`}>
                              <span title={`Approx. ${country.latitude}, ${country.longitude}`}>
                                {new Intl.DisplayNames(['en'], { type: 'region' }).of(country.country_code) || country.country_code}
                                {country.city && ` · ${country.city}`}
                              </span>
                              <strong>{country.visits}</strong>
                            </div>
                          ))}
                          {!dashboard?.top_countries.length && <p>No country traffic yet.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="attention-panel ds-acrylic" data-ds="">
                <span>Needs attention</span>
                <strong>{dashboard?.pending_comments || 0}</strong>
                <p>comments pending review</p>
              </section>

              <section className="delivery-panel ds-acrylic" data-ds="">
                <div className="activity-carousel-bar delivery-carousel-bar">
                  <div className="activity-tabs" role="tablist" aria-label="Delivery views">
                    <button type="button" role="tab" aria-selected={deliveryPage === 0} onClick={() => setDeliveryPage(0)}>Release activity</button>
                    <button type="button" role="tab" aria-selected={deliveryPage === 1} onClick={() => setDeliveryPage(1)}>Traffic detail</button>
                  </div>
                  <div className="delivery-toolbar">
                    <span>{deliveryPage + 1} / 2</span>
                    <button type="button" onClick={() => setDeliveryPage(deliveryPage === 0 ? 1 : 0)} aria-label="Previous delivery page"><ChevronLeft size={14} /></button>
                    <button type="button" onClick={() => setDeliveryPage(deliveryPage === 0 ? 1 : 0)} aria-label="Next delivery page"><ChevronRight size={14} /></button>
                  </div>
                </div>
                <div className="delivery-carousel-page" key={deliveryPage}>
                  {deliveryPage === 0 ? (
                    deploymentPlan ? (
                      <CommitWall
                        activity={deploymentPlan.commit_activity}
                        selectedDate={selectedCommitDay?.date}
                        onSelect={(date, scopes) => {
                          setSelectedTrafficDate(null);
                          setSelectedCommitDay((current) => current?.date === date ? null : { date, scopes });
                        }}
                      />
                    ) : (
                      <div className="version-loading">
                        <LoaderCircle size={15} />
                        <span>Reading delivery state...</span>
                      </div>
                    )
                  ) : (
                    <TrafficWall
                      activity={dashboard?.daily_visits || []}
                      selectedDate={selectedTrafficDate}
                      onSelect={(date) => {
                        setSelectedCommitDay(null);
                        setSelectedTrafficDate((current) => current === date ? null : date);
                      }}
                    />
                  )}
                </div>
              </section>

              <section className="recent-board ds-acrylic" data-ds="">
                <div className="activity-filter-bar">
                  <span>{activityFilterLabel}</span>
                  {(selectedCommitDay || selectedTrafficDay) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCommitDay(null);
                        setSelectedTrafficDate(null);
                      }}
                      aria-label="Clear activity filter"
                      title="Clear filter"
                    >
                      <X size={13} />
                      Clear
                    </button>
                  )}
                </div>
                {selectedTrafficDay ? (
                  <div className="traffic-result-list activity-result-list">
                    {selectedTrafficDay.content.map((item, index) => (
                      <button type="button" key={`${item.content_type}-${item.title}`} onClick={() => openShelf(item.content_type === 'episode' ? 'blog' : item.content_type as EntityFilter)}>
                        <span>{index + 1}</span>
                        <strong>{item.title}</strong>
                        <small>{item.visits} visits</small>
                        <small>{item.comments} comments total</small>
                      </button>
                    ))}
                    {selectedTrafficDay.content.length === 0 && <p>No content traffic for this date.</p>}
                  </div>
                ) : (
                  <div className="recent-list">
                    {(selectedCommitDay ? selectedCommitItems : dashboard?.recent_items || []).map((item) => (
                      <button
                        type="button"
                        key={`${item.entity_type}-${item.slug}`}
                        className="recent-row"
                        onClick={() => openShelf(item.entity_type === 'episode' ? 'blog' : item.entity_type as EntityFilter)}
                      >
                        <span className={badgeClass(item.entity_type as ContentKind)}>{item.entity_type}</span>
                        <strong>{item.title}</strong>
                        <small>{contentStateSummary(item.entity_type as ContentKind, item.status, item.visibility)}</small>
                      </button>
                    ))}
                    {selectedCommitDay && selectedCommitItems.length === 0 && <p className="activity-empty">No recently indexed content matches this commit scope.</p>}
                  </div>
                )}
              </section>
            </div>
          </section>
        ) : isResumeShelf ? (
          <section className="editor-area resume-editor-area">
            <ResumePage
              overview={resumeOverview}
            />
          </section>
        ) : isUpdateShelf && !contentEditorOpen ? (
          <section className="editor-area updates-editor-area">
            {loading ? (
              <div className="empty">Reading updates...</div>
            ) : (
              <UpdateFeed
                groups={updateGroups}
                empty={currentShelf.empty}
                query={query}
                settings={momentsSettings}
                eyebrow={currentShelf.eyebrow}
                title={currentShelf.label}
                meta={[
                  contentSummary,
                  `${dirtyIds.size} unsaved`,
                  ...(selected ? [docPath(selected)] : []),
                ]}
                onOpen={openContentGroup}
              />
            )}
          </section>
        ) : (
          <section className={`editor-area ${isMasonryShelf ? 'content-editor-area' : ''}`}>
            {isMasonryShelf ? (
              loading ? (
                <div className="empty">Reading Markdown sources...</div>
              ) : selectedSeries ? (
                <SeriesDetail
                  series={selectedSeries}
                  onBack={() => setSelectedSeriesId('')}
                  onEditSeries={(series) => void openSeriesEditor(series)}
                  onEditEpisode={openContentGroup}
                  renderStateControls={renderStateControls}
                  seriesStateControls={renderSeriesStateControls(selectedSeries, 'header')}
                />
              ) : masonryGroups.length === 0 ? (
                <div className="empty content-empty">{query.trim() ? 'No matches for your search.' : currentShelf.empty}</div>
              ) : (
                <div className="content-grid">
                  {masonryGroups.map((group) => (
                    <ContentCard
                      key={group.id}
                      group={group}
                      onOpen={group.cardKind === 'series'
                        ? () => setSelectedSeriesId(group.id)
                        : openContentGroup}
                      stateControls={group.cardKind === 'series'
                        ? renderSeriesStateControls(
                            episodeSeries.find((series) => `series:${series.id}` === group.id)!,
                            'card',
                          )
                        : renderStateControls(group, 'card')}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="workspace">
              <section className="library-panel" aria-label={`${currentShelf.label} content`}>
                <div className="library-head">
                  <div>
                    <span>{currentShelf.label}</span>
                    <strong>{filtered.length} parts</strong>
                  </div>
                  <div className="library-head-actions">
                    {entityFilter === 'project' && (
                      <button type="button" className="new-entity-button" onClick={openNewProject} title="New project" aria-label="New project">
                        <FolderPlus size={15} />
                        <span>New</span>
                      </button>
                    )}
                    {entityFilter === 'idea' && (
                      <button type="button" className="new-entity-button" onClick={() => openCapture('idea')} title="Record idea" aria-label="Record idea">
                        <Lightbulb size={15} />
                        <span>New</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="document-list">
                  {loading ? (
                    <div className="empty">Reading Markdown sources...</div>
                  ) : filtered.length === 0 ? (
                    <div className="empty">{query.trim() ? 'No matches for your search.' : currentShelf.empty}</div>
                  ) : entityFilter === 'episode' ? (
                    episodeSeries.map((series) => (
                      <section className="series-group" key={series.id}>
                        <div className="series-head">
                          <span>{series.title}</span>
                          <strong>{series.episodes.length}</strong>
                        </div>
                        {series.episodes.map((episode) => (
                          <div className="item-group" key={episode.id}>
                            <div className="item-head">
                              <span>Episode {episode.episodeNumber || '?'}</span>
                              <strong>{episode.title}</strong>
                            </div>
                            {episode.documents.map((document) => renderDocumentRow(document))}
                          </div>
                        ))}
                      </section>
                    ))
                  ) : (
                    <>
                      {contentGroups.map((group) => (
                        <section className="item-group" key={group.id}>
                        <div className="item-head">
                          {entityFilter === 'all' && <span className={badgeClass(group.kind)}>{group.kind}</span>}
                          <strong>{group.title}</strong>
                            <small>{contentStateSummary(group.kind, group.status, group.visibility)}</small>
                        </div>
                          {group.documents.map((document) => renderDocumentRow(document))}
                        </section>
                      ))}
                      {entityFilter === 'all' && episodeSeries.map((series) => (
                        <section className="series-group" key={series.id}>
                          <div className="series-head">
                            <span>{series.title}</span>
                            <strong>{series.episodes.length} episodes</strong>
                          </div>
                          {series.episodes.map((episode) => (
                            <div className="item-group" key={episode.id}>
                              <div className="item-head">
                                <span className={badgeClass('episode')}>episode {episode.episodeNumber || '?'}</span>
                                <strong>{episode.title}</strong>
                              </div>
                              {episode.documents.map((document) => renderDocumentRow(document))}
                            </div>
                          ))}
                        </section>
                      ))}
                    </>
                  )}
                </div>
              </section>

              <section className="writing-panel" aria-label="Selected Markdown editor">
                {!selected && !loading ? (
                  <div className="empty large">Select a Markdown Part from the content library.</div>
                ) : selected ? (
                  <>
                    <header className="document-header">
                      <div className="document-identity">
                        <span className={badgeClass(selected.entity_type)}>{selected.entity_type}</span>
                        <div>
                          <h2>{selected.title}</h2>
                        <p>{selected.role} · {selectedTranslation?.source_path}</p>
                      </div>
                    </div>
                    <div className="document-state">
                        <span>{contentLifecycleFor(selected.entity_type, selected.status, selected.visibility).statusLabel}</span>
                        <span data-visibility={contentLifecycleFor(selected.entity_type, selected.status, selected.visibility).visibility === 'private' ? 'private' : undefined}>
                          {contentLifecycleFor(selected.entity_type, selected.status, selected.visibility).visibilityLabel}
                        </span>
                    </div>
                    </header>

                    <div className="editor-frame" data-entity={selected.entity_type} data-toolbar={toolbarVisible ? 'visible' : 'hidden'}>
                      <div className="language-tabs" role="tablist" aria-label="Language representations">
                        {selected.translations.map((translation) => (
                          <button
                            type="button"
                            key={translation.id}
                            className={translation.id === selectedTranslation?.id ? 'active' : ''}
                            onClick={() => setLanguageByDocument((current) => ({
                              ...current,
                              [selected.id]: translation.language,
                            }))}
                          >
                            {translation.language}
                            {dirtyIds.has(translation.id) && <span />}
                          </button>
                        ))}
                      </div>
                      <div ref={hostRef} className="editor-host" />
                    </div>
                  </>
                ) : null}
              </section>
            </div>
            )}
          </section>
        )}

        {screen === 'dashboard' ? (
          <div className="quick-dock" aria-label="Writing shortcuts">
            <button
              type="button"
              className="dock-refresh"
              onClick={() => void refreshWorkspace()}
              disabled={refreshingWorkspace}
              title="Refresh workspace"
            >
              {refreshingWorkspace && <LoaderCircle size={15} />}
              {refreshingWorkspace ? 'Refreshing' : workspaceRefreshLabel}
            </button>
            <button type="button" className="idea-trigger" onClick={(event) => openCaptureFromTrigger('idea', event)}><Lightbulb size={15} />Record idea</button>
            <button type="button" onClick={(event) => openCaptureFromTrigger('update', event)}><Clock3 size={15} />New update</button>
            <button type="button" onClick={openNewProject}><Plus size={15} />New project</button>
            <button type="button" onClick={(event) => openCaptureFromTrigger('blog', event)}><PencilLine size={15} />Write blog</button>
          </div>
        ) : isUpdateShelf && !contentEditorOpen ? (
          <div className="quick-dock moment-dock" aria-label="Moment shortcuts">
            <button type="button" className="idea-trigger" onClick={() => openCapture('idea')}><Lightbulb size={15} />Catch idea</button>
            <button type="button" onClick={() => openCapture('update')}><Clock3 size={15} />New update</button>
            <button type="button" onClick={() => openCapture('blog')}><PencilLine size={15} />Write blog</button>
            <button type="button" onClick={() => void openVersionPanel('update')} title="Open Updates Git version status">
              <GitBranch size={15} />
              Version
            </button>
            {versionScope === 'update' && scopedReleaseVisible && (
              <button
                type="button"
                className="dock-release"
                disabled={releasingScope === 'update'}
                onClick={() => void releaseCurrentScope('update')}
                title="Commit Updates changes locally; use Deploy content to update the website"
              >
                {releasingScope === 'update' ? <LoaderCircle size={15} /> : <Send size={15} />}
                {releasingScope === 'update' ? 'Committing' : 'Commit'}
              </button>
            )}
          </div>
        ) : shelfDockMode ? (
          <div className="quick-dock shelf-action-dock" aria-label={`${currentShelf.label} shortcuts`}>
            {shelfDockMode === 'blog' && (
              <button type="button" className="dock-primary" onClick={() => openCapture('blog')}>
                <PencilLine size={15} />
                Create
              </button>
            )}
            {shelfDockMode === 'project' && (
              <button type="button" className="dock-primary" onClick={openNewProject}>
                <FolderPlus size={15} />
                Create
              </button>
            )}
            {shelfDockMode === 'idea' && (
              <button type="button" className="dock-primary" onClick={() => openCapture('idea')}>
                <Lightbulb size={15} />
                Create
              </button>
            )}
            <button type="button" onClick={() => void openVersionPanel(shelfDockMode)} title={`Open ${currentShelf.label} Git version status`}>
              <GitBranch size={15} />
              Version
            </button>
            {scopedReleaseVisible && (
              <button
                type="button"
                className="dock-release"
                disabled={releasingScope === shelfDockMode}
                onClick={() => void releaseCurrentScope(shelfDockMode)}
                title={`Commit and release ${currentShelf.label} changes only`}
              >
                {releasingScope === shelfDockMode ? <LoaderCircle size={15} /> : <Send size={15} />}
                {releasingScope === shelfDockMode ? 'Committing' : 'Commit'}
              </button>
            )}
          </div>
        ) : isResumeShelf || (isMasonryShelf && !contentEditorOpen) || (isUpdateShelf && !contentEditorOpen) ? null : (
          <div className="save-dock" data-state={saveDockState}>
            <div className="save-dock-copy">
              <span className="save-dock-dot" aria-hidden="true" />
              <div className="save-dock-text">
                <strong>{saveDockHeadline}</strong>
                <span>{saveDockSubline}</span>
              </div>
            </div>
            <button
              className={`primary ${saving ? 'pending' : ''}`}
              type="button"
              disabled={!selected || !dirty || saving}
              onClick={() => void saveSelected()}
            >
              <Save size={16} />
              {saving ? 'Saving' : saveFailed ? 'Retry save' : 'Save Markdown'}
            </button>
          </div>
        )}

        {confirmingRefresh && (
          <RefreshConfirmDialog
            dirtyCount={dirtyIds.size}
            onCancel={cancelRefresh}
            onConfirm={confirmRefresh}
          />
        )}

        {creatingProject && (
          <NewProjectDialog
            title={newProjectTitle}
            onTitleChange={setNewProjectTitle}
            submitting={newProjectSubmitting}
            error={newProjectError}
            inputRef={newProjectInputRef}
            onCancel={cancelNewProject}
            onSubmit={() => void submitNewProject()}
            onKeyDown={handleNewProjectKeyDown}
          />
        )}

        {versionPanelOpen && (
          <div className="dialog-overlay" role="presentation" onClick={closeVersionPanel}>
            <div
              className="dialog-card version-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="version-card-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dialog-headline">
                <div className="new-project-badge">
                  <GitBranch size={17} />
                </div>
                <button
                  type="button"
                  className="dialog-close"
                  onClick={closeVersionPanel}
                  aria-label="Close version status"
                  disabled={versionLoading || Boolean(releasingScope)}
                >
                  <X size={15} />
                </button>
              </div>
              <h3 id="version-card-title">Version management</h3>
              <p>{versionStatus?.scope_label || 'Section'} Git history under content/</p>
              {versionLoading ? (
                <div className="version-loading">
                  <LoaderCircle size={15} />
                  <span>Reading Git status...</span>
                </div>
              ) : versionError ? (
                <div className="dialog-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{versionError}</span>
                </div>
              ) : versionStatus ? (
                <>
                  <div className="version-summary">
                    <div>
                      <span>Branch</span>
                      <strong>{versionStatus.branch}</strong>
                    </div>
                    <div>
                      <span>HEAD</span>
                      <strong>{versionStatus.head}</strong>
                    </div>
                    <div>
                      <span>Changes</span>
                      <strong>{versionStatus.dirty_count}</strong>
                    </div>
                  </div>
                  <section className="version-section">
                    <div className="version-section-head">
                      <span>Working tree</span>
                      <div className="version-section-actions">
                        {versionStatus.dirty_count > 0 && (
                          <button
                            type="button"
                            className="version-release-button"
                            disabled={Boolean(releasingScope)}
                            onClick={() => void releaseCurrentScope(versionStatus.scope)}
                          >
                            {releasingScope === versionStatus.scope ? <LoaderCircle size={13} /> : <Send size={13} />}
                            {releasingScope === versionStatus.scope ? 'Committing' : 'Commit'}
                          </button>
                        )}
                      </div>
                    </div>
                    {versionStatus.changes.length === 0 ? (
                      <div className="version-empty">Clean working tree.</div>
                    ) : (
                      <div className="version-change-list">
                        {versionStatus.changes.map((change) => (
                          <div className="version-change-row" key={`${change.status}:${change.path}`}>
                            <span>{change.status}</span>
                            <strong>{change.path}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="version-section">
                    <div className="version-section-head">
                      <span>Recent commits</span>
                    </div>
                    <div className="version-commit-list">
                      {versionStatus.recent_commits.map((commit) => (
                        <div className="version-commit-row" key={commit.hash}>
                          <code>{commit.hash}</code>
                          <strong>{commit.subject}</strong>
                          <span>{commit.relative_time}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        )}

        {seriesEditingSlug && (
          <div className="dialog-overlay" role="presentation" onClick={closeSeriesEditor}>
            <div
              className="dialog-card series-editor-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="series-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="new-project-badge">
                <Radio size={17} />
              </div>
              <h3 id="series-editor-title">Edit series</h3>
              <p>{seriesSource?.relative_path || `content/resources/episode/${seriesEditingSlug}/series.toml`}</p>
              <label className="series-editor-field">
                <span>Title</span>
                <input
                  className="dialog-input"
                  type="text"
                  value={seriesDraft.title}
                  onChange={(event) => setSeriesDraft((current) => ({ ...current, title: event.target.value }))}
                  disabled={seriesEditorLoading || seriesEditorSaving}
                />
              </label>
              <label className="series-editor-field">
                <span>Description</span>
                <textarea
                  value={seriesDraft.description}
                  onChange={(event) => setSeriesDraft((current) => ({ ...current, description: event.target.value }))}
                  disabled={seriesEditorLoading || seriesEditorSaving}
                  rows={4}
                />
              </label>
              <label className="series-editor-field">
                <span>Cover URL</span>
                <input
                  className="dialog-input"
                  type="text"
                  value={seriesDraft.cover_url}
                  onChange={(event) => setSeriesDraft((current) => ({ ...current, cover_url: event.target.value }))}
                  disabled={seriesEditorLoading || seriesEditorSaving}
                  placeholder="silan://resources/episode/series/assets/cover.png"
                />
              </label>
              <label className="series-editor-field">
                <span>Status</span>
                <input
                  className="dialog-input"
                  type="text"
                  value={seriesDraft.status}
                  onChange={(event) => setSeriesDraft((current) => ({ ...current, status: event.target.value }))}
                  disabled={seriesEditorLoading || seriesEditorSaving}
                />
              </label>
              {seriesEditorError && (
                <div className="dialog-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{seriesEditorError}</span>
                </div>
              )}
              <div className="dialog-actions">
                <button type="button" className="cancel" disabled={seriesEditorSaving} onClick={closeSeriesEditor}>Cancel</button>
                <button
                  type="button"
                  className={`primary ${seriesEditorSaving ? 'pending' : ''}`}
                  disabled={!seriesSource || !seriesDraft.title.trim() || seriesEditorLoading || seriesEditorSaving}
                  onClick={() => void saveSeriesEditor()}
                >
                  {seriesEditorSaving || seriesEditorLoading ? <LoaderCircle size={15} /> : <Save size={15} />}
                  {seriesEditorLoading ? 'Loading' : seriesEditorSaving ? 'Saving' : 'Save series'}
                </button>
              </div>
            </div>
          </div>
        )}

        {contentEditorOpen && selectedContentGroup && selected && editableMasonryContentKinds.has(selected.entity_type) && (
          <section
            className="content-editor-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-editor-title"
          >
            <div className="content-editor-shell">
              <header className="content-editor-header">
                <div className="content-editor-title">
                  <span className={badgeClass(selected.entity_type)}>{selected.entity_type}</span>
                  <div>
                    <h2 id="content-editor-title">{selectedContentGroup.title}</h2>
                    <p>
                      {selected.entity_type === 'episode' && selected.series_title
                        ? `${selected.series_title} · Episode ${selected.episode_number ?? '?'} · `
                        : ''}
                      {selectedContentGroup.slug} · {selectedContentGroup.documents.length} Markdown parts
                    </p>
                  </div>
                </div>
                <div className="content-editor-actions">
                  {renderStateControls(selectedContentGroup, 'header')}
                  <button
                    type="button"
                    className={`content-close content-geo-toggle ${geoPanelOpen ? 'active' : ''}`}
                    onClick={() => void openGeoPanel()}
                    title="Run AI/GEO content check"
                    aria-label="Run AI/GEO content check"
                    disabled={!selectedTranslation || geoLoading}
                  >
                    {geoLoading ? <LoaderCircle size={15} /> : <Bot size={15} />}
                  </button>
                  <button
                    type="button"
                    className={`content-close content-toolbar-toggle ${toolbarVisible ? 'active' : ''}`}
                    aria-pressed={toolbarVisible}
                    onClick={toggleToolbar}
                    title={toolbarVisible ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                    aria-label={toolbarVisible ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                  >
                    <Type size={15} />
                  </button>
                  <button
                    type="button"
                    className={`content-save ${saving ? 'pending' : ''}`}
                    disabled={!dirty || saving}
                    onClick={() => void saveSelected()}
                  >
                    {saving ? <LoaderCircle size={15} /> : <Save size={15} />}
                    {saving ? 'Saving' : saveFailed ? 'Retry' : 'Save'}
                  </button>
                </div>
              </header>

              <button type="button" className="content-close content-close-top" onClick={() => setContentEditorOpen(false)} aria-label="Close content editor">
                <X size={18} />
              </button>

              <div className="content-editor-body">
                <aside className="content-part-rail" aria-label="Content Markdown parts">
                  {selected.entity_type === 'episode' && selectedSeries && (
                    <div className="content-episode-rail" role="navigation" aria-label="Series episodes">
                      <div className="content-part-rail-head">
                        <span>{selectedSeries.title}</span>
                        <strong>{selectedSeries.episodes.length}</strong>
                      </div>
                      {selectedSeries.episodes.map((episode) => (
                        <button
                          type="button"
                          key={episode.id}
                          className={`content-episode-row ${episode.id === selected.entity_id ? 'active' : ''}`}
                          onClick={() => openContentGroup(episode)}
                        >
                          <span className="content-episode-number">
                            {episode.episodeNumber != null ? `#${episode.episodeNumber}` : '·'}
                          </span>
                          <span className="content-episode-title">{episode.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="content-part-rail-head">
                    <span>Parts</span>
                    <strong>{selectedContentGroup.documents.length}</strong>
                  </div>
                  {selectedContentGroup.documents.map((document) => renderDocumentRow(document))}
                </aside>

                <section className="content-writing-panel" aria-label="Content Markdown editor">
                  <header className="document-header content-document-header">
                    <div className="document-identity">
                      <FileText size={16} />
                      <div>
                        <h2>{selected.title}</h2>
                        <p>{selected.role} · {selectedTranslation?.source_path}</p>
                      </div>
                    </div>
                    <div className="document-state">
                      {dirty && <span>unsaved</span>}
                      <span>{contentLifecycleFor(selected.entity_type, selected.status, selected.visibility).statusLabel}</span>
                      <span data-visibility={contentLifecycleFor(selected.entity_type, selected.status, selected.visibility).visibility === 'private' ? 'private' : undefined}>
                        {contentLifecycleFor(selected.entity_type, selected.status, selected.visibility).visibilityLabel}
                      </span>
                      {mediaImporting && <span>importing media</span>}
                    </div>
                  </header>

                  <div className="editor-frame content-editor-frame" data-entity={selected.entity_type} data-toolbar={toolbarVisible ? 'visible' : 'hidden'}>
                    <div className="language-tabs" role="tablist" aria-label="Language representations">
                      {selected.translations.map((translation) => (
                        <button
                          type="button"
                          key={translation.id}
                          className={translation.id === selectedTranslation?.id ? 'active' : ''}
                          onClick={() => setLanguageByDocument((current) => ({
                            ...current,
                            [selected.id]: translation.language,
                          }))}
                        >
                          {translation.language}
                          {dirtyIds.has(translation.id) && <span />}
                        </button>
                      ))}
                    </div>
                    <div ref={hostRef} className="editor-host" />
                  </div>
                  {mediaDragActive && (
                    <div className="media-drop-overlay" role="status">
                      <div>
                        <UploadCloud size={26} />
                        <strong>Drop into {selected.role}</strong>
                        <span>assets/ · silan:// Markdown</span>
                      </div>
                    </div>
                  )}
                  {(mediaImporting || mediaDropError || lastImportedAsset) && (
                    <div className="media-import-toast" data-state={mediaDropError ? 'error' : mediaImporting ? 'loading' : 'done'}>
                      {mediaDropError ? <AlertCircle size={14} /> : mediaImporting ? <LoaderCircle size={14} /> : <FileImage size={14} />}
                      <span>
                        {mediaDropError || (mediaImporting ? 'Importing media asset...' : `${lastImportedAsset?.file_name} inserted as silan:// asset`)}
                      </span>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        )}

        {geoPanelOpen && (
          <div className="dialog-overlay" role="presentation" onClick={() => setGeoPanelOpen(false)}>
            <div
              className="dialog-card geo-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="geo-card-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dialog-headline">
                <div className="new-project-badge">
                  <Bot size={17} />
                </div>
                <button
                  type="button"
                  className="dialog-close"
                  onClick={() => setGeoPanelOpen(false)}
                  aria-label="Close GEO insights"
                >
                  <X size={15} />
                </button>
              </div>
              <h3 id="geo-card-title">AI/GEO readiness</h3>
              <p>{selected?.title || 'Selected content'} · {selectedTranslation?.language || ''}</p>
              {geoLoading ? (
                <div className="version-loading">
                  <LoaderCircle size={15} />
                  <span>Reading content structure...</span>
                </div>
              ) : geoError ? (
                <div className="dialog-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{geoError}</span>
                </div>
              ) : geoInsights ? (
                <>
                  <div className="geo-score-row">
                    <strong>{geoInsights.score}</strong>
                    <div>
                      <span>{geoInsights.grade}</span>
                      <p>{geoInsights.summary}</p>
                    </div>
                  </div>
                  <div className="geo-metric-grid">
                    {geoInsights.metrics.map((metric) => (
                      <div key={metric.label} title={metric.detail}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                  <section className="geo-action-list" aria-label="GEO actions">
                    {geoInsights.actions.map((action) => (
                      <div className="geo-action-row" key={`${action.priority}:${action.label}`}>
                        <span>{action.priority}</span>
                        <div>
                          <strong>{action.label}</strong>
                          <p>{action.detail}</p>
                        </div>
                      </div>
                    ))}
                  </section>
                  <div className="dialog-actions">
                    <button type="button" className="cancel" onClick={() => setGeoPanelOpen(false)}>Close</button>
                    <button type="button" className="primary" onClick={() => void openGeoPanel()}>
                      <Bot size={15} />
                      Refresh
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </main>

      <CaptureSheet
        phase={capturePhase}
        origin={captureOrigin}
        target={captureTarget}
        onTargetChange={setCaptureTarget}
        category={captureCategory}
        onCategoryChange={setCaptureCategory}
        categories={ideaCategories}
        note={captureNote}
        onNoteChange={setCaptureNote}
        error={captureError}
        inputRef={captureInputRef}
        onRequestClose={requestCaptureClose}
        onDiscard={discardCapture}
        onKeepWriting={() => setCapturePhase('editing')}
        onSubmit={() => void submitCapture()}
        onKeyDown={handleCaptureKeyDown}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget
            && event.propertyName === 'clip-path'
            && capturePhase === 'closing'
          ) {
            setCapturePhase('closed');
          }
        }}
      />
    </div>
  );
}
