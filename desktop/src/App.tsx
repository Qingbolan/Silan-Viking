import React from 'react';
import { CaptureSubmission } from './lib/captureSubmission';
import type { VideoCoverState } from './lib/videoCover';
import { captureMarkdown } from './lib/captureDraft';
import { AutosaveQueue, mergePersistedTranslations } from './lib/autosaveQueue';
import { EditorRecovery, isSourceConflict, preserveDraftRevision, waitForSave } from './lib/editorRecovery';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  Activity,
  AlertCircle,
  Aperture,
  Archive,
  Bot,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Cog,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileSearch,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  Heart,
  Link2,
  LoaderCircle,
  MessageCircle,
  PencilLine,
  Plus,
  PauseCircle,
  PlayCircle,
  Radio,
  RotateCcw,
  Scale,
  Search,
  Send,
  Sparkles,
  Type,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { CaptureSheet } from './components/CaptureSheet';
import { AiCoverGenerator } from './components/AiCoverGenerator';
import { ArticleDiscoverySettings } from './components/ArticleDiscoverySettings';
import { CommitWall, TrafficWall } from './components/CommitWall';
import { ContentOutline } from './components/ContentOutline';
import { ContentCard } from './components/ContentCard';
import { ContentMasonry } from './components/ContentMasonry';
import { ContentPublishingFields } from './components/ContentPublishingFields';
import {
  ContentRelationManager,
  type ContentReferenceOption,
} from './components/ContentRelationManager';
import { LanguageCloseControls, type LanguageCloseTab } from './components/LanguageCloseControls';
import { LanguageReviewPanel } from './components/LanguageReviewPanel';
import { ReviewSuggestionDialog } from './components/ReviewSuggestionDialog';
import { ModalLayer } from './components/ModalLayer';
import { SectionCommitPanel } from './components/SectionCommitPanel';
import { WorkspaceSwitchNotice } from './components/WorkspaceSwitcher';
import { sectionCommitAvailability } from './lib/sectionCommit';
import {
  classifyRemoteStatusError,
  remoteStatusFailureVisible,
  remoteStatusRetryDelay,
  type RemoteStatusFailure,
} from './lib/remoteStatus';
import { PaidAiUnavailableHint, usePaidAiGate } from './components/PaidAiGate';
import {
  InteractionDetailsPanel,
  type InteractionDetailsState,
} from './components/InteractionDetailsPanel';
import {
  MarkdownDocumentWorkspace,
  type MarkdownWorkspaceActivity,
} from './components/MarkdownDocumentWorkspace';
import { MarkdownWorkspaceViewToggle } from './components/MarkdownWorkspaceViewToggle';
import { ShelfInteractionModeToggle } from './components/ShelfInteractionModeToggle';
import type {
  EditorReviewFinding,
  MarkdownEditorHandle,
  MarkdownImageImport,
  MarkdownSelectionAssistRequest,
} from './components/MarkdownEditor';
import {
  type EditorAssistReference,
  useEditorAssistSlashCommands,
} from './components/editor/useEditorAssistSlashCommands';
import {
  parseMarkdownWorkspaceView,
  type MarkdownWorkspaceView,
} from './lib/markdownWorkspaceView';
import {
  initialShelfInteractionMode,
  managementControlsVisible,
  transitionShelfInteractionMode,
} from './lib/shelfInteractionMode';
import { NewProjectDialog } from './components/NewProjectDialog';
import { DesktopTitlebar } from './components/DesktopTitlebar';
import { WorkspaceSettingsPage } from './components/WorkspaceSettingsPage';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { ResumePage, ResumeMediaField } from './components/ResumePage';
import { RefreshConfirmDialog } from './components/RefreshConfirmDialog';
import { Button } from './components/ds/Button';
import {
  Dialog,
  DialogActions,
  DialogCard,
  DialogDescription,
  DialogTitle,
} from './components/ds/Dialog';
import { Input } from './components/ds/Input';
import { Select } from './components/ds/Select';
import { SeriesDetail } from './components/SeriesDetail';
import { GitChangesPanel } from './components/GitChangesPanel';
import { MomentFeed } from './components/MomentFeed';
import {
  archivableKinds,
  editableMasonryContentKinds,
  isContentKind,
  isVersionScope,
  masonryContentKinds,
  navigationEntityFilters,
  stateManagedKinds,
} from './app/content/contentModel';
import {
  attachmentOnlyCaptureNote,
  counterpartMarkdownLanguage,
  fileBytes,
  inferMarkdownLanguage,
  preferredMarkdownLanguages,
} from './app/content/markdownLanguage';
import {
  automaticDeploymentPullKey,
  clearResolvedSynchronizationError,
  deploymentReadinessFor,
  type DeploymentPlanState,
} from './lib/deploymentReadiness';
import {
  buildDashboardRankingItems,
  dashboardRankingLabels,
  dashboardRankingNoun,
  evidenceEventSourceLabel,
  evidenceSourceLabel,
  formatCountryFlag,
  formatLocationDetail,
  formatLocationLabel,
  groupEvidenceByAgent,
  type DashboardRankingItem,
  type DashboardRankingMetric,
} from './app/dashboard/trafficInsights';
import {
  contentSettingsPagesFor,
  contentSettingsPageTitle,
  defaultArticleAttribution,
  metadataCoverLabel,
  metadataSummaryLabel,
  seriesSettingsPages,
  seriesSettingsPageTitle,
  SettingsPageIntro,
  SettingsPageNavigation,
  type ContentRailMode,
  nextContentRailMode,
  type ContentRailPanel,
  type ContentSettingsPage,
  type RelationTargetKind,
  type SeriesSettingsPage,
} from './app/settings/contentSettings';
import {
  arrangeBlogGroupsForGrid,
  badgeClass,
  docPath,
  groupDocumentsByResource,
  localizeContentGroup,
  localizeEpisodeSeries,
  selectPrimaryDocument,
} from './lib/content';
import {
  contentVisibilityFor,
  contentStateSummary,
  hasDocumentStateChanges,
  seriesVisibilityFor,
  type DocumentStateInput,
  type VisibilityAction,
  type SeriesVisibilityAction,
} from './lib/contentVisibility';
import { inferCoverSourceType, type CoverSourceType } from './lib/coverSource';
import { formatShortDate, formatSyncedAgo } from './lib/format';
import { summarizeMarkdownBlockChanges } from './lib/markdownBlockDiff';
import { cssBackgroundImage, mediaFileNameHeader, toWebviewMediaUrl } from './lib/media';
import {
  languageReviewFindingId,
  useLanguageReviewWorkflow,
} from './lib/languageReviewWorkflow';
import {
  initialReviewSuggestionState,
  reviewSourceEdit,
  reviewSuggestionTransition,
} from './lib/reviewSuggestion';
import {
  countResourcesByShelf,
  filterResourceDocuments,
} from './lib/resourceVisibility';
import { useTranslationSyncWorkflow } from './lib/translationSyncWorkflow';
import { desktopWindowChromeClassName } from './lib/desktopWindow';
import {
  canMoveWorkspaceNavigationHistory,
  createWorkspaceNavigationHistory,
  moveWorkspaceNavigationHistory,
  recordWorkspaceLocation,
  workspaceLocationFrom,
  workspaceLocationKey,
  type WorkspaceLocation,
} from './lib/workspaceNavigation';
import type {
  CapturePhase,
  CaptureTarget,
  ArticleAttribution,
  ContentGroup,
  ContentKind,
  ContentRelation,
  DashboardData,
  DeliverySyncStatus,
  DeploymentPlan,
  DeployRunStatus,
  DeployVerificationResult,
  DocumentLanguageAudit,
  EditorDocument,
  EditorTranslation,
  EntityFilter,
  EpisodeGroup,
  EpisodeSeriesInput,
  EpisodeSeriesSource,
  EpisodeSeries,
  GeoInsightReport,
  IdeaCategory,
  ImportedMediaAsset,
  InteractionDetails,
  LanguageAuditFinding,
  MarkdownSelectionAssistResult,
  MomentsSettings,
  StatsSyncReport,
  VersionStatus,
  VersionScope,
  WorkspacePreferences,
} from './types';

/** Navigation to a reviewed sentence; it only focuses, never edits. */
type PendingReviewFocus = {
  findingId: string;
  sourcePath: string;
  language: string;
};

const entityMeta: Record<EntityFilter, { label: string; eyebrow: string; empty: string; Icon: typeof Folder }> = {
  all: { label: 'Library', eyebrow: 'All content', empty: 'No matching Markdown content.', Icon: Folder },
  blog: { label: 'Blog', eyebrow: 'Articles & posts', empty: 'No blog posts yet. Write the first one.', Icon: BookOpen },
  project: { label: 'Projects', eyebrow: 'Work in progress', empty: 'No projects yet. Create the first one.', Icon: Briefcase },
  idea: { label: 'Legacy', eyebrow: 'Archived source', empty: 'No legacy sources found.', Icon: Archive },
  resume: { label: 'Resume', eyebrow: 'Structured record', empty: 'No resume parts found.', Icon: UserRound },
  episode: { label: 'Episodes', eyebrow: 'Series & episodes', empty: 'No episodes yet.', Icon: Radio },
  moment: { label: 'Moments', eyebrow: 'Timeline', empty: 'No moments yet.', Icon: Aperture },
};

// Labels come from the capture copy so they follow the UI language.
const ideaCategories: Array<{ value: IdeaCategory; Icon: typeof Sparkles }> = [
  { value: 'inspiration', Icon: Sparkles },
  { value: 'thought', Icon: Brain },
  { value: 'decision', Icon: Scale },
  { value: 'state', Icon: Activity },
  { value: 'event', Icon: CalendarDays },
];

const momentTypes = [
  'milestone',
  'achievement',
  'progress',
  'release',
  'announcement',
  'insight',
  'learning',
  'reflection',
] as const;

const momentPriorities = ['high', 'medium', 'low'] as const;

const parseMetadataTags = (value: string) => (
  value
    .split(/[,\n]/)
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter((tag, index, tags) => Boolean(tag) && tags.indexOf(tag) === index)
);

const lifecycleIconFor = (action: VisibilityAction | SeriesVisibilityAction) =>
  action.id === 'make-public' ? <Eye size={13} /> : <EyeOff size={13} />;
const lifecycleButtonVariantFor = (tone: VisibilityAction['tone']) => tone;

export default function App() {
  const [documents, setDocuments] = React.useState<EditorDocument[]>([]);
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [deploymentPlanLoad, setDeploymentPlanLoad] = React.useState<{
    state: DeploymentPlanState;
    plan: DeploymentPlan | null;
    error: string | null;
  }>({ state: 'loading', plan: null, error: null });
  const deploymentPlan = deploymentPlanLoad.plan;
  const [deliverySyncStatus, setDeliverySyncStatus] = React.useState<DeliverySyncStatus | null>(null);
  /** A deployed-status failure shown only after transient retries are exhausted. */
  const [remoteStatusFailure, setRemoteStatusFailure] = React.useState<RemoteStatusFailure | null>(null);
  const [refreshingDeliveryStatus, setRefreshingDeliveryStatus] = React.useState(false);
  const [activityPage, setActivityPage] = React.useState<0 | 1>(0);
  const [deliveryPage, setDeliveryPage] = React.useState<0 | 1 | 2 | 3 | 4>(0);
  const [refreshingWorkspace, setRefreshingWorkspace] = React.useState(false);
  const [selectedCommitDay, setSelectedCommitDay] = React.useState<{ date: string; scopes: VersionScope[] } | null>(null);
  const [selectedTrafficDate, setSelectedTrafficDate] = React.useState<string | null>(null);
  const [dashboardRankingMetric, setDashboardRankingMetric] = React.useState<DashboardRankingMetric | null>(null);
  const [expandedTrafficItem, setExpandedTrafficItem] = React.useState<string | null>(null);
  const [freshnessTick, setFreshnessTick] = React.useState(0);
  const [deployingContent, setDeployingContent] = React.useState(false);
  const [pullingRemoteContent, setPullingRemoteContent] = React.useState(false);
  const attemptedRemotePullsRef = React.useRef<Set<string>>(new Set());
  const [confirmingDeploy, setConfirmingDeploy] = React.useState(false);
  const [deployedStaticRelease, setDeployedStaticRelease] = React.useState<string | null>(null);
  const [deployVerification, setDeployVerification] = React.useState<DeployVerificationResult | null>(null);
  const [momentsSettings, setMomentsSettings] = React.useState<MomentsSettings | null>(null);
  const [workspacePreferences, setWorkspacePreferences] = React.useState<WorkspacePreferences | null>(null);
  const [screen, setScreen] = React.useState<'dashboard' | 'content' | 'settings'>('dashboard');
  const [selectedId, setSelectedId] = React.useState('');
  const [languageByDocument, setLanguageByDocument] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState('');
  const [entityFilter, setEntityFilter] = React.useState<EntityFilter>('all');
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [generatingTranslation, setGeneratingTranslation] = React.useState('');
  const [confirmingRefresh, setConfirmingRefresh] = React.useState(false);
  const captureSubmissionRef = React.useRef(new CaptureSubmission());
  const [capturePhase, setCapturePhase] = React.useState<CapturePhase>('closed');
  const [captureOrigin, setCaptureOrigin] = React.useState({ x: 0, y: 0 });
  const [captureTarget, setCaptureTarget] = React.useState<CaptureTarget>('moment');
  const [captureNote, setCaptureNote] = React.useState('');
  const [captureTitle, setCaptureTitle] = React.useState('');
  const [captureAttachments, setCaptureAttachments] = React.useState<File[]>([]);
  const [captureCovers, setCaptureCovers] = React.useState(new Map<File, VideoCoverState>());
  const setCaptureCover = React.useCallback((file: File, cover: VideoCoverState) => {
    setCaptureCovers(current => new Map(current).set(file, cover));
  }, []);
  const [captureCategory, setCaptureCategory] = React.useState<IdeaCategory>('inspiration');
  const [captureError, setCaptureError] = React.useState<string | null>(null);
  const [chromeLanguage, setChromeLanguage] = React.useState('en');
  const [resumeLanguage, setResumeLanguage] = React.useState('en');
  const [shelfInteractionMode, dispatchShelfInteractionMode] = React.useReducer(
    transitionShelfInteractionMode,
    initialShelfInteractionMode,
  );
  const [contentEditorOpen, setContentEditorOpen] = React.useState(false);
  const [contentRailPanel, setContentRailPanel] = React.useState<ContentRailPanel>('parts');
  const [contentRailMode, setContentRailMode] = React.useState<ContentRailMode>('files');
  const [interactionRailSection, setInteractionRailSection] = React.useState<'likers' | 'comments'>('likers');
  const [contentSettingsPage, setContentSettingsPage] = React.useState<ContentSettingsPage>('overview');
  const [metadataDraft, setMetadataDraft] = React.useState<{
    title: string;
    description: string;
    cover_url: string;
    cover_source_type: CoverSourceType;
    cover_website_url: string;
    is_featured: boolean;
    github_url: string;
    demo_url: string;
    article_attribution: ArticleAttribution;
    moment_type: string;
    priority: string;
    tags: string;
  }>({
    title: '',
    description: '',
    cover_url: '',
    cover_source_type: 'image',
    cover_website_url: '',
    is_featured: false,
    github_url: '',
    demo_url: '',
    article_attribution: defaultArticleAttribution(),
    moment_type: 'progress',
    priority: 'medium',
    tags: '',
  });
  const [metadataSavingId, setMetadataSavingId] = React.useState('');
  const [publishingDraft, setPublishingDraft] = React.useState<DocumentStateInput>({

    visibility: 'private',
    pinned: false,
  });
  const [metadataError, setMetadataError] = React.useState<string | null>(null);
  const [metadataCoverBusy, setMetadataCoverBusy] = React.useState(false);
  const [metadataCoverError, setMetadataCoverError] = React.useState<string | undefined>(undefined);
  const [metadataCoverLocalPreview, setMetadataCoverLocalPreview] = React.useState('');
  const [relationshipBusy, setRelationshipBusy] = React.useState('');
  /** Explains a resource created by a conversion: it exists locally and is not committed. */
  const [creationNotice, setCreationNotice] = React.useState<string | null>(null);
  const [relationshipError, setRelationshipError] = React.useState<string | null>(null);
  const [relationshipTargetKind, setRelationshipTargetKind] = React.useState<RelationTargetKind>('blog');
  const [relationshipTargetSlug, setRelationshipTargetSlug] = React.useState('');
  const [interactionDetailsState, setInteractionDetailsState] = React.useState<InteractionDetailsState>({ status: 'loading' });
  const [interactionDetailsRefreshing, setInteractionDetailsRefreshing] = React.useState(false);
  const [commentVisibilityPendingId, setCommentVisibilityPendingId] = React.useState('');
  const [commentVisibilityError, setCommentVisibilityError] = React.useState<string | null>(null);
  const interactionDetailsRequestRef = React.useRef(0);
  // Typora-style: the toolbar is a setting, hidden by default — formatting
  // happens by typing Markdown syntax and native shortcuts (⌘B, ⌘I…).
  const [toolbarVisible, setToolbarVisible] = React.useState(
    () => window.localStorage.getItem('sv-editor-toolbar') === '1',
  );
  const [markdownWorkspaceView, setMarkdownWorkspaceView] = React.useState(
    () => parseMarkdownWorkspaceView(window.localStorage.getItem('sv-editor-view')),
  );
  const [selectedSeriesId, setSelectedSeriesId] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [workspaceNavigationHistory, setWorkspaceNavigationHistory] = React.useState(
    () => createWorkspaceNavigationHistory({ kind: 'dashboard' }),
  );
  const [creatingProject, setCreatingProject] = React.useState(false);
  const [newProjectTitle, setNewProjectTitle] = React.useState('');
  const [newProjectSubmitting, setNewProjectSubmitting] = React.useState(false);
  const [newProjectError, setNewProjectError] = React.useState<string | null>(null);
  const [syncingStats, setSyncingStats] = React.useState(false);
  const [statsSyncError, setStatsSyncError] = React.useState<string | null>(null);
  const [shelfVersionStatus, setShelfVersionStatus] = React.useState<VersionStatus | null>(null);
  /** The section whose version status and commit preview is open. */
  const [commitPanelScope, setCommitPanelScope] = React.useState<VersionScope | null>(null);
  const [mediaDragActive, setMediaDragActive] = React.useState(false);
  const [mediaImporting, setMediaImporting] = React.useState(false);
  const [mediaDropError, setMediaDropError] = React.useState<string | null>(null);
  const [lastImportedAsset, setLastImportedAsset] = React.useState<ImportedMediaAsset | null>(null);
  const [geoPanelOpen, setGeoPanelOpen] = React.useState(false);
  const [geoInsights, setGeoInsights] = React.useState<GeoInsightReport | null>(null);
  const [geoLoading, setGeoLoading] = React.useState(false);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  /** Document whose GEO check runs once its editor is open (dashboard → action). */
  const [pendingGeoDocumentId, setPendingGeoDocumentId] = React.useState<string | null>(null);
  const [stateSavingId, setStateSavingId] = React.useState('');
  const [gitPanelOpen, setGitPanelOpen] = React.useState(false);
  const [seriesEditingSlug, setSeriesEditingSlug] = React.useState('');
  const [seriesSettingsPage, setSeriesSettingsPage] = React.useState<SeriesSettingsPage>('overview');
  const [seriesSource, setSeriesSource] = React.useState<EpisodeSeriesSource | null>(null);
  const [seriesDraft, setSeriesDraft] = React.useState<EpisodeSeriesInput>({
    title: '',
    description: '',
    cover_url: '',

  });
  const [seriesEditorLoading, setSeriesEditorLoading] = React.useState(false);
  const [seriesEditorSaving, setSeriesEditorSaving] = React.useState(false);
  const [seriesEditorError, setSeriesEditorError] = React.useState<string | null>(null);
  const [seriesCoverBusy, setSeriesCoverBusy] = React.useState(false);
  const [seriesCoverError, setSeriesCoverError] = React.useState<string | undefined>(undefined);
  const [seriesCoverLocalPreview, setSeriesCoverLocalPreview] = React.useState('');
  const [pendingReviewFocus, setPendingReviewFocus] = React.useState<PendingReviewFocus | null>(null);
  const [reviewSuggestion, dispatchReviewSuggestion] = React.useReducer(
    reviewSuggestionTransition,
    initialReviewSuggestionState,
  );
  const editorRef = React.useRef<MarkdownEditorHandle | null>(null);
  const autosaveQueue = React.useRef(new AutosaveQueue()).current;
  const settingsWriteRef = React.useRef<Promise<boolean> | null>(null);
  const recovery = React.useRef(new EditorRecovery(window.localStorage)).current;
  const [sourceConflict, setSourceConflict] = React.useState<{
    id: string; kind: 'markdown' | 'settings'; disk: EditorTranslation | null;
  } | null>(null);
  const conflictRef = React.useRef(false);
  const [conflictReviewOpen, setConflictReviewOpen] = React.useState(true);
  const [closeRecoveryOpen, setCloseRecoveryOpen] = React.useState(false);
  const [recoveryCopies, setRecoveryCopies] = React.useState<ReturnType<EditorRecovery['list']>>([]);
  const [recoveryCopiesOpen, setRecoveryCopiesOpen] = React.useState(false);
  const closingRef = React.useRef(false);
  const documentsRef = React.useRef(documents);
  documentsRef.current = documents;
  const dirtyIdsRef = React.useRef(dirtyIds);
  dirtyIdsRef.current = dirtyIds;
  const savedTranslationContentRef = React.useRef(new Map<string, string>());
  const captureInputRef = React.useRef<MarkdownEditorHandle | null>(null);
  const newProjectInputRef = React.useRef<HTMLInputElement | null>(null);
  const settingsReturnScreenRef = React.useRef<'dashboard' | 'content'>('dashboard');
  const pendingWorkspaceLocationKeyRef = React.useRef<string | null>(null);
  const languageReview = useLanguageReviewWorkflow();
  const paidAi = usePaidAiGate();
  const reviewAvailability = paidAi.availability('reader_review');
  const translationAvailability = paidAi.availability('translation');
  const selectionAssistAvailability = paidAi.availability('selection_edit');
  const translationSync = useTranslationSyncWorkflow();
  const syncingTranslation = (
    translationSync.state.phase === 'saving_source'
    || translationSync.state.phase === 'syncing'
  )
    ? translationSync.state.key || ''
    : '';

  const workspaceLocation = React.useMemo(() => workspaceLocationFrom({
    screen,
    entityFilter,
    selectedDocumentId: selectedId,
    selectedSeriesId,
    editorOpen: contentEditorOpen,
    railMode: contentRailMode,
    railPanel: contentRailPanel,
  }), [
    contentEditorOpen,
    contentRailMode,
    contentRailPanel,
    entityFilter,
    screen,
    selectedId,
    selectedSeriesId,
  ]);
  const workspaceLocationId = workspaceLocationKey(workspaceLocation);

  React.useEffect(() => {
    const pendingLocationKey = pendingWorkspaceLocationKeyRef.current;
    if (pendingLocationKey) {
      if (pendingLocationKey === workspaceLocationId) {
        pendingWorkspaceLocationKeyRef.current = null;
      }
      return;
    }
    setWorkspaceNavigationHistory((current) => (
      recordWorkspaceLocation(current, workspaceLocation)
    ));
  }, [workspaceLocation, workspaceLocationId]);

  const restoreWorkspaceLocation = React.useCallback((location: WorkspaceLocation) => {
    if (location.kind === 'settings') {
      settingsReturnScreenRef.current = screen === 'content' ? 'content' : 'dashboard';
      setSidebarOpen(false);
      setScreen('settings');
      return;
    }

    if (location.kind === 'dashboard') {
      setContentEditorOpen(false);
      setSelectedSeriesId('');
      setScreen('dashboard');
      return;
    }

    setEntityFilter(location.entityFilter);
    setScreen('content');
    if (location.kind === 'shelf') {
      setContentEditorOpen(false);
      setSelectedSeriesId('');
      return;
    }
    if (location.kind === 'series') {
      setContentEditorOpen(false);
      setSelectedSeriesId(location.seriesId);
      return;
    }

    setSelectedId(location.documentId);
    setSelectedSeriesId(location.seriesId);
    setContentRailMode(location.railMode);
    setContentRailPanel(location.railPanel);
    setContentEditorOpen(true);
  }, [screen]);

  const moveWorkspaceHistory = React.useCallback((direction: -1 | 1) => {
    const nextHistory = moveWorkspaceNavigationHistory(workspaceNavigationHistory, direction);
    if (nextHistory === workspaceNavigationHistory) return;
    const destination = nextHistory.entries[nextHistory.index];
    if (!destination) return;
    pendingWorkspaceLocationKeyRef.current = workspaceLocationKey(destination);
    setWorkspaceNavigationHistory(nextHistory);
    restoreWorkspaceLocation(destination);
  }, [restoreWorkspaceLocation, workspaceNavigationHistory]);

  React.useEffect(() => {
    const handleWindowNavigationShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;

      const back = (event.altKey && event.key === 'ArrowLeft')
        || (event.metaKey && event.key === '[');
      const forward = (event.altKey && event.key === 'ArrowRight')
        || (event.metaKey && event.key === ']');
      if (!back && !forward) return;
      event.preventDefault();
      moveWorkspaceHistory(back ? -1 : 1);
    };

    window.addEventListener('keydown', handleWindowNavigationShortcut);
    return () => window.removeEventListener('keydown', handleWindowNavigationShortcut);
  }, [moveWorkspaceHistory]);

  const activeDocuments = React.useMemo(
    () => filterResourceDocuments(documents, { view: 'all' }),
    [documents],
  );
  const privateDocuments = React.useMemo(
    () => filterResourceDocuments(documents, { view: 'private' }),
    [documents],
  );
  const entityCounts = React.useMemo(
    () => countResourcesByShelf(activeDocuments),
    [activeDocuments],
  );
  const filtered = React.useMemo(
    () => filterResourceDocuments(activeDocuments, {
      entityFilter,
      query,
      view: 'all',
    }),
    [activeDocuments, entityFilter, query],
  );
  const contentGroups = React.useMemo(
    () => groupDocumentsByResource(
      filtered.filter((document) => document.entity_type !== 'episode'),
    ),
    [filtered],
  );
  const relationTargetGroups = React.useMemo(() => (
    groupDocumentsByResource(
      activeDocuments.filter((document) => (
        document.entity_type === 'blog' || document.entity_type === 'project'
      )),
    )
  ), [activeDocuments]);
  const relationTargetOptions = React.useMemo<ContentReferenceOption[]>(() => (
    relationTargetGroups
      .map((group) => ({
        kind: group.kind as 'blog' | 'project',
        slug: group.slug,
        title: group.title,

        visibility: group.visibility,
      }))
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title))
  ), [relationTargetGroups]);
  const privateResources = React.useMemo(
    () => groupDocumentsByResource(privateDocuments)
      .filter((group) => archivableKinds.has(group.kind))
      .sort((left, right) => (
        (right.documents[0]?.updated_at || '').localeCompare(left.documents[0]?.updated_at || '')
        || left.title.localeCompare(right.title)
      )),
    [privateDocuments],
  );

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
          description: document.description || null,

          visibility: document.visibility,
          date: document.date || null,
          pinned: Boolean(document.pinned),
          engagement: document.engagement,
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

  const displayContentGroups = React.useMemo(
    () => contentGroups.map((group) => localizeContentGroup(group, chromeLanguage)),
    [contentGroups, chromeLanguage],
  );
  const displayEpisodeSeries = React.useMemo(
    () => episodeSeries.map((series) => localizeEpisodeSeries(series, chromeLanguage)),
    [episodeSeries, chromeLanguage],
  );

  const seriesCards = React.useMemo(() => displayEpisodeSeries.map((series): ContentGroup | null => {
    const firstEpisode = series.episodes[0];
    if (!firstEpisode) return null;
    const latestEpisode = [...series.episodes].sort(
      (left, right) => (right.episodeNumber || 0) - (left.episodeNumber || 0),
    )[0];
    const lifecycle = seriesVisibilityFor(series.episodes);
    return {
      id: `series:${series.id}`,
      kind: 'episode',
      title: series.title,
      slug: series.slug,

      visibility: lifecycle.visibilityLabel,
      coverUrl: series.coverUrl || undefined,
      description: series.description || null,
      language: chromeLanguage,
      documents: firstEpisode.documents,
      engagement: series.episodes.reduce((total, episode) => ({
        likes: total.likes + episode.engagement.likes,
        comments: total.comments + episode.engagement.comments,
      }), { likes: 0, comments: 0 }),
      cardKind: 'series',
      episodeCount: series.episodes.length,
      latestEpisode: latestEpisode
        ? { title: latestEpisode.title, episodeNumber: latestEpisode.episodeNumber }
      : undefined,
    };
  }).filter((group): group is ContentGroup => group !== null), [displayEpisodeSeries, chromeLanguage]);
  const dashboardContentMetadata = React.useMemo(() => {
    const metadata = new Map<string, {
      kind: ContentKind;
      title: string;
      slug: string;
      visibility: string;
      updatedAt: string;
    }>();
    activeDocuments.forEach((document) => {
      if (!isContentKind(document.entity_type)) return;
      const key = `${document.entity_type}:${document.title}`;
      if (!metadata.has(key) || document.updated_at > (metadata.get(key)?.updatedAt || '')) {
        metadata.set(key, {
          kind: document.entity_type,
          title: document.title,
          slug: document.slug,

          visibility: document.visibility,
          updatedAt: document.updated_at,
        });
      }
    });
    return metadata;
  }, [activeDocuments]);
  const editorAssistReferences = React.useMemo<EditorAssistReference[]>(() => {
    const references = new Map<string, EditorAssistReference>();
    activeDocuments.forEach((document) => {
      if (!['blog', 'project', 'moment'].includes(document.entity_type)) return;
      const key = `${document.entity_type}:${document.entity_id}`;
      const current = references.get(key);
      if (current && current.title && current.slug) return;
      references.set(key, {
        id: key,
        kind: document.entity_type,
        title: document.title || document.slug,
        slug: document.slug,
        description: document.description,
      });
    });
    return Array.from(references.values()).sort((left, right) => (
      left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title)
    ));
  }, [activeDocuments]);
  const dashboardEngagementRanking = React.useMemo(() => {
    const groups = new Map<string, {
      kind: ContentKind;
      title: string;
      slug: string;
      visibility: string;
      updatedAt: string;
      likes: number;
      comments: number;
    }>();
    activeDocuments.forEach((document) => {
      if (!editableMasonryContentKinds.has(document.entity_type)) return;
      const key = `${document.entity_type}:${document.entity_id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          kind: document.entity_type,
          title: document.title,
          slug: document.slug,

          visibility: document.visibility,
          updatedAt: document.updated_at,
          likes: document.engagement.likes,
          comments: document.engagement.comments,
        });
      }
    });
    return Array.from(groups.values());
  }, [activeDocuments]);

  const selectedSeries = React.useMemo(() => (
    displayEpisodeSeries.find((series) => `series:${series.id}` === selectedSeriesId) || null
  ), [displayEpisodeSeries, selectedSeriesId]);
  const editingSeries = React.useMemo(() => (
    episodeSeries.find((series) => series.slug === seriesEditingSlug) || null
  ), [episodeSeries, seriesEditingSlug]);

  const selected = filtered.find((document) => document.id === selectedId)
    || filtered[0]
    || null;
  const proseShelfActive = screen === 'content'
    && masonryContentKinds.has(entityFilter as ContentKind)
    && !contentEditorOpen;
  const managementEnabled = managementControlsVisible(shelfInteractionMode);
  const selectedLanguage = selected
    ? languageByDocument[selected.id]
      || selected.canonical_language
      || selected.translations[0]?.language
      || ''
    : '';
  const selectedTranslation = selected?.translations.find(
    (translation) => translation.language === selectedLanguage,
  ) || selected?.translations[0] || null;
  const selectedReviewResult = languageReview.state.report?.results.find((result) => (
    result.source_path === selectedTranslation?.source_path
    && result.language === selectedTranslation.language
  )) || null;
  const selectedReviewFindings: EditorReviewFinding[] = selectedReviewResult
    ? selectedReviewResult.findings.map((finding) => ({
        ...finding,
        id: languageReviewFindingId(selectedReviewResult, finding),
      }))
    : [];
  const selectedEditorLanguages = selected
    ? Array.from(new Set([
      ...preferredMarkdownLanguages,
      ...selected.translations.map((translation) => translation.language),
    ]))
    : preferredMarkdownLanguages;
  const resumeShelfActive = screen === 'content' && entityFilter === 'resume' && !contentEditorOpen;
  const momentShelfActive = screen === 'content' && entityFilter === 'moment' && !contentEditorOpen;
  const selectedLanguageTabs: LanguageCloseTab[] = resumeShelfActive || momentShelfActive || proseShelfActive
    ? [
      { language: 'en' },
      { language: 'zh' },
    ]
    : selected
    ? selectedEditorLanguages.map((language) => {
      const translation = selected.translations.find((item) => item.language === language);
      return {
        language,
        dirty: translation ? dirtyIds.has(translation.id) : false,
        disabled: Boolean(
          syncingTranslation
          || (generatingTranslation && generatingTranslation !== `${selected.id}:${language}`),
        ),
      };
    })
    : [
      { language: 'en' },
      { language: 'zh' },
    ];
  const topControlLanguage = resumeShelfActive
    ? resumeLanguage
    : momentShelfActive || proseShelfActive
      ? chromeLanguage
      : selectedTranslation?.language || chromeLanguage;
  const selectTopControlLanguage = async (language: string) => {
    if (!await flushEditorRef.current()) return;
    if (resumeShelfActive) {
      setResumeLanguage(language);
      return;
    }
    if (momentShelfActive) {
      setChromeLanguage(language);
      setLanguageByDocument((current) => {
        const next = { ...current };
        filtered.forEach((document) => {
          if (document.entity_type === 'moment' && document.translations.some((translation) => translation.language === language)) {
            next[document.id] = language;
          }
        });
        return next;
      });
      return;
    }
    if (proseShelfActive) {
      setChromeLanguage(language);
      setLanguageByDocument((current) => {
        const next = { ...current };
        filtered.forEach((document) => {
          const belongsToShelf = document.entity_type === entityFilter
            || (entityFilter === 'blog' && document.entity_type === 'episode');
          if (belongsToShelf && document.translations.some((translation) => translation.language === language)) {
            next[document.id] = language;
          }
        });
        return next;
      });
      return;
    }
    if (selected?.translations.some((translation) => translation.language === language)) {
      setLanguageByDocument((current) => ({
        ...current,
        [selected.id]: language,
      }));
      return;
    }
    if (selected && preferredMarkdownLanguages.includes(language)) {
      void requestMissingTranslation(language);
      return;
    }
    setChromeLanguage(language);
  };
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
        ? `Autosave pending · ${selectedLanguage} · ${selected?.role}`
        : 'Source saved';
  const saveDockSubline = !saving && !saveFailed && otherDirtyCount > 0
    ? `${otherDirtyCount} other unsaved translation${otherDirtyCount > 1 ? 's' : ''}`
    : selectedTranslation?.source_path || 'No source selected';
  const counterpartLanguage = selectedTranslation
    ? counterpartMarkdownLanguage(selectedTranslation.language)
    : 'zh';
  const counterpartTranslation = selected?.translations.find(
    (translation) => translation.language === counterpartLanguage,
  ) || null;
  const counterpartDirty = counterpartTranslation ? dirtyIds.has(counterpartTranslation.id) : false;
  const aiTranslationBusy = Boolean(syncingTranslation || generatingTranslation);
  const showTranslationSync = Boolean(
    selectedTranslation
    && counterpartLanguage
    && (dirty || !counterpartTranslation),
  );
  const pendingSourceChanges = selectedTranslation
    ? summarizeMarkdownBlockChanges(
        savedTranslationContentRef.current.get(selectedTranslation.id) ?? selectedTranslation.content,
        selectedTranslation.content,
      )
    : null;
  const aiTranslationTitle = selectedTranslation
    ? counterpartTranslation
      ? `Update ${counterpartLanguage} from ${selectedTranslation.language} without rewriting unchanged text`
      : `Create ${counterpartLanguage} from ${selectedTranslation.language}`
    : 'Open a Markdown translation first';
  const translationActivityForSelected = (
    selected
    && translationSync.state.documentId === selected.id
    && translationSync.state.phase !== 'idle'
  );
  const workspaceActivity: MarkdownWorkspaceActivity | null = translationActivityForSelected
    ? (() => {
        const syncState = translationSync.state;
        const sourceAffected = syncState.sourceChanges?.affected || 0;
        const targetAffected = syncState.targetChanges?.affected || 0;
        if (syncState.phase === 'saving_source') {
          return {
            state: 'working',
            label: `Saving ${syncState.sourceLanguage} source`,
            detail: `${sourceAffected} changed Markdown block${sourceAffected === 1 ? '' : 's'}`,
          };
        }
        if (syncState.phase === 'syncing') {
          return {
            state: 'working',
            label: `Syncing ${syncState.sourceLanguage} → ${syncState.targetLanguage}`,
            detail: 'Translating changed blocks while preserving unchanged structure',
          };
        }
        if (syncState.phase === 'failed') {
          return {
            state: 'error',
            label: 'Translation sync failed',
            detail: syncState.error || undefined,
          };
        }
        return {
          state: 'complete',
          label: `${syncState.targetLanguage} synchronized`,
          detail: targetAffected === 0
            ? 'No target Markdown blocks changed'
            : `${targetAffected} target block${targetAffected === 1 ? '' : 's'} updated`,
        };
      })()
    : selectedReviewFindings.length > 0
      ? {
          state: 'review',
          label: `${selectedReviewFindings.length} DeepSeek finding${selectedReviewFindings.length === 1 ? '' : 's'}`,
          detail: 'Click an underlined sentence to inspect the suggested repair',
        }
      : null;
  const renderLanguageCloseControls = ({
    fixed = false,
    disabled = false,
    closeLabel,
    closeTitle,
    closeSize,
    closeText,
    onClose,
  }: {
    fixed?: boolean;
    disabled?: boolean;
    closeLabel: string;
    closeTitle?: string;
    closeSize?: number;
    closeText?: string;
    onClose: () => void;
  }) => (
    <LanguageCloseControls
      fixed={fixed}
      languages={selectedLanguageTabs}
      activeLanguage={topControlLanguage}
      disabled={disabled}
      closeLabel={closeLabel}
      closeTitle={closeTitle}
      closeSize={closeSize}
      closeText={closeText}
      onLanguageSelect={selectTopControlLanguage}
      onClose={onClose}
    />
  );
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
  const localDeliveryCount = deliverySyncStatus?.local_commits ?? 0;
  const remoteDeliveryCount = deliverySyncStatus?.remote_commits ?? 0;
  const attentionCount = localDeliveryCount + remoteDeliveryCount;
  const workspaceChangeCount = deliverySyncStatus?.workspace_changes ?? deploymentPlan?.dirty_count ?? 0;
  const deploymentReadiness = deploymentReadinessFor({
    localCommitCount: deliverySyncStatus ? localDeliveryCount : null,
    remoteCommitCount: remoteDeliveryCount,
    syncState: deliverySyncStatus?.state ?? null,
    remoteFailure: remoteStatusFailure,
    workspaceChangeCount,
    unsavedDocumentCount: dirtyIds.size,
    planState: deploymentPlanLoad.state,
    planError: deploymentPlanLoad.error,
    deploying: deployingContent,
    pulling: pullingRemoteContent,
  });
  const canDeployCommittedContent = deploymentReadiness.canDeploy;
  const visibleRecentItems = (dashboard?.recent_items || []);
  const selectedCommitItems = selectedCommitDay
    ? visibleRecentItems.filter((item) => {
        const scope = item.entity_type === 'episode' ? 'blog' : item.entity_type;
        return selectedCommitDay.scopes.includes(scope as VersionScope);
      })
    : [];
  const trafficMode = deliveryPage === 2 ? 'unique' : deliveryPage === 3 ? 'seo' : deliveryPage === 4 ? 'geo' : 'human';
  const trafficActivity = trafficMode === 'seo'
    ? dashboard?.daily_seo_visits || []
    : trafficMode === 'geo'
      ? dashboard?.daily_geo_visits || []
      : dashboard?.daily_visits || [];
  const selectedTrafficDay = selectedTrafficDate
    ? trafficActivity.find((day) => day.date === selectedTrafficDate) || null
    : null;
  const dashboardRankingItems = React.useMemo((): DashboardRankingItem[] => (
    buildDashboardRankingItems({
      metric: dashboardRankingMetric,
      dashboard,
      contentMetadata: dashboardContentMetadata,
      engagementRanking: dashboardEngagementRanking,
    })
  ), [
    dashboard,
    dashboard?.daily_geo_visits,
    dashboard?.daily_seo_visits,
    dashboard?.top_content,
    dashboardContentMetadata,
    dashboardEngagementRanking,
    dashboardRankingMetric,
  ]);
  const activityFilterLabel = selectedTrafficDay
    ? `${selectedTrafficDay.date} · ${trafficMode === 'human' ? 'Human' : trafficMode === 'unique' ? 'Unique visitors' : trafficMode.toUpperCase()} traffic · ${trafficMode === 'unique' ? selectedTrafficDay.unique_visitors : selectedTrafficDay.visits} ${trafficMode === 'unique' ? 'unique visitors' : 'visits'}`
    : selectedCommitDay
      ? `${selectedCommitDay.date} · ${selectedCommitDay.scopes.join(' · ') || 'Content'}`
      : dashboardRankingMetric
        ? `All content · ${dashboardRankingLabels[dashboardRankingMetric]}`
        : 'All content · Latest activity';

  React.useEffect(() => {
    setExpandedTrafficItem(null);
  }, [selectedTrafficDate, trafficMode]);

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
        event.preventDefault();
        if (checkpointRef.current()) { setContentEditorOpen(false); void flushEditorRef.current(); }
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
      setRecoveryCopies(recovery.list());
      savedTranslationContentRef.current = new Map(
        nextDocuments.flatMap((document) => (
          document.translations.map((translation) => [translation.id, translation.content] as const)
        )),
      );
      const mergedDocuments = nextDocuments.map((document) => ({
        ...document,
        translations: document.translations.map((disk) => {
          const current = documentsRef.current.flatMap((item) => item.translations).find((item) => item.id === disk.id);
          const recovered = !current ? recovery.read<EditorTranslation>('markdown', disk.id) : null;
          if (recovered) dirtyIdsRef.current.add(disk.id);
          return preserveDraftRevision(disk, recovered || current, dirtyIdsRef.current);
        }),
      }));
      for (const draft of documentsRef.current) {
        if (!mergedDocuments.some((item) => item.id === draft.id)
          && draft.translations.some((item) => dirtyIdsRef.current.has(item.id))) mergedDocuments.push(draft);
      }
      documentsRef.current = mergedDocuments;
      setDocuments(mergedDocuments);
      setSelectedId((current) => (
        current && nextDocuments.some((document) => (
          document.id === current
        ))
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
      setDirtyIds(new Set(dirtyIdsRef.current));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
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
    setDeploymentPlanLoad({ state: 'loading', plan: null, error: null });
    try {
      const plan = await invoke<DeploymentPlan>('get_deployment_plan');
      setDeploymentPlanLoad({ state: 'ready', plan, error: null });
    } catch (reason) {
      setDeploymentPlanLoad({ state: 'error', plan: null, error: String(reason) });
    }
  }, []);

  const loadDeliverySyncStatus = React.useCallback(async () => {
    setRefreshingDeliveryStatus(true);
    try {
      const status = await invoke<DeliverySyncStatus>('get_delivery_sync_status');
      setDeliverySyncStatus(status);
      setRemoteStatusFailure(null);
      setError((current) => clearResolvedSynchronizationError(current, status));
    } catch (reason) {
      setRemoteStatusFailure(classifyRemoteStatusError(reason));
    } finally {
      setRefreshingDeliveryStatus(false);
    }
  }, []);

  const deployContent = React.useCallback(async () => {
    if (deployingContent || !deploymentPlan || !canDeployCommittedContent) return;
    setConfirmingDeploy(false);
    setDeployingContent(true);
    setDeployVerification(null);
    setDeployedStaticRelease(null);
    setError(null);
    try {
      const deployed = await invoke<DeployRunStatus>('deploy_content');
      setDeployedStaticRelease(deployed.static_release);
      const verification = await invoke<DeployVerificationResult>('verify_remote_content');
      setDeployVerification(verification);
      await Promise.all([loadDeploymentPlan(), loadDeliverySyncStatus()]);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setDeployingContent(false);
    }
  }, [canDeployCommittedContent, deployingContent, deploymentPlan, loadDeliverySyncStatus, loadDeploymentPlan]);

  const pullRemoteContent = React.useCallback(async () => {
    if (pullingRemoteContent || !deploymentReadiness.canPull) return;
    setPullingRemoteContent(true);
    setError(null);
    try {
      const status = await invoke<DeliverySyncStatus>('pull_remote_content');
      setDeliverySyncStatus(status);
      setError((current) => clearResolvedSynchronizationError(current, status));
      await Promise.all([loadDocuments(), loadDashboard(), loadDeploymentPlan()]);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPullingRemoteContent(false);
    }
  }, [
    deploymentReadiness.canPull,
    loadDashboard,
    loadDeploymentPlan,
    loadDocuments,
    pullingRemoteContent,
  ]);

  React.useEffect(() => {
    if (screen !== 'dashboard' || pullingRemoteContent) return;
    const attemptKey = automaticDeploymentPullKey(deliverySyncStatus, dirtyIds.size);
    if (!attemptKey || attemptedRemotePullsRef.current.has(attemptKey)) return;
    attemptedRemotePullsRef.current.add(attemptKey);
    void pullRemoteContent();
  }, [
    deliverySyncStatus,
    dirtyIds.size,
    pullRemoteContent,
    pullingRemoteContent,
    screen,
  ]);

  const loadMomentsSettings = React.useCallback(async () => {
    try {
      setMomentsSettings(await invoke<MomentsSettings>('get_moments_settings'));
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const loadWorkspacePreferences = React.useCallback(async () => {
    try {
      const preferences = await invoke<WorkspacePreferences>('get_workspace_preferences');
      setWorkspacePreferences(preferences);
      setChromeLanguage(preferences.default_language);
      setResumeLanguage(preferences.default_language);
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  const applyWorkspacePreferences = React.useCallback((preferences: WorkspacePreferences) => {
    if (workspacePreferences?.default_language !== preferences.default_language) {
      setChromeLanguage(preferences.default_language);
      setResumeLanguage(preferences.default_language);
    }
    setWorkspacePreferences(preferences);
  }, [workspacePreferences?.default_language]);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  React.useEffect(() => {
    void loadWorkspacePreferences();
  }, [loadWorkspacePreferences]);

  React.useEffect(() => {
    if (screen === 'dashboard') void loadDashboard();
  }, [screen, loadDashboard]);

  React.useEffect(() => {
    if (screen === 'dashboard') void loadDeploymentPlan();
  }, [screen, loadDeploymentPlan]);

  React.useEffect(() => {
    if (screen !== 'dashboard') return;
    let active = true;
    let timer = 0;
    let consecutiveFailures = 0;
    // Poll every 2s while healthy; back off after failures so a transient
    // network/TLS fault is retried quietly before a friendly notice appears.
    const refresh = async () => {
      let delay = 2_000;
      try {
        const status = await invoke<DeliverySyncStatus>('get_delivery_sync_status');
        if (!active) return;
        consecutiveFailures = 0;
        setDeliverySyncStatus(status);
        setRemoteStatusFailure(null);
        setError((current) => clearResolvedSynchronizationError(current, status));
        // Without a deploy target there is nothing remote to watch.
        if (status.state === 'not_configured') delay = 30_000;
      } catch (reason) {
        if (!active) return;
        consecutiveFailures += 1;
        const failure = classifyRemoteStatusError(reason);
        if (remoteStatusFailureVisible(failure, consecutiveFailures)) setRemoteStatusFailure(failure);
        delay = remoteStatusRetryDelay(consecutiveFailures);
      }
      if (active) timer = window.setTimeout(() => void refresh(), delay);
    };
    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [screen]);

  React.useEffect(() => {
    if (screen === 'content' && entityFilter === 'moment') void loadMomentsSettings();
  }, [screen, entityFilter, loadMomentsSettings]);

  const openShelf = (filter: EntityFilter) => {
    setEntityFilter(filter);
    setScreen('content');
    setSelectedSeriesId('');
    setContentEditorOpen(false);
  };

  const returnToDashboard = () => {
    setContentEditorOpen(false);
    setSelectedSeriesId('');
    setScreen('dashboard');
  };

  const closeWorkspaceSettings = React.useCallback(() => {
    setScreen(settingsReturnScreenRef.current);
  }, []);

  React.useEffect(() => {
    if (screen !== 'settings') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeWorkspaceSettings();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeWorkspaceSettings, screen]);

  const openWorkspaceSettings = (preserveEditorContext = false) => {
    settingsReturnScreenRef.current = screen === 'content' ? 'content' : 'dashboard';
    if (!preserveEditorContext) {
      setContentEditorOpen(false);
      setSelectedSeriesId('');
    }
    setSidebarOpen(false);
    setError(null);
    setScreen('settings');
  };

  const openWorkspaceSettingsRef = React.useRef(openWorkspaceSettings);
  openWorkspaceSettingsRef.current = openWorkspaceSettings;
  const { registerSettingsHandler, refreshCredentials } = paidAi;
  React.useEffect(() => registerSettingsHandler(
    () => openWorkspaceSettingsRef.current(true),
  ), [registerSettingsHandler]);
  React.useEffect(() => {
    // A key added in Settings must enable AI actions as soon as Settings closes.
    if (screen !== 'settings') refreshCredentials();
  }, [refreshCredentials, screen]);

  const openContentGroup = (group: ContentGroup) => {
    if (!editableMasonryContentKinds.has(group.kind)) return;
    const primary = selectPrimaryDocument(group);
    if (!primary) return;
    setContentRailPanel('parts');
    setContentRailMode('files');
    setSelectedId(primary.id);
    setLanguageByDocument((current) => ({
      ...current,
      [primary.id]: group.language && primary.translations.some((translation) => translation.language === group.language)
        ? group.language
        : current[primary.id]
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

  const openContentGroupInteraction = (group: ContentGroup) => {
    if (!editableMasonryContentKinds.has(group.kind)) return;
    const primary = selectPrimaryDocument(group);
    if (!primary) return;
    setContentRailPanel('reactions');
    setContentRailMode('interaction');
    setInteractionRailSection('likers');
    setSelectedId(primary.id);
    setLanguageByDocument((current) => ({
      ...current,
      [primary.id]: group.language && primary.translations.some((translation) => translation.language === group.language)
        ? group.language
        : current[primary.id]
        || primary.canonical_language
        || primary.translations[0]?.language
        || '',
    }));
    setEntityFilter(group.kind === 'episode' ? 'blog' : group.kind);
    setScreen('content');
    if (group.kind === 'episode') {
      const seriesId = primary.series_id || primary.series_slug || 'unfiled';
      setSelectedSeriesId(`series:${seriesId}`);
    } else {
      setSelectedSeriesId('');
    }
    setContentEditorOpen(true);
  };

  /**
   * Feedback → action: open the content a dashboard row refers to and,
   * optionally, run its GEO check right away.
   */
  const openFeedbackContent = (
    kind: string,
    identity: { slug?: string; title: string },
    runGeoCheck: boolean,
  ) => {
    const group = groupDocumentsByResource(activeDocuments).find((candidate) => (
      candidate.kind === kind
      && (identity.slug ? candidate.slug === identity.slug : candidate.title === identity.title)
    ));
    if (!group || !editableMasonryContentKinds.has(group.kind)) {
      openShelf(kind === 'episode' ? 'blog' : kind as EntityFilter);
      return;
    }
    openContentGroup(group);
    const primary = selectPrimaryDocument(group);
    if (runGeoCheck && primary) setPendingGeoDocumentId(primary.id);
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

  const sectionCommitCompleted = async (status: VersionStatus) => {
    setShelfVersionStatus(status);
    await loadDocuments();
    if (deploymentPlan) await Promise.all([loadDeploymentPlan(), loadDeliverySyncStatus()]);
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
        // Stats come from the deployed site; without [deploy] there is none.
        if (deliverySyncStatus?.state !== 'not_configured') {
          await invoke<StatsSyncReport>('sync_stats');
        }
        await Promise.all([loadDocuments(), loadDashboard(), loadDeploymentPlan(), loadDeliverySyncStatus()]);
      } else {
        await loadDocuments();
        if (entityFilter === 'moment') await loadMomentsSettings();
      }
    } catch (reason) {
      if (screen === 'dashboard') setStatsSyncError(classifyRemoteStatusError(reason).message);
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
    if (captureTitle.trim() || captureNote.trim() || captureAttachments.length > 0) {
      setCapturePhase('confirming-close');
      return;
    }
    setCapturePhase('closing');
  };

  const discardCapture = () => {
    captureSubmissionRef.current = new CaptureSubmission();
    setCaptureNote('');
    setCaptureTitle('');
    setCaptureAttachments([]);
    setCaptureCovers(new Map());
    setCaptureError(null);
    setCapturePhase('closing');
  };

  const submitCapture = async () => {
    const note = captureMarkdown(captureTitle, captureNote);
    const hasAttachments = captureAttachments.length > 0;
    if ((!note && !hasAttachments) || capturePhase === 'submitting') return;
    const captureBody = note || attachmentOnlyCaptureNote(captureTarget, chromeLanguage);
    setCapturePhase('submitting');
    setCaptureError(null);
    try {
      const language = inferMarkdownLanguage(captureBody, chromeLanguage);
      const savedCreated = await captureSubmissionRef.current.save({
        title: captureTitle, note: captureNote, language,
        moment: captureTarget === 'moment', files: captureAttachments, covers: captureCovers,
      }, {
        create: () => captureTarget === 'moment'
          ? invoke<EditorDocument>('capture_moment', { event: captureBody, language })
          : invoke<EditorDocument>('capture_blog', { draft: captureBody, category: captureCategory, language }),
        import: async (id, file) => (await importFileAssets(id, [file]))[0],
        save: input => invoke<EditorDocument>('save_document', input),
      });
      captureSubmissionRef.current = new CaptureSubmission();
      setDocuments((current) => [
        ...current.filter((document) => document.id !== savedCreated.id),
        savedCreated,
      ]);
      setLanguageByDocument((current) => ({
        ...current,
        [savedCreated.id]: language,
      }));
      setSelectedId(savedCreated.id);
      setEntityFilter(captureTarget);
      setScreen('content');
      setSelectedSeriesId('');
      // A successful capture is the beginning of authoring, not the end of
      // it. Open every newly created prose item immediately so captures can be
      // completed and published without hunting for the card.
      setContentEditorOpen(true);
      setCaptureNote('');
      setCaptureTitle('');
      setCaptureAttachments([]);
      setCaptureCovers(new Map());
      setCapturePhase('closing');
    } catch (reason) {
      setCaptureError(String(reason));
      setCapturePhase('failed');
    }
  };

  const handleCaptureKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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

  const attachFilesToCapture = React.useCallback((files: File[]) => {
    if (files.length === 0) return;
    setCaptureAttachments((current) => [...current, ...files]);
  }, []);

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

  const replaceTranslationContent = React.useCallback((
    documentId: string,
    translationId: string,
    content: string,
  ) => {
    const nextDocuments = documentsRef.current.map((document) => (
      document.id === documentId
        ? {
            ...document,
            translations: document.translations.map((translation) => (
              translation.id === translationId ? { ...translation, content, title: editorRef.current?.getTitle() || translation.title } : translation
            )),
          }
        : document
    ));
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
  }, []);

  const flushMarkdown = () => autosaveQueue.run(async () => {
    if (conflictRef.current) throw new Error('Resolve the source conflict before saving. Your draft is retained.');
    let attemptedId = '';
    let lastSaved: EditorDocument | null = null;
    if (dirtyIdsRef.current.size) setError(null);
    setSaving(true);
    try {
      // Read live drafts on every iteration: edits made during I/O stay pending.
      while (dirtyIdsRef.current.size) {
        const id = [...dirtyIdsRef.current][0];
        attemptedId = id;
        const document = documentsRef.current.find((item) => item.translations.some((part) => part.id === id));
        const translation = document?.translations.find((part) => part.id === id);
        if (!document || !translation) throw new Error(`Cannot locate pending Markdown: ${id}`);
        recovery.write('markdown', id, translation);
        const saved = await invoke<EditorDocument>('save_document', {
          id, title: translation.title || document.title,
          content: translation.content, expectedRevision: translation.revision,
        });
        const savedTranslation = saved.translations.find((part) => part.id === id);
        if (!savedTranslation) throw new Error(`Saved Markdown was not returned: ${id}`);
        savedTranslationContentRef.current.set(id, savedTranslation.content);
        if (settingsRevisionRef.current === translation.revision) settingsRevisionRef.current = savedTranslation.revision;
        const live = documentsRef.current.find((item) => item.id === document.id)
          ?.translations.find((part) => part.id === id);
        const nextDirty = new Set(dirtyIdsRef.current);
        if (live?.content === translation.content && live?.title === translation.title) {
          nextDirty.delete(id);
          recovery.remove('markdown', id);
        }
        const nextDocuments = documentsRef.current.map((item) => item.id !== saved.id ? item : {
          ...saved,
          translations: mergePersistedTranslations(saved.translations, item.translations, nextDirty),
        });
        dirtyIdsRef.current = nextDirty;
        documentsRef.current = nextDocuments;
        setDocuments(nextDocuments);
        setDirtyIds(nextDirty);
        lastSaved = saved;
      }
      setSaveFailed(false);
      return lastSaved;
    } catch (reason) {
      setError(String(reason));
      setSaveFailed(true);
      if (isSourceConflict(reason)) {
        conflictRef.current = true;
        setSourceConflict({ id: attemptedId, kind: 'markdown', disk: null });
        setConflictReviewOpen(true);
        try {
          const fresh = await invoke<EditorDocument[]>('list_documents');
          const disk = fresh.flatMap((item) => item.translations).find((item) => item.id === attemptedId);
          if (disk) setSourceConflict({ id: attemptedId, kind: 'markdown', disk });
        } catch (readError) { setError(String(readError)); }
      }
      throw reason;
    } finally {
      setSaving(false);
    }
  });

  const saveSelected = async () => {
    try { return await flushMarkdown(); } catch { return null; }
  };

  React.useEffect(() => {
    if (!dirtyIds.size || saving || metadataSavingId || conflictRef.current) return;
    const timer = window.setTimeout(() => { void saveSelected(); }, saveFailed ? 5000 : 650);
    return () => window.clearTimeout(timer);
  }, [documents, dirtyIds, saving, saveFailed, metadataSavingId]);

  async function generateMissingTranslation(
    targetLanguage: string,
    options: { saveDirtySource?: boolean } = {},
  ): Promise<EditorDocument | null> {
    if (!selected) return null;
    const existing = selected.translations.find((translation) => translation.language === targetLanguage);
    if (existing) {
      setLanguageByDocument((current) => ({
        ...current,
        [selected.id]: targetLanguage,
      }));
      return selected;
    }
    const source = selectedTranslation
      || selected.translations.find((translation) => translation.language === selected.canonical_language)
      || selected.translations[0];
    if (!source) {
      setError('This Part has no source language to translate from.');
      return null;
    }
    if (dirtyIds.has(source.id)) {
      if (!options.saveDirtySource || source.id !== selectedTranslation?.id) {
        setError(`Save ${source.language} before generating ${targetLanguage}.`);
        return null;
      }
      const saved = await saveSelected();
      if (!saved) return null;
    }
    const generationKey = `${selected.id}:${targetLanguage}`;
    if (generatingTranslation) return null;
    setGeneratingTranslation(generationKey);
    setError(null);
    try {
      const generated = await invoke<EditorDocument>('generate_missing_translation', {
        id: selected.id,
        targetLanguage,
        sourceLanguage: source.language,
      });
      setDocuments((current) => current.map((document) => (
        document.id === generated.id ? generated : document
      )));
      generated.translations.forEach((translation) => {
        savedTranslationContentRef.current.set(translation.id, translation.content);
      });
      setLanguageByDocument((current) => ({
        ...current,
        [generated.id]: targetLanguage,
      }));
      setSaveFailed(false);
      return generated;
    } catch (reason) {
      setError(String(reason));
      return null;
    } finally {
      setGeneratingTranslation('');
    }
  }

  /** Generating a missing language is a paid OpenAI call: confirm it first. */
  async function requestMissingTranslation(targetLanguage: string) {
    if (!selected) return null;
    if (!selected.translations.some((translation) => translation.language === targetLanguage)) {
      const source = selectedTranslation?.language || selected.canonical_language;
      if (!await paidAi.confirm({
        kind: 'translation',
        action: `Generate ${targetLanguage} translation`,
        scope: `the ${source} Markdown of “${selected.title} · ${selected.role}”`,
      })) return null;
    }
    return generateMissingTranslation(targetLanguage);
  }

  async function syncCounterpartTranslation() {
    if (!selected || !selectedTranslation || aiTranslationBusy || saving) return;
    const targetLanguage = counterpartMarkdownLanguage(selectedTranslation.language);
    if (!targetLanguage) {
      setError('Language sync supports en and zh Markdown translations.');
      return;
    }
    const hasTarget = selected.translations.some((translation) => translation.language === targetLanguage);
    if (!await paidAi.confirm({
      kind: 'translation',
      action: hasTarget
        ? `Sync ${selectedTranslation.language} → ${targetLanguage}`
        : `Generate ${targetLanguage} translation`,
      scope: hasTarget
        ? `the changed ${selectedTranslation.language} blocks of “${selected.title} · ${selected.role}” (current language only)`
        : `the ${selectedTranslation.language} Markdown of “${selected.title} · ${selected.role}”`,
    })) return;
    const target = selected.translations.find((translation) => translation.language === targetLanguage);
    const previousSourceBody = savedTranslationContentRef.current.get(selectedTranslation.id)
      ?? selectedTranslation.content;
    const sourceChanges = summarizeMarkdownBlockChanges(
      previousSourceBody,
      selectedTranslation.content,
    );
    const syncKey = `${selectedTranslation.id}:${targetLanguage}`;

    if (!target) {
      translationSync.begin({
        key: syncKey,
        documentId: selected.id,
        sourceLanguage: selectedTranslation.language,
        targetLanguage,
        sourceChanges,
        saveRequired: dirtyIds.has(selectedTranslation.id),
      });
      const generated = await generateMissingTranslation(targetLanguage, { saveDirtySource: true });
      const generatedTarget = generated?.translations.find(
        (translation) => translation.language === targetLanguage,
      );
      if (!generatedTarget) {
        translationSync.fail(`Could not generate ${targetLanguage}.`);
        return;
      }
      translationSync.complete(summarizeMarkdownBlockChanges('', generatedTarget.content));
      return;
    }
    if (dirtyIds.has(target.id)) {
      setError(`Save ${targetLanguage} before syncing it from ${selectedTranslation.language}.`);
      return;
    }

    let sourceTranslationId = selectedTranslation.id;
    translationSync.begin({
      key: syncKey,
      documentId: selected.id,
      sourceLanguage: selectedTranslation.language,
      targetLanguage,
      sourceChanges,
      saveRequired: dirtyIds.has(selectedTranslation.id),
    });
    setError(null);
    try {
      if (dirtyIds.has(selectedTranslation.id)) {
        const saved = await saveSelected();
        if (!saved) {
          translationSync.fail(`Could not save ${selectedTranslation.language} before syncing.`);
          return;
        }
        sourceTranslationId = saved.translations.find(
          (translation) => translation.language === selectedTranslation.language,
        )?.id || sourceTranslationId;
        translationSync.sourceSaved();
      }
      const synced = await invoke<EditorDocument>('sync_counterpart_translation', {
        id: sourceTranslationId,
        targetLanguage,
        previousSourceBody,
      });
      const syncedSource = synced.translations.find(
        (translation) => translation.language === selectedTranslation.language,
      );
      const syncedTarget = synced.translations.find(
        (translation) => translation.language === targetLanguage,
      );
      if (syncedSource) {
        savedTranslationContentRef.current.set(syncedSource.id, syncedSource.content);
      }
      if (syncedTarget) {
        savedTranslationContentRef.current.set(syncedTarget.id, syncedTarget.content);
      }
      setDocuments((current) => current.map((document) => (
        document.id !== synced.id
          ? document
          : {
              ...synced,
              translations: synced.translations.map((translation) => {
                const currentTranslation = document.translations.find((item) => item.id === translation.id);
                if (
                  currentTranslation
                  && currentTranslation.id !== target.id
                  && currentTranslation.id !== selectedTranslation.id
                  && dirtyIds.has(currentTranslation.id)
                ) {
                  return currentTranslation;
                }
                return translation;
              }),
            }
      )));
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(selectedTranslation.id);
        next.delete(target.id);
        return next;
      });
      setLanguageByDocument((current) => ({
        ...current,
        [synced.id]: targetLanguage,
      }));
      setSaveFailed(false);
      translationSync.complete(summarizeMarkdownBlockChanges(
        target.content,
        syncedTarget?.content || target.content,
      ));
    } catch (reason) {
      const message = String(reason);
      setError(message);
      translationSync.fail(message);
    }
  }

  // Fresh-closure handle for the ⌘S keydown listener: the listener attaches
  // once per overlay open, but `saveSelected` closes over the live document
  // content — without this ref it would save a stale snapshot.
  const saveSelectedRef = React.useRef(saveSelected);
  React.useEffect(() => {
    saveSelectedRef.current = saveSelected;
  });

  const patchSelectedTranslationContent = React.useCallback((content: string) => {
    if (!selected || !selectedTranslation) return;
    if (
      translationSync.state.documentId === selected.id
      && translationSync.state.phase === 'complete'
    ) {
      translationSync.reset();
    }
    replaceTranslationContent(selected.id, selectedTranslation.id, content);
    const pending = new Set(dirtyIdsRef.current).add(selectedTranslation.id);
    dirtyIdsRef.current = pending;
    setDirtyIds(pending);
    const draft = documentsRef.current.flatMap((item) => item.translations).find((item) => item.id === selectedTranslation.id);
    if (draft) {
      try { recovery.write('markdown', draft.id, draft); }
      catch (reason) { setError(`Recovery copy could not be saved: ${String(reason)}`); }
    }
  }, [
    replaceTranslationContent,
    selected?.id,
    selectedTranslation?.id,
    translationSync.reset,
    translationSync.state.documentId,
    translationSync.state.phase,
  ]);

  const insertMarkdownAtCursor = React.useCallback((markdown: string) => {
    if (!selectedTranslation) return;
    const block = `\n\n${markdown.trim()}\n`;
    const inserted = editorRef.current?.insertMarkdown(block);
    if (inserted != null) {
      patchSelectedTranslationContent(inserted);
      return;
    }
    patchSelectedTranslationContent(`${selectedTranslation.content}${block}`);
  }, [patchSelectedTranslationContent, selectedTranslation]);

  const importFileAssets = React.useCallback(async (translationId: string, files: File[]) => {
    const imported: ImportedMediaAsset[] = [];
    for (const file of files) {
      imported.push(await invoke<ImportedMediaAsset>('import_media_asset_data',
        new Uint8Array(await file.arrayBuffer()),
        { headers: { 'x-media-document': translationId, 'x-media-name': mediaFileNameHeader(file.name) } },
      ));
    }
    return imported;
  }, []);

  const importFilesToSelected = React.useCallback(async (files: readonly File[]) => {
    if (!selectedTranslation) {
      throw new Error('Open a Markdown translation before adding attachments.');
    }
    if (!isTauri()) {
      throw new Error('Attachment import is available in the desktop app.');
    }
    if (files.length === 0) return [];

    setMediaImporting(true);
    setMediaDropError(null);
    try {
      const imported = await importFileAssets(selectedTranslation.id, [...files]);
      setLastImportedAsset(imported[imported.length - 1] || null);
      if (deploymentPlan) void loadDeploymentPlan();
      return imported;
    } catch (reason) {
      setMediaDropError(String(reason));
      throw reason;
    } finally {
      setMediaImporting(false);
    }
  }, [deploymentPlan, importFileAssets, loadDeploymentPlan, selectedTranslation]);

  const attachFilesToSelected = React.useCallback(async (files: File[]) => {
    try {
      const imported = await importFilesToSelected(files);
      if (imported.length > 0) {
        insertMarkdownAtCursor(imported.map((asset) => asset.markdown).join('\n\n'));
      }
    } catch {
      // The shared import boundary owns the user-facing error state.
    }
  }, [importFilesToSelected, insertMarkdownAtCursor]);

  const importImagesToSelected = React.useCallback(async (
    files: readonly File[],
  ): Promise<readonly MarkdownImageImport[]> => {
    const imported = await importFilesToSelected(files);
    return imported.map((asset, index) => ({
      alt: files[index]?.name.replace(/\.[^.]+$/, '') || asset.file_name,
      src: asset.uri,
      title: null,
    }));
  }, [importFilesToSelected]);

  const editorAssist = useEditorAssistSlashCommands({
    disabled: !selectedTranslation || saving,
    importing: mediaImporting,
    references: editorAssistReferences,
    onAttachFiles: attachFilesToSelected,
  });

  const requestSelectionAssist = React.useCallback(async (
    request: MarkdownSelectionAssistRequest,
  ) => {
    const actionLabel = request.action === 'optimize_expression'
      ? 'Optimize expression'
      : request.action === 'agent_edit'
        ? 'Agent local edit'
        : 'Comment issue';
    if (!await paidAi.confirm({
      kind: 'selection_edit',
      action: actionLabel,
      scope: 'the selected passage with up to 1,600 characters of context on each side',
    })) {
      throw new Error('Cancelled · nothing was sent');
    }
    return invoke<MarkdownSelectionAssistResult>('edit_markdown_selection', {
      input: {
        action: request.action,
        language: selectedTranslation?.language || chromeLanguage,
        title: selected?.title || 'Untitled',
        selected_text: request.selectedText,
        before_context: request.beforeContext,
        after_context: request.afterContext,
        instruction: request.instruction,
      },
    });
  }, [chromeLanguage, paidAi, selected?.title, selectedTranslation?.language]);

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
    if (!contentEditorOpen || capturePhase !== 'closed' || !isTauri()) {
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
  }, [capturePhase, contentEditorOpen, importDroppedMedia, selectedTranslation]);

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

  React.useEffect(() => {
    if (!pendingGeoDocumentId || !contentEditorOpen || selected?.id !== pendingGeoDocumentId) return;
    setPendingGeoDocumentId(null);
    void openGeoPanel();
  }, [contentEditorOpen, pendingGeoDocumentId, selected?.id]);

  const toggleToolbar = () => setToolbarVisible((current) => {
    const next = !current;
    window.localStorage.setItem('sv-editor-toolbar', next ? '1' : '0');
    return next;
  });

  const changeMarkdownWorkspaceView = React.useCallback((next: MarkdownWorkspaceView) => {
    setMarkdownWorkspaceView(next);
    window.localStorage.setItem('sv-editor-view', next);
  }, []);

  const stateTargetForGroup = (group: ContentGroup) => {
    const document = selectPrimaryDocument(group);
    const translation = document?.translations.find((item) => item.language === document.canonical_language)
      || document?.translations[0]
      || null;
    return { document, translation };
  };

  const mergeSavedDocument = React.useCallback((saved: EditorDocument) => {
    saved.translations.forEach((translation) => {
      savedTranslationContentRef.current.set(translation.id, translation.content);
    });
    const nextDocuments = documentsRef.current.map((document) => {
      const sameEntity = document.entity_type === saved.entity_type
        && document.entity_id === saved.entity_id;
      if (document.id === saved.id) return {
        ...saved,
        translations: mergePersistedTranslations(saved.translations, document.translations, dirtyIdsRef.current),
      };
      if (!sameEntity) return document;
      return {
        ...document,
        title: saved.title,
        description: saved.description,
        cover_url: saved.cover_url,
        cover_source_type: saved.cover_source_type,
        cover_website_url: saved.cover_website_url,
        is_featured: saved.is_featured,
        github_url: saved.github_url,
        demo_url: saved.demo_url,
        moment_type: saved.moment_type,
        priority: saved.priority,
        tags: saved.tags,
        relations: saved.relations,

        visibility: saved.visibility,
        pinned: saved.pinned,
      };
    });
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
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

  const makeResourcePublic = async (group: ContentGroup) => {
    const restoreAction = contentVisibilityFor('private')
      .actions
      .find((action) => action.id === 'make-public');
    if (!restoreAction) {
      setError(`${group.title} does not support restoration.`);
      return;
    }
    await saveGroupState(group, restoreAction.nextState);
  };

  const deletePrivateResource = async (group: ContentGroup, confirmation: string) => {
    const { translation } = stateTargetForGroup(group);
    if (!translation) {
      const reason = `No source revision found for ${group.title}`;
      setError(reason);
      throw new Error(reason);
    }
    if (dirtyIds.has(translation.id)) {
      const reason = 'Save or discard pending Markdown edits before permanently deleting this resource.';
      setError(reason);
      throw new Error(reason);
    }

    setStateSavingId(group.id);
    setError(null);
    try {
      await invoke('delete_private_resource', {
        id: translation.id,
        expectedRevision: translation.revision,
        confirmation,
      });
      const entityId = group.documents[0]?.entity_id;
      setDocuments((current) => current.filter((document) => !(
        document.entity_type === group.kind && document.entity_id === entityId
      )));
      if (selected?.entity_type === group.kind && selected.entity_id === entityId) {
        setContentEditorOpen(false);
        setSelectedId('');
      }
    } catch (reason) {
      setError(String(reason));
      throw reason;
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
    const lifecycle = contentVisibilityFor(group.visibility);
    const showStateSummary = variant === 'header';
    const visibleActions = lifecycle.actions;
    if (visibleActions.length === 0 && group.kind !== 'moment') return null;
    const renderVisibilityAction = (action: VisibilityAction) => (
      <Button
        key={action.id}
        size="sm"
        variant={lifecycleButtonVariantFor(action.tone)}
        disabled={disabled}
        className="state-action"
        data-action-group={action.group}
        title={action.description}
        onClick={() => void saveGroupState(group, action.nextState)}
      >
        {savingState ? <LoaderCircle className="state-spinner" size={13} /> : lifecycleIconFor(action)}
        {action.label}
      </Button>
    );
    const groupedActions = (['visibility'] as const)
      .map((actionGroup) => ({
        id: actionGroup,
        label: 'Visibility',
        actions: visibleActions.filter((action) => action.group === actionGroup),
      }))
      .filter((actionGroup) => actionGroup.actions.length > 0);

    return (
      <div
        className={`state-controls state-controls--${variant}`}
        title={stateDirty ? 'Save Markdown before changing lifecycle state' : undefined}
      >
        {showStateSummary && (
          <span className="state-control-summary" aria-label={`${group.title} state`}>
            <span data-state-role="visibility" data-state-value={lifecycle.visibility}>{lifecycle.visibilityLabel}</span>
          </span>
        )}
        {showStateSummary ? (
          <div className="state-action-groups">
            {groupedActions.map((actionGroup) => (
              <div
                className="state-action-group"
                role="group"
                aria-label={actionGroup.label}
                key={actionGroup.id}
              >
                <span className="state-action-group-label">{actionGroup.label}</span>
                <div>{actionGroup.actions.map(renderVisibilityAction)}</div>
              </div>
            ))}
          </div>
        ) : visibleActions.map(renderVisibilityAction)}
        {group.kind === 'moment' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            className={`state-action ${group.pinned ? 'active' : ''}`}
            title={group.pinned ? 'Remove this moment from the top' : 'Keep this moment at the top'}
            onClick={() => void saveGroupState(group, {

              visibility: group.visibility,
              pinned: !group.pinned,
            })}
          >
            {group.pinned ? 'Unpin' : 'Pin'}
          </Button>
        )}
      </div>
    );
  };

  const renderSeriesStateControls = (series: EpisodeSeries, variant: 'card' | 'header' = 'card') => {
    const lifecycle = seriesVisibilityFor(series.episodes);
    const savingState = stateSavingId === `series:${series.id}`;
    const stateDirty = series.episodes.some((episode) => {
      const { translation } = stateTargetForGroup(episode);
      return Boolean(translation && dirtyIds.has(translation.id));
    });
    const disabled = savingState || stateDirty || series.episodes.length === 0;
    const showStateSummary = variant === 'header';

    return (
      <div
        className={`state-controls state-controls--${variant}`}
        title={stateDirty ? 'Save episode Markdown before changing the whole series' : undefined}
      >
        {showStateSummary && (
          <span className="state-control-summary" aria-label={`${series.title} state`}>
            <span data-state-role="visibility" data-state-value={lifecycle.visibility}>{lifecycle.visibilityLabel}</span>
          </span>
        )}
        {lifecycle.actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={lifecycleButtonVariantFor(action.tone)}
            disabled={disabled}
            className="state-action"
            title={action.description}
            onClick={() => void saveSeriesState(series, action.nextState)}
          >
            {savingState ? <LoaderCircle className="state-spinner" size={13} /> : lifecycleIconFor(action)}
            {action.label}
          </Button>
        ))}
      </div>
    );
  };

  const openSeriesEditor = async (series: EpisodeSeries) => {
    if (seriesEditorLoading || seriesEditorSaving) return;
    setSeriesEditingSlug(series.slug);
    setSeriesSettingsPage('overview');
    setSeriesSource(null);
    setSeriesDraft({
      title: series.title,
      description: series.description || '',
      cover_url: series.coverUrl || '',

    });
    setSeriesEditorError(null);
    setSeriesCoverError(undefined);
    setSeriesCoverLocalPreview('');
    setSeriesEditorLoading(true);
    try {
      const source = await invoke<EpisodeSeriesSource>('get_episode_series_source', { slug: series.slug });
      setSeriesSource(source);
      setSeriesDraft({
        title: source.title,
        description: source.description,
        cover_url: source.cover_url,

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
    setSeriesCoverError(undefined);
    setSeriesCoverLocalPreview('');
  };

  const saveSeriesEditor = async () => {
    if (!seriesEditingSlug || !seriesSource || seriesEditorSaving) return;
    const next = {
      title: seriesDraft.title.trim(),
      description: seriesDraft.description.trim(),
      cover_url: seriesDraft.cover_url.trim(),

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

      });
      setSeriesCoverLocalPreview('');
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
      onClick={() => {
        setContentRailPanel('parts');
        setContentRailMode('files');
        setSelectedId(document.id);
      }}
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
  const isUpdateShelf = entityFilter === 'moment';
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
  const languageReviewAvailable = Boolean(
    selectedTranslation
    && (selected?.entity_type === 'blog' || selected?.entity_type === 'episode'),
  );
  const reviewScopeDocuments = selected?.entity_type === 'episode'
    ? episodeSeries
        .find((series) => series.slug === selected.series_slug)
        ?.episodes.flatMap((episode) => episode.documents) || []
    : selectedContentGroup?.documents || [];
  const reviewScopeDirty = reviewScopeDocuments.some((document) => (
    document.translations.some((translation) => dirtyIds.has(translation.id))
  ));
  const reviewRunning = languageReview.state.phase === 'running';
  const runCurrentLanguageReview = async () => {
    if (!selectedTranslation || !selected || dirty || reviewRunning) return;
    if (!await paidAi.confirm({
      kind: 'reader_review',
      action: 'Reader review',
      scope: `the current language only (${selectedTranslation.language}) of “${selected.title} · ${selected.role}”`,
    })) return;
    void languageReview.run({
      kind: 'translation',
      id: selectedTranslation.id,
      label: `${selected.title} · ${selected.role} · ${selectedTranslation.language}`,
    });
  };
  const runResourceLanguageReview = async () => {
    if (!selected || reviewScopeDirty || reviewRunning) return;
    const wholeScope = selected.entity_type === 'episode' ? 'whole series' : 'whole article';
    if (!await paidAi.confirm({
      kind: 'reader_review',
      action: 'Reader review',
      scope: `the ${wholeScope}: every language of ${reviewScopeDocuments.length} Markdown part${reviewScopeDocuments.length === 1 ? '' : 's'} of “${selected.series_title && selected.entity_type === 'episode' ? selected.series_title : selected.title}”`,
    })) return;
    if (selected.entity_type === 'blog') {
      void languageReview.run({
        kind: 'blog',
        slug: selected.slug,
        label: `${selected.title} · complete article`,
      });
      return;
    }
    if (selected.entity_type === 'episode' && selected.series_slug) {
      void languageReview.run({
        kind: 'episode_series',
        seriesSlug: selected.series_slug,
        label: `${selected.series_title || selected.series_slug} · complete series`,
      });
    }
  };
  const languageReviewCountForDocument = (document: EditorDocument) => {
    const sourcePaths = new Set(document.translations.map((translation) => translation.source_path));
    const matchingResults = languageReview.state.report?.results.filter(
      (result) => sourcePaths.has(result.source_path),
    ) || [];
    if (matchingResults.length === 0) return null;
    return matchingResults.reduce((count, result) => count + result.findings.length, 0);
  };
  const locateReviewedTranslation = (result: DocumentLanguageAudit) => {
    const targetDocument = documents.find((document) => (
      document.translations.some((translation) => (
        translation.source_path === result.source_path
        && translation.language === result.language
      ))
    ));
    const targetTranslation = targetDocument?.translations.find((translation) => (
      translation.source_path === result.source_path
      && translation.language === result.language
    ));
    if (!targetDocument || !targetTranslation) {
      setError(`Cannot locate reviewed source ${result.source_path}. Refresh the workspace and review again.`);
      return null;
    }
    return { targetDocument, targetTranslation };
  };
  const focusReviewFinding = (
    result: DocumentLanguageAudit,
    finding: LanguageAuditFinding,
  ) => {
    const located = locateReviewedTranslation(result);
    if (!located) return;
    const { targetDocument, targetTranslation } = located;
    setScreen('content');
    setSelectedId(targetDocument.id);
    setLanguageByDocument((current) => ({
      ...current,
      [targetDocument.id]: targetTranslation.language,
    }));
    setContentRailMode('files');
    setContentRailPanel('parts');
    if (editableMasonryContentKinds.has(targetDocument.entity_type)) {
      setContentEditorOpen(true);
    }
    setPendingReviewFocus({
      findingId: languageReviewFindingId(result, finding),
      sourcePath: result.source_path,
      language: result.language,
    });
    languageReview.close();
  };
  const previewReviewSuggestion = (
    result: DocumentLanguageAudit,
    finding: LanguageAuditFinding,
  ) => {
    const located = locateReviewedTranslation(result);
    if (!located) return;
    dispatchReviewSuggestion({
      type: 'opened',
      target: {
        findingId: languageReviewFindingId(result, finding),
        documentId: located.targetDocument.id,
        translationId: located.targetTranslation.id,
        sourcePath: result.source_path,
        language: result.language,
        quote: finding.quote,
        suggestion: finding.suggestion,
        explanation: finding.explanation,
        sourceLine: finding.source_line ?? null,
      },
    });
  };
  const reviewSuggestionMarkdown = reviewSuggestion.phase === 'idle'
    ? ''
    : documents.find((document) => document.id === reviewSuggestion.target.documentId)
      ?.translations.find((translation) => translation.id === reviewSuggestion.target.translationId)
      ?.content ?? '';
  const applyReviewSuggestion = async () => {
    if (reviewSuggestion.phase !== 'previewing') return;
    const confirmed = reviewSuggestionTransition(reviewSuggestion, { type: 'confirmed' });
    const next = reviewSourceEdit(confirmed, reviewSuggestionMarkdown);
    if (next == null || confirmed.phase !== 'saving') return;
    const { target } = confirmed;
    dispatchReviewSuggestion({ type: 'confirmed' });
    const nextDocuments = documentsRef.current.map((document) => (
      document.id !== target.documentId ? document : {
        ...document,
        translations: document.translations.map((translation) => (
          translation.id === target.translationId ? { ...translation, content: next } : translation
        )),
      }
    ));
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    const pending = new Set(dirtyIdsRef.current).add(target.translationId);
    dirtyIdsRef.current = pending;
    setDirtyIds(pending);
    try {
      await flushMarkdown();
      dispatchReviewSuggestion({ type: 'saved' });
      languageReview.resolveFinding(target.findingId);
    } catch (reason) {
      dispatchReviewSuggestion({ type: 'failed', error: String(reason) });
    }
  };

  React.useEffect(() => {
    if (
      !pendingReviewFocus
      || selectedTranslation?.source_path !== pendingReviewFocus.sourcePath
      || selectedTranslation.language !== pendingReviewFocus.language
    ) {
      return;
    }
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (editorRef.current?.focusReviewFinding(pendingReviewFocus.findingId) !== true) {
          setError('The reviewed sentence no longer matches the editor. Save and run DeepSeek review again.');
        }
        setPendingReviewFocus(null);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [
    pendingReviewFocus,
    selectedTranslation?.language,
    selectedTranslation?.source_path,
  ]);
  const masonryGroups = isMasonryShelf
    ? entityFilter === 'blog'
      ? arrangeBlogGroupsForGrid([
          ...displayContentGroups.filter((group) => group.kind === 'blog'),
          ...seriesCards,
        ])
      : displayContentGroups.filter((group) => group.kind === entityFilter)
    : [];
  const updateGroups = isUpdateShelf
    ? contentGroups.filter((group) => group.kind === 'moment')
    : [];
  const updatesShellActive = screen === 'content' && isUpdateShelf && !contentEditorOpen;
  const shelfDockMode = versionScope && versionScope !== 'moment'
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
  const sectionCommit = sectionCommitAvailability({
    label: currentShelf.label,
    changeCount: versionScope && shelfVersionStatus?.scope === versionScope
      ? shelfVersionStatus.dirty_count
      : null,
    unsavedCount: dirtyIds.size,
  });
  const renderSectionCommitButton = (scope: VersionScope) => (
    <button
      type="button"
      className="dock-release"
      disabled={!sectionCommit.enabled}
      onClick={() => setCommitPanelScope(scope)}
      title={sectionCommit.reason || `Preview ${currentShelf.label} changes and commit them locally; deploy separately`}
    >
      <Send size={15} />
      Commit
    </button>
  );
  const selectedMetadataTarget = selectedContentGroup ? stateTargetForGroup(selectedContentGroup) : null;
  const selectedMetadataTranslation = selectedMetadataTarget?.translation || null;
  const selectedMetadataSummaryLabel = selectedContentGroup ? metadataSummaryLabel(selectedContentGroup.kind) : '';
  const selectedMetadataCoverLabel = selectedContentGroup ? metadataCoverLabel(selectedContentGroup.kind) : '';
  const selectedCoverPreviewUrl = selectedMetadataCoverLabel
    ? metadataCoverLocalPreview || toWebviewMediaUrl(metadataDraft.cover_url)
    : '';
  const [settingsBaseline, setSettingsBaseline] = React.useState<{
    id: string; metadata: typeof metadataDraft; publishing: typeof publishingDraft;
  } | null>(null);
  const metadataDirty = settingsBaseline?.id === selectedContentGroup?.id
    && Boolean(settingsBaseline && JSON.stringify(metadataDraft) !== JSON.stringify(settingsBaseline.metadata));
  const publishingDirty = settingsBaseline?.id === selectedContentGroup?.id
    && Boolean(settingsBaseline && JSON.stringify(publishingDraft) !== JSON.stringify(settingsBaseline.publishing));
  const contentSettingsDirty = metadataDirty || publishingDirty;
  type SettingsRecovery = {
    metadata: typeof metadataDraft; publishing: typeof publishingDraft; revision: string;
  };
  const settingsRevisionRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!selectedContentGroup) return;
    const metadata: typeof metadataDraft = {
      title: selectedContentGroup.title,
      description: selectedContentGroup.description || '',
      cover_url: selectedContentGroup.coverUrl || '',
      cover_source_type: selectedContentGroup.coverSourceType || inferCoverSourceType(selectedContentGroup.coverUrl),
      cover_website_url: selectedContentGroup.coverWebsiteUrl || '',
      is_featured: Boolean(selectedContentGroup.isFeatured),
      github_url: selectedContentGroup.githubUrl || '',
      demo_url: selectedContentGroup.demoUrl || '',
      article_attribution: selectedContentGroup.articleAttribution || defaultArticleAttribution(),
      moment_type: selectedContentGroup.momentType || 'progress',
      priority: selectedContentGroup.priority || 'medium',
      tags: (selectedContentGroup.tags || []).join(', '),
    };
    const publishing: typeof publishingDraft = {

      visibility: selectedContentGroup.visibility,
      pinned: Boolean(selectedContentGroup.pinned),
    };
    let recovered: SettingsRecovery | null = null;
    try { recovered = recovery.read<SettingsRecovery>('settings', selectedContentGroup.id); }
    catch (reason) { setError(`Cannot read settings recovery copy: ${String(reason)}`); }
    settingsRevisionRef.current = recovered?.revision ?? null;
    setMetadataDraft(recovered?.metadata || metadata);
    setPublishingDraft(recovered?.publishing || publishing);
    setSettingsBaseline({ id: selectedContentGroup.id, metadata, publishing });
    setMetadataError(null);
    setMetadataCoverError(undefined);
    setMetadataCoverLocalPreview('');
  }, [selectedContentGroup?.id]);

  React.useEffect(() => {
    if (!selectedContentGroup || !settingsBaseline || metadataDirty || publishingDirty) return;
    if (settingsBaseline.id !== selectedContentGroup.id || metadataDraft.title === selectedContentGroup.title) return;
    const metadata = { ...metadataDraft, title: selectedContentGroup.title };
    setMetadataDraft(metadata);
    setSettingsBaseline({ ...settingsBaseline, metadata });
  }, [selectedContentGroup?.title, metadataDirty, publishingDirty]);

  React.useEffect(() => {
    setRelationshipError(null);
    setRelationshipTargetSlug('');
    setRelationshipTargetKind('blog');
  }, [selectedContentGroup?.id]);

  const loadInteractionDetails = React.useCallback(async (syncRemote = false) => {
    if (!selectedContentGroup) return;
    const primary = selectPrimaryDocument(selectedContentGroup);
    if (!primary) return;
    const requestId = interactionDetailsRequestRef.current + 1;
    interactionDetailsRequestRef.current = requestId;
    if (syncRemote) setInteractionDetailsRefreshing(true);
    else setInteractionDetailsState({ status: 'loading' });
    setCommentVisibilityError(null);
    try {
      let details = syncRemote
        ? null
        : await invoke<InteractionDetails>('get_interaction_details', {
            entityType: primary.entity_type,
            entityId: primary.entity_id,
          });
      if (syncRemote || !details?.is_complete) {
        setInteractionDetailsRefreshing(true);
        await invoke<StatsSyncReport>('sync_stats');
        await loadDocuments();
        details = await invoke<InteractionDetails>('get_interaction_details', {
          entityType: primary.entity_type,
          entityId: primary.entity_id,
        });
      }
      if (interactionDetailsRequestRef.current === requestId) {
        setInteractionDetailsState(details.is_complete
          ? { status: 'ready', details }
          : { status: 'remote-upgrade-required' });
      }
    } catch (reason) {
      if (interactionDetailsRequestRef.current === requestId) {
        setInteractionDetailsState({ status: 'error', message: String(reason) });
      }
    } finally {
      if (interactionDetailsRequestRef.current === requestId) {
        setInteractionDetailsRefreshing(false);
      }
    }
  }, [selectedContentGroup?.id, loadDocuments]);

  React.useEffect(() => {
    if (contentRailPanel !== 'reactions' || !selectedContentGroup) return;
    void loadInteractionDetails();
  }, [contentRailPanel, selectedContentGroup?.id, loadInteractionDetails]);

  const setCommentVisibility = React.useCallback(async (commentId: string, isPublic: boolean) => {
    if (!selectedContentGroup || commentVisibilityPendingId) return;
    const primary = selectPrimaryDocument(selectedContentGroup);
    if (!primary) return;
    setCommentVisibilityPendingId(commentId);
    setCommentVisibilityError(null);
    try {
      const details = await invoke<InteractionDetails>('set_comment_visibility', {
        entityType: primary.entity_type,
        entityId: primary.entity_id,
        commentId,
        isPublic,
      });
      setInteractionDetailsState({ status: 'ready', details });
      await loadDocuments();
    } catch (reason) {
      setCommentVisibilityError(String(reason));
    } finally {
      setCommentVisibilityPendingId('');
    }
  }, [selectedContentGroup?.id, commentVisibilityPendingId, loadDocuments]);

  const closeContentEditorLayer = async () => {
    // Closing the overlay keeps workspace drafts; source failure must not trap navigation.
    if (!checkpointEditor()) return;
    void flushEditorRef.current();
    if (contentRailPanel === 'settings') {
      setContentRailPanel(contentRailMode === 'interaction' ? 'reactions' : 'parts');
    } else {
      setContentEditorOpen(false);
    }
  };

  const uploadMetadataCover = async (file: File) => {
    if (!selectedMetadataTranslation || metadataCoverBusy || metadataSavingId) return;
    setMetadataCoverBusy(true);
    setMetadataCoverError(undefined);
    try {
      const imported = await invoke<ImportedMediaAsset>('import_media_asset_bytes', {
        id: selectedMetadataTranslation.id,
        fileName: file.name,
        bytes: await fileBytes(file),
      });
      setMetadataDraft((current) => ({
        ...current,
        cover_url: imported.uri,
        cover_source_type: 'image',
      }));
      setMetadataCoverLocalPreview(
        imported.local_path ? toWebviewMediaUrl(imported.local_path) : URL.createObjectURL(file),
      );
    } catch (reason) {
      setMetadataCoverError(String(reason));
    } finally {
      setMetadataCoverBusy(false);
    }
  };

  const persistContentSettings = async () => {
    if (conflictRef.current) return false;
    if (!selectedContentGroup || !selectedMetadataTranslation) return false;
    const title = metadataDraft.title.trim();
    if (!title) {
      setMetadataError('Title is required.');
      return false;
    }
    setMetadataSavingId(selectedContentGroup.id);
    setMetadataError(null);
    try {
      await flushMarkdown();
      await autosaveQueue.run(async () => {
        const saved = await invoke<EditorDocument>('save_content_settings', {
          id: selectedMetadataTranslation.id,
          metadata: {
            title,
            description: selectedMetadataSummaryLabel ? metadataDraft.description.trim() : null,
            cover_url: selectedMetadataCoverLabel ? metadataDraft.cover_url.trim() : null,
            cover_source_type: selectedContentGroup.kind === 'project' ? metadataDraft.cover_source_type : null,
            cover_website_url: selectedContentGroup.kind === 'project' ? metadataDraft.cover_website_url.trim() : null,
            is_featured: selectedContentGroup.kind === 'project' ? metadataDraft.is_featured : null,
            github_url: selectedContentGroup.kind === 'project' ? metadataDraft.github_url.trim() : null,
            demo_url: selectedContentGroup.kind === 'project' ? metadataDraft.demo_url.trim() : null,
            article_attribution: selectedContentGroup.kind === 'blog'
              ? metadataDraft.article_attribution
              : null,
            moment_type: selectedContentGroup.kind === 'moment' ? metadataDraft.moment_type : null,
            priority: selectedContentGroup.kind === 'moment' ? metadataDraft.priority : null,
            tags: selectedContentGroup.kind === 'moment' ? parseMetadataTags(metadataDraft.tags) : null,
          },
          state: {

            visibility: publishingDraft.visibility,
            pinned: selectedContentGroup.kind === 'moment' ? Boolean(publishingDraft.pinned) : null,
          },
          expectedRevision: settingsRevisionRef.current ?? documentsRef.current.flatMap((item) => item.translations)
            .find((item) => item.id === selectedMetadataTranslation.id)?.revision,
        });
        mergeSavedDocument(saved);
        setSettingsBaseline({ id: selectedContentGroup.id, metadata: metadataDraft, publishing: publishingDraft });
        settingsRevisionRef.current = null;
        // A newer settings draft is checkpointed by the following render.
        recovery.removeIf<SettingsRecovery>('settings', selectedContentGroup.id, (copy) =>
          JSON.stringify(copy.metadata) === JSON.stringify(metadataDraft)
            && JSON.stringify(copy.publishing) === JSON.stringify(publishingDraft));
      });
      return true;
    } catch (reason) {
      setMetadataError(String(reason));
      if (isSourceConflict(reason)) {
        conflictRef.current = true;
        setSourceConflict({ id: selectedMetadataTranslation.id, kind: 'settings', disk: null });
        setConflictReviewOpen(true);
        try {
          const fresh = await invoke<EditorDocument[]>('list_documents');
          const disk = fresh.flatMap((item) => item.translations).find((item) => item.id === selectedMetadataTranslation.id);
          if (disk) { setSourceConflict({ id: disk.id, kind: 'settings', disk }); setConflictReviewOpen(true); }
        } catch (readError) { setError(String(readError)); }
      }
      return false;
    } finally {
      setMetadataSavingId('');
    }
  };

  const saveContentSettings = () => {
    if (settingsWriteRef.current) return settingsWriteRef.current;
    const write = persistContentSettings().finally(() => { settingsWriteRef.current = null; });
    settingsWriteRef.current = write;
    return write;
  };

  const checkpointEditor = () => {
    try {
      for (const document of documentsRef.current) {
        for (const draft of document.translations) {
          if (dirtyIdsRef.current.has(draft.id)) recovery.write('markdown', draft.id, draft);
        }
      }
      if (contentSettingsDirty && selectedContentGroup && selectedMetadataTranslation) {
        settingsRevisionRef.current ??= selectedMetadataTranslation.revision;
        recovery.write<SettingsRecovery>('settings', selectedContentGroup.id, {
          metadata: metadataDraft, publishing: publishingDraft,
          revision: settingsRevisionRef.current ?? selectedMetadataTranslation.revision,
        });
      }
      return true;
    } catch (reason) {
      setError(`Recovery copy could not be saved. Keep this window open: ${String(reason)}`);
      return false;
    }
  };
  const checkpointRef = React.useRef(checkpointEditor);
  checkpointRef.current = checkpointEditor;
  React.useEffect(() => { checkpointRef.current(); }, [documents, dirtyIds, metadataDraft, publishingDraft]);

  const flushEditorRef = React.useRef(async () => true);
  flushEditorRef.current = async () => {
    if (contentSettingsDirty && !await saveContentSettings()) return false;
    try { await flushMarkdown(); return true; } catch { return false; }
  };

  React.useEffect(() => {
    if (!contentSettingsDirty || metadataSavingId || !selectedMetadataTranslation || conflictRef.current) return;
    const timer = window.setTimeout(() => { void saveContentSettings(); }, metadataError ? 5000 : 650);
    return () => window.clearTimeout(timer);
  }, [metadataDraft, publishingDraft, contentSettingsDirty, metadataSavingId, metadataError, selectedMetadataTranslation?.id]);

  React.useEffect(() => {
    const blur = () => { void flushEditorRef.current(); };
    window.addEventListener('blur', blur);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      void getCurrentWindow().onCloseRequested(async (event) => {
        event.preventDefault();
        if (closingRef.current) return;
        closingRef.current = true;
        try {
          if (!checkpointRef.current()) return;
          if (await waitForSave(flushEditorRef.current())) {
            if (checkpointRef.current()) await getCurrentWindow().destroy();
          } else setCloseRecoveryOpen(true);
        } catch (reason) { setError(String(reason)); setCloseRecoveryOpen(true); }
        finally { closingRef.current = false; }
      }).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    }
    return () => { disposed = true; unlisten?.(); window.removeEventListener('blur', blur); };
  }, []);

  const parkConflictedDraft = async () => {
    const conflict = sourceConflict;
    if (!conflict || !checkpointRef.current()) return;
    dirtyIdsRef.current = new Set([...dirtyIdsRef.current].filter((id) => id !== conflict.id));
    setDirtyIds(dirtyIdsRef.current);
    if (conflict.kind === 'settings' && selectedContentGroup && selectedMetadataTranslation?.id === conflict.id) {
      setSettingsBaseline({ id: selectedContentGroup.id, metadata: metadataDraft, publishing: publishingDraft });
    }
    conflictRef.current = false;
    setSourceConflict(null);
    setSaveFailed(false);
    setMetadataError(null);
    setError(null);
    setRecoveryCopies(recovery.list());
    setRecoveryCopiesOpen(true);
    await loadDocuments();
  };

  const resolveSourceConflict = async (useDraft: boolean) => {
    const conflict = sourceConflict;
    if (!conflict?.disk) return;
    const disk = conflict.disk;
    if (conflict.kind === 'settings' && selectedMetadataTranslation?.id !== conflict.id) {
      const target = documentsRef.current.find((document) => document.translations.some((part) => part.id === conflict.id));
      if (target) { setSelectedId(target.id); setContentEditorOpen(true); }
      setError('Review the original document settings before applying this choice.');
      return;
    }
    if (conflict.kind === 'settings') {
      // Explicit user choice authorizes rebasing settings; a later disk write still conflicts.
      settingsRevisionRef.current = disk.revision;
    } else {
      const next = documentsRef.current.map((document) => ({
        ...document,
        translations: document.translations.map((draft) => draft.id !== conflict.id ? draft
          : useDraft ? { ...draft, revision: disk.revision } : disk),
      }));
      if (!useDraft) {
        dirtyIdsRef.current = new Set([...dirtyIdsRef.current].filter((id) => id !== conflict.id));
        recovery.remove('markdown', conflict.id);
        setDirtyIds(dirtyIdsRef.current);
      }
      documentsRef.current = next;
      setDocuments(next);
    }
    conflictRef.current = false;
    setSourceConflict(null);
    setError(null);
    setSaveFailed(false);
    if (conflict.kind === 'settings') await saveContentSettings();
    else if (useDraft) await saveSelected();
    else await loadDocuments();
  };

  const reloadDocumentsAfterRelationship = async (saved: EditorDocument) => {
    const nextDocuments = await invoke<EditorDocument[]>('list_documents');
    savedTranslationContentRef.current = new Map(
      nextDocuments.flatMap((document) => (
        document.translations.map((translation) => [translation.id, translation.content] as const)
      )),
    );
    setDocuments(nextDocuments);
    setSelectedId(saved.id);
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
  };

  const runRelationshipCommand = async (
    busyKey: string,
    command: string,
    args: Record<string, unknown>,
    nextPage: ContentSettingsPage = 'relations',
  ) => {
    if (!selectedContentGroup || relationshipBusy) return;
    setRelationshipBusy(busyKey);
    setRelationshipError(null);
    try {
      if (!await flushEditorRef.current()) return;
      const saved = await autosaveQueue.run(() => invoke<EditorDocument>(command, args));
      await reloadDocumentsAfterRelationship(saved);
      setContentSettingsPage(nextPage);
      if (command === 'link_moment_to_content' || command === 'unlink_moment_from_content') {
        setRelationshipTargetSlug('');
      }
    } catch (reason) {
      setRelationshipError(String(reason));
    } finally {
      setRelationshipBusy('');
    }
  };

  /**
   * Create a new Blog or Project from the open moment and continue writing it.
   * Creation never commits: the new resource is an uncommitted local change
   * that the owner reviews and commits from its section.
   */
  const createFromMoment = async (kind: 'blog' | 'project') => {
    if (!selectedContentGroup || selectedContentGroup.kind !== 'moment' || relationshipBusy) return;
    const busyKey = kind === 'blog' ? 'moment-create-blog' : 'moment-create-project';
    setRelationshipBusy(busyKey);
    setRelationshipError(null);
    setCreationNotice(null);
    try {
      if (!await flushEditorRef.current()) return;
      const created = await autosaveQueue.run(() => invoke<EditorDocument>(
        kind === 'blog' ? 'create_blog_from_moment' : 'create_project_from_moment',
        { slug: selectedContentGroup.slug },
      ));
      await reloadDocumentsAfterRelationship(created);
      setEntityFilter(kind);
      setSelectedSeriesId('');
      setContentRailMode('files');
      setContentRailPanel('parts');
      setContentEditorOpen(true);
      setCreationNotice(
        `Created “${created.title}” in ${kind === 'blog' ? 'Blog' : 'Projects'} from this moment. `
        + `It is saved locally but not committed; review it, then use Commit in ${kind === 'blog' ? 'Blog' : 'Projects'}.`,
      );
    } catch (reason) {
      setRelationshipError(String(reason));
      setError(String(reason));
    } finally {
      setRelationshipBusy('');
    }
  };
  const writeMomentUpAsArticle = () => createFromMoment('blog');

  const openRelationTarget = (relation: ContentRelation) => {
    const target = relationTargetGroups.find((group) => (
      group.kind === relation.target_kind && group.slug === relation.target_slug
    ));
    if (!target) {
      setRelationshipError(`Cannot open ${relation.target_uri}; the target is not available in the active workspace.`);
      return;
    }
    setRelationshipError(null);
    openContentGroup(target);
  };

  const unlinkContentRelation = (relation: ContentRelation) => {
    if (!selectedContentGroup || (relation.target_kind !== 'blog' && relation.target_kind !== 'project')) return;
    void runRelationshipCommand(
      `moment-unlink:${relation.target_kind}:${relation.target_slug}`,
      'unlink_moment_from_content',
      {
        slug: selectedContentGroup.slug,
        targetKind: relation.target_kind,
        targetSlug: relation.target_slug,
      },
    );
  };

  const openContentRailMode = (mode: ContentRailMode) => {
    setContentRailMode(mode);
    setContentRailPanel(mode === 'interaction' ? 'reactions' : 'parts');
    if (mode === 'interaction') setInteractionRailSection('likers');
  };

  const focusInteractionSection = (section: 'likers' | 'comments') => {
    setContentRailMode('interaction');
    setContentRailPanel('reactions');
    setInteractionRailSection(section);
    window.requestAnimationFrame(() => {
      document.getElementById(`interaction-${section}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

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

  const titlebarTitle = screen === 'dashboard'
    ? 'Overview'
    : screen === 'settings'
      ? 'Settings'
      : screen === 'content'
        ? currentShelf.label
        : undefined;
  const titlebarMeta = screen === 'dashboard' ? (
    <>
      <span>{displayedHumanInteractions} human interactions</span>
      <span>{displayedAiCrawlerInteractions} AI · {displayedSearchCrawlerInteractions} search crawler hits</span>
      <span>{attentionCount} delivery moments</span>
      <span>{workspaceChangeCount} uncommitted workspace changes</span>
      <span>{dirtyIds.size} unsaved Markdown files</span>
    </>
  ) : screen === 'settings' ? (
    <>
      <span>Manage profile, language, integrations, and archived content</span>
      <span>Workspace identity stays source-backed · credentials stay local</span>
    </>
  ) : (
    <>
      <span>{contentSummary}</span>
      <span>{dirtyIds.size} unsaved</span>
      {selected && <span>{docPath(selected)}</span>}
    </>
  );
  const titlebarOptions = screen === 'settings' ? (
    <button
      type="button"
      className="workspace-settings-close"
      onClick={closeWorkspaceSettings}
      title="Close settings"
      aria-label="Close settings"
    >
      <X size={18} />
    </button>
  ) : screen === 'content' && !contentEditorOpen ? renderLanguageCloseControls({
      closeLabel: 'Back to Overview',
      closeTitle: 'Back to Overview',
      onClose: returnToDashboard,
    }) : null;

  return (
    <div className={`shell ${sidebarOpen && screen !== 'settings' ? 'sidebar-open' : ''} ${screen === 'settings' ? 'settings-open' : ''} ${desktopWindowChromeClassName}`}>
      <DesktopTitlebar
        sidebarOpen={sidebarOpen}
        canGoBack={canMoveWorkspaceNavigationHistory(workspaceNavigationHistory, -1)}
        canGoForward={canMoveWorkspaceNavigationHistory(workspaceNavigationHistory, 1)}
        titlebarTitle={titlebarTitle}
        titlebarMeta={titlebarMeta}
        titlebarOptions={titlebarOptions}
        onSidebarToggle={() => {
          if (screen === 'settings') {
            closeWorkspaceSettings();
            setSidebarOpen(true);
            return;
          }
          setSidebarOpen((open) => !open);
        }}
        onBack={() => moveWorkspaceHistory(-1)}
        onForward={() => moveWorkspaceHistory(1)}
        onCompose={() => openCapture('moment')}
      />
      {screen !== 'settings' && (
        <WorkspaceSidebar
          open={sidebarOpen}
          dashboardActive={screen === 'dashboard'}
          activeItem={screen === 'content' ? entityFilter : null}
          attentionCount={attentionCount}
          avatarLabel={workspacePreferences?.identity.avatar_label || 'S'}
          avatarUrl={workspacePreferences?.identity.avatar_url
            ? toWebviewMediaUrl(workspacePreferences.identity.avatar_url)
            : ''}
          displayName={workspacePreferences?.identity.display_name || 'Silan-Viking'}
          items={navigationEntityFilters.map((filter) => ({
            id: filter,
            label: entityMeta[filter].label,
            count: entityCounts.get(filter) || 0,
          }))}
          onDashboardOpen={returnToDashboard}
          onItemOpen={openShelf}
          onSettingsOpen={openWorkspaceSettings}
        />
      )}

      <main
        className={`main ${updatesShellActive ? 'main-moments' : ''} ${screen === 'settings' ? 'main-settings' : ''}`}
        data-has-moments-background={updatesShellActive && momentsCoverImage ? 'true' : undefined}
        style={mainStyle}
      >
        <WorkspaceSwitchNotice />
        {recoveryCopies.length > 0 && (
          <button type="button" onClick={() => { setRecoveryCopies(recovery.list()); setRecoveryCopiesOpen(true); }}>
            Local recovery copies ({recoveryCopies.length})
          </button>
        )}
        {error && (
          <div className="error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {screen === 'settings' ? (
          <WorkspaceSettingsPage
            privateResources={privateResources}
            restoringResourceId={stateSavingId}
            preferences={workspacePreferences}
            onPreferencesChange={applyWorkspacePreferences}
            onMakePublicResource={makeResourcePublic}
            onDeleteResource={deletePrivateResource}
          />
        ) : screen === 'dashboard' ? (
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
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'views' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'views' ? null : 'views');
                            }}
                          >
                            <span>Views</span><strong>{displayedViews}</strong>
                          </button>
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'likes' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'likes' ? null : 'likes');
                            }}
                          >
                            <span>Likes</span><strong>{displayedLikes}</strong>
                          </button>
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'comments' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'comments' ? null : 'comments');
                            }}
                          >
                            <span>Comments</span><strong>{displayedComments}</strong>
                          </button>
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'crawlers' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'crawlers' ? null : 'crawlers');
                            }}
                          >
                            <span>Crawlers</span><strong>{displayedCrawlerInteractions}</strong>
                          </button>
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'ai_crawlers' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'ai_crawlers' ? null : 'ai_crawlers');
                            }}
                          >
                            <span>AI crawlers</span><strong>{displayedAiCrawlerInteractions}</strong>
                          </button>
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'search_bots' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'search_bots' ? null : 'search_bots');
                            }}
                          >
                            <span>Search bots</span><strong>{displayedSearchCrawlerInteractions}</strong>
                          </button>
                          <button
                            type="button"
                            data-active={dashboardRankingMetric === 'ai_chat' ? 'true' : undefined}
                            onClick={() => {
                              setSelectedCommitDay(null);
                              setSelectedTrafficDate(null);
                              setDashboardRankingMetric((current) => current === 'ai_chat' ? null : 'ai_chat');
                            }}
                          >
                            <span>AI chat</span><strong>{displayedAiChatReferrals}</strong>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="traffic-detail">
                        <div className="traffic-today">
                          <span>Today</span>
                          <strong>+{dashboard?.today_visits ?? 0}</strong>
                          <p>human visits since 00:00 SGT</p>
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
                            <div key={`${country.country_code}-${country.region_code}-${country.city}-${country.postal_code}-${country.place_name}-${country.latitude}-${country.longitude}`}>
                              <span
                                title={[
                                  formatLocationLabel(country),
                                  formatLocationDetail(country),
                                  country.ip_addresses.length ? `IP: ${country.ip_addresses.join(', ')}` : '',
                                ].filter(Boolean).join('\n')}
                              >
                                {formatLocationLabel(country)}
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
                <div
                  className="attention-summary"
                  data-clickable={workspaceChangeCount > 0}
                  role={workspaceChangeCount > 0 ? 'button' : undefined}
                  tabIndex={workspaceChangeCount > 0 ? 0 : undefined}
                  onClick={() => { if (workspaceChangeCount > 0) setGitPanelOpen(true); }}
                  onKeyDown={(event) => {
                    if (workspaceChangeCount > 0 && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setGitPanelOpen(true);
                    }
                  }}
                  title={workspaceChangeCount > 0 ? 'Review and commit uncommitted changes' : undefined}
                >
                  <span>Needs attention</span>
                  <strong>{attentionCount}</strong>
                  <p className="attention-status" data-state={deploymentReadiness.state}>
                    {deploymentReadiness.message}
                  </p>
                  {deliverySyncStatus && deliverySyncStatus.state !== 'not_configured' && (
                    <div className="attention-version-pair" aria-label="Local and deployed content versions">
                      <span>Local <b>{deliverySyncStatus.local_head.slice(0, 7)}</b></span>
                      <span>Deployed <b>{deliverySyncStatus.remote_head.slice(0, 7)}</b></span>
                    </div>
                  )}
                </div>
                {(localDeliveryCount > 0 || remoteDeliveryCount > 0) && (
                  <div className="attention-actions">
                    {(deploymentReadiness.state === 'remote_ahead'
                      || deploymentReadiness.state === 'remote_unknown'
                      || deploymentReadiness.state === 'pulling') ? (
                        <button
                          type="button"
                          className="attention-pull"
                          disabled={!deploymentReadiness.canPull}
                          onClick={() => { void pullRemoteContent(); }}
                          title={deploymentReadiness.actionTitle}
                        >
                          {deploymentReadiness.state === 'pulling'
                            ? <LoaderCircle size={14} />
                            : <Download size={14} />}
                          {deploymentReadiness.state === 'pulling'
                            ? 'Pulling'
                            : `Pull ${remoteDeliveryCount}`}
                        </button>
                      ) : localDeliveryCount > 0 ? (
                        <button
                          type="button"
                          className="attention-deploy"
                          disabled={!canDeployCommittedContent && deploymentReadiness.state !== 'check_failed'}
                          onClick={() => {
                            if (deploymentReadiness.state === 'check_failed') {
                              void loadDeploymentPlan();
                            } else if (canDeployCommittedContent) {
                              setConfirmingDeploy(true);
                            }
                          }}
                          title={deploymentReadiness.actionTitle}
                        >
                          {deploymentReadiness.state === 'deploying' || deploymentReadiness.state === 'checking'
                            ? <LoaderCircle size={14} />
                            : deploymentReadiness.state === 'check_failed'
                              ? <RotateCcw size={14} />
                              : <UploadCloud size={14} />}
                          {deploymentReadiness.state === 'deploying'
                            ? 'Deploying'
                            : deploymentReadiness.state === 'checking'
                              ? 'Checking deployment'
                              : deploymentReadiness.state === 'check_failed'
                                ? 'Retry deploy check'
                                : `Deploy ${localDeliveryCount}`}
                        </button>
                      ) : null}
                  </div>
                )}
                {deployVerification && (
                  <details
                    key={`${deployVerification.remote.content_commit}:${deployVerification.verified}`}
                    className="delivery-verification"
                    data-verified={deployVerification.verified}
                    aria-live="polite"
                  >
                    <summary className="delivery-verification-summary" title="Toggle deployment details">
                      <strong className="delivery-verification-code">
                        {deployVerification.verified
                          ? <CheckCircle2 size={13} aria-hidden="true" />
                          : <AlertCircle size={13} aria-hidden="true" />}
                        <span>{deployVerification.verified ? 'DEPLOY::OK' : 'DEPLOY::FAIL'}</span>
                      </strong>
                      <code className="delivery-verification-commit">
                        {deployVerification.remote.content_commit.slice(0, 7)}
                      </code>
                      <span className="delivery-verification-target">
                        {deployVerification.verified ? 'SEO' : 'MISMATCH'}
                      </span>
                      <ChevronDown className="delivery-verification-toggle" size={12} aria-hidden="true" />
                    </summary>
                    <dl className="delivery-verification-details">
                      <div>
                        <dt>remote</dt>
                        <dd><code>{deployVerification.remote.content_commit}</code></dd>
                      </div>
                      {!deployVerification.verified && (
                        <div>
                          <dt>expected</dt>
                          <dd><code>{deployVerification.expected_content_commit}</code></dd>
                        </div>
                      )}
                      <div>
                        <dt>release</dt>
                        <dd>{deployedStaticRelease || (deployVerification.verified ? 'SEO verified' : 'unverified')}</dd>
                      </div>
                      <div>
                        <dt>runtime</dt>
                        <dd>{deployVerification.remote.health} · media {deployVerification.remote.media_root_ok ? 'ok' : 'failed'}</dd>
                      </div>
                      <div>
                        <dt>generated</dt>
                        <dd>{deployVerification.remote.generated_at}</dd>
                      </div>
                      {!deployVerification.verified && (
                        <div data-tone="error">
                          <dt>reason</dt>
                          <dd>{deployVerification.mismatch_reason || 'Remote content differs from local content'}</dd>
                        </div>
                      )}
                    </dl>
                  </details>
                )}
              </section>

              <section className="delivery-panel ds-acrylic" data-ds="">
                <div className="activity-carousel-bar delivery-carousel-bar">
                  <div className="activity-tabs" role="tablist" aria-label="Delivery views">
	                      {(['Release activity', 'Human traffic', 'Unique visitors', 'SEO traffic', 'GEO traffic'] as const).map((label, page) => (
	                      <button
                        type="button"
                        role="tab"
                        aria-selected={deliveryPage === page}
                        key={label}
	                        onClick={() => {
	                          setDeliveryPage(page as 0 | 1 | 2 | 3 | 4);
	                          setSelectedTrafficDate(null);
	                          setDashboardRankingMetric(null);
	                        }}
	                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="delivery-toolbar">
                    <span>{deliveryPage + 1} / 5</span>
                    <button
                      type="button"
	                      onClick={() => {
	                        setDeliveryPage(((deliveryPage + 4) % 5) as 0 | 1 | 2 | 3 | 4);
	                        setSelectedTrafficDate(null);
	                        setDashboardRankingMetric(null);
	                      }}
                      aria-label="Previous delivery page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
	                      onClick={() => {
	                        setDeliveryPage(((deliveryPage + 1) % 5) as 0 | 1 | 2 | 3 | 4);
	                        setSelectedTrafficDate(null);
	                        setDashboardRankingMetric(null);
	                      }}
                      aria-label="Next delivery page"
                    >
                      <ChevronRight size={14} />
                    </button>
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
	                          setDashboardRankingMetric(null);
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
                      activity={trafficActivity}
                      countMetric={trafficMode === 'unique' ? 'unique_visitors' : 'visits'}
                      noun={trafficMode === 'human' ? 'human visit' : trafficMode === 'unique' ? 'unique visitor' : trafficMode === 'seo' ? 'search visit' : 'AI discovery'}
                      selectedDate={selectedTrafficDate}
	                      onSelect={(date) => {
	                        setSelectedCommitDay(null);
	                        setDashboardRankingMetric(null);
	                        setSelectedTrafficDate((current) => current === date ? null : date);
	                      }}
                    />
                  )}
                </div>
              </section>

              <section className="recent-board ds-acrylic" data-ds="">
                <div className="activity-filter-bar">
                  <span>{activityFilterLabel}</span>
	                  {(selectedCommitDay || selectedTrafficDay || dashboardRankingMetric) && (
	                    <button
	                      type="button"
	                      onClick={() => {
	                        setSelectedCommitDay(null);
	                        setSelectedTrafficDate(null);
	                        setDashboardRankingMetric(null);
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
                  <div className={`traffic-result-list activity-result-list${trafficMode === 'geo' ? ' traffic-result-list--geo' : ''}`}>
                    {selectedTrafficDay.content.map((item, index) => {
                      const itemKey = `${item.content_type}-${item.title}`;
                      const canExpandVisitors = trafficMode === 'human' || trafficMode === 'unique';
                      const expanded = canExpandVisitors && expandedTrafficItem === itemKey;
                      return (
                        <div className="ranking-row" key={itemKey}>
                        <button
                        type="button"
                        className={expanded ? 'traffic-result-row traffic-result-row--expanded' : 'traffic-result-row'}
                        aria-expanded={canExpandVisitors ? expanded : undefined}
                        onClick={() => {
                          if (canExpandVisitors) {
                            setExpandedTrafficItem((current) => current === itemKey ? null : itemKey);
                          } else {
                            openFeedbackContent(item.content_type, { title: item.title }, false);
                          }
                        }}
                      >
                        <span>{index + 1}</span>
                        <strong>{item.title}</strong>
                        <small>
                          {trafficMode === 'unique'
                            ? `${item.unique_visitors} unique visitors`
                            : `${item.visits} visits`}
                        </small>
                        <small className="traffic-row-tail">
                          {trafficMode === 'unique' ? `${item.visits} visits` : `${item.comments} comments total`}
                          {canExpandVisitors && <ChevronDown size={13} aria-hidden="true" />}
                        </small>
                        {expanded && (
                          <span className="visitor-breakdown">
                            {item.visitors.length > 0 ? item.visitors.map((visitor, visitorIndex) => {
                              const visitorFlag = formatCountryFlag(visitor.country_code);
                              return (
                                <span className="visitor-location" key={`${visitor.country_code}-${visitor.region_code}-${visitor.city}-${visitor.postal_code}-${visitor.place_name}-${visitorIndex}`}>
                                  {visitorFlag && (
                                    <span className="visitor-location-flag" aria-hidden="true">{visitorFlag}</span>
                                  )}
                                  <span className="visitor-location-copy">
                                    <strong>{formatLocationLabel(visitor)}</strong>
                                    {visitor.ip_addresses.length > 0 && (
                                      <span className="visitor-ip-list">
                                        {visitor.ip_addresses.map((ip) => <code key={ip}>{ip}</code>)}
                                      </span>
                                    )}
                                  </span>
                                  <span className="visitor-location-metrics">
                                    <small>
                                      {trafficMode === 'unique'
                                        ? `${visitor.unique_visitors} unique visitor${visitor.unique_visitors === 1 ? '' : 's'}`
                                        : `${visitor.visits} ${visitor.visits === 1 ? 'visit' : 'visits'}`}
                                    </small>
                                    {trafficMode === 'unique' && (
                                      <small className="visitor-visit-count">
                                        {visitor.visits} {visitor.visits === 1 ? 'visit' : 'visits'}
                                      </small>
                                    )}
                                  </span>
                                </span>
                              );
                            }) : (
                              <small className="visitor-empty">No visitor location was recorded for these visits.</small>
                            )}
                          </span>
                        )}
                        {trafficMode !== 'human' && item.evidence.length > 0 && (
                          <span className="traffic-evidence">
                            {trafficMode === 'geo'
                              ? groupEvidenceByAgent(item.evidence).map(({ agent, event, visits, subjects, hiddenSubjectCount }) => (
                                  <span className="traffic-agent-group" key={agent}>
                                    <span className="traffic-agent-heading">
                                      <strong>{agent}</strong>
                                      <small className="traffic-agent-event">{event} · {visits}</small>
                                    </span>
                                    {subjects.length > 0 && (
                                      <span className="traffic-agent-topics">
                                        {subjects.map((subject) => (
                                          <small key={`${subject.kind}-${subject.label}`}>
                                            <span className="traffic-source-badge">{evidenceSourceLabel(subject.kind)}</span>
                                            <span className="traffic-source-value">{subject.label}</span>
                                            <b>{subject.visits}</b>
                                          </small>
                                        ))}
                                      </span>
                                    )}
                                    {subjects.length === 0 && (
                                      <span className="traffic-agent-topics traffic-agent-topics--single">
                                        <small>
                                          <span className="traffic-source-badge">{evidenceEventSourceLabel(event)}</span>
                                          <span className="traffic-source-value">{event}</span>
                                          <b>{visits}</b>
                                        </small>
                                      </span>
                                    )}
                                    <span className="traffic-agent-notes">
                                      {hiddenSubjectCount > 0 && <small>+{hiddenSubjectCount} more pages</small>}
                                      {subjects.every((subject) => !['ai_query', 'attributed_topic', 'keyword', 'search_query'].includes(subject.kind ?? '')) && (
                                        <small className="traffic-query-note">
                                          {/\b(crawl|indexing)\b/i.test(event)
                                            ? 'Crawler requests do not contain user queries'
                                            : 'Provider did not expose a query in the request'}
                                        </small>
                                      )}
                                    </span>
                                  </span>
                                ))
                              : item.evidence.map((evidence) => (
                                  <span className="traffic-evidence-card" key={`${evidence.agent}-${evidence.event}-${evidence.subject_kind}-${evidence.subject}`}>
                                    <span className="traffic-evidence-heading">
                                      <strong>{evidence.subject || evidence.event}</strong>
                                      <small>{evidence.visits} {evidence.visits === 1 ? 'visit' : 'visits'}</small>
                                    </span>
                                    <span className="traffic-evidence-meta">
                                      <span>{evidence.subject_kind ? evidenceSourceLabel(evidence.subject_kind) : evidenceEventSourceLabel(evidence.event)}</span>
                                      <span>{evidence.agent}</span>
                                      <span>{evidence.event}</span>
                                    </span>
                                    {!['keyword', 'search_query'].includes(evidence.subject_kind ?? '') && /\bindexing\b/i.test(evidence.event) && (
                                      <small className="traffic-query-note">Indexing crawls do not contain search queries</small>
                                    )}
                                  </span>
                                ))}
                          </span>
                        )}
                        </button>
                        {(trafficMode === 'geo' || trafficMode === 'seo') && (
                          <button
                            type="button"
                            className="ranking-row-action"
                            title={`Open ${item.title} and run its local GEO check`}
                            onClick={() => openFeedbackContent(item.content_type, { title: item.title }, true)}
                          >
                            GEO check
                          </button>
                        )}
                        </div>
                      );
                    })}
                    {selectedTrafficDay.content.length === 0 && <p>No content traffic for this date.</p>}
                  </div>
                ) : dashboardRankingMetric ? (
                  <div className="recent-list">
                    {dashboardRankingItems.map((item, index) => (
                      <div className="ranking-row" key={`${item.kind}-${item.slug}`}>
                        <button
                          type="button"
                          className="recent-row recent-row--ranking"
                          title={`Open ${item.title}`}
                          onClick={() => openFeedbackContent(item.kind, item, false)}
                        >
                          <span className="rank-badge">#{index + 1}</span>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                          <small className="ranking-count">
                            {item.count} {dashboardRankingNoun(dashboardRankingMetric, item.count)}
                          </small>
                        </button>
                        {editableMasonryContentKinds.has(item.kind) && (
                          <button
                            type="button"
                            className="ranking-row-action"
                            title={`Open ${item.title} and run its local GEO check`}
                            onClick={() => openFeedbackContent(item.kind, item, true)}
                          >
                            GEO check
                          </button>
                        )}
                      </div>
                    ))}
                    {dashboardRankingItems.length === 0 && (
                      <p className="activity-empty">
                        No content has {dashboardRankingLabels[dashboardRankingMetric].toLowerCase()} data yet.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="recent-list">
                    {(selectedCommitDay ? selectedCommitItems : visibleRecentItems).map((item) => (
                      <button
                        type="button"
                        key={`${item.entity_type}-${item.slug}`}
                        className="recent-row"
                        onClick={() => openShelf(item.entity_type === 'episode' ? 'blog' : item.entity_type as EntityFilter)}
                      >
                        <span className={badgeClass(item.entity_type as ContentKind)}>{item.entity_type}</span>
                        <strong>{item.title}</strong>
                        <small>{contentStateSummary(item.visibility)}</small>
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
              language={resumeLanguage}
              onLanguageChange={setResumeLanguage}
              managementEnabled={managementEnabled}
              markdownWorkspaceView={markdownWorkspaceView}
              onMarkdownWorkspaceViewChange={changeMarkdownWorkspaceView}
            />
          </section>
        ) : isUpdateShelf && !contentEditorOpen ? (
          <section className="editor-area moments-editor-area">
            {loading ? (
              <div className="empty">Reading moments...</div>
            ) : (
              <MomentFeed
                groups={updateGroups}
                empty={currentShelf.empty}
                query={query}
                settings={momentsSettings}
                languageByDocument={languageByDocument}
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
                  managementEnabled={managementEnabled}
                  onBack={() => setSelectedSeriesId('')}
                  onEditSeries={(series) => void openSeriesEditor(series)}
                  onEditEpisode={openContentGroup}
                  renderStateControls={renderStateControls}
                  seriesStateControls={managementEnabled
                    ? renderSeriesStateControls(selectedSeries, 'header')
                    : undefined}
                />
              ) : masonryGroups.length === 0 ? (
                <div className="empty content-empty">{query.trim() ? 'No matches for your search.' : currentShelf.empty}</div>
              ) : (
                <ContentMasonry groups={masonryGroups} renderCard={(group) => (
                    <ContentCard
                      key={group.id}
                      group={group}
                      onOpen={group.cardKind === 'series'
                        ? () => setSelectedSeriesId(group.id)
                        : openContentGroup}
                      stateControls={group.cardKind === 'series'
                        ? managementEnabled
                          ? renderSeriesStateControls(
                              episodeSeries.find((series) => `series:${series.id}` === group.id)!,
                              'card',
                            )
                          : undefined
                        : managementEnabled
                          ? renderStateControls(group, 'card')
                          : undefined}
                    />
                  )} />
              )
            ) : (
              <div className="workspace">
              <section className="library-panel" aria-label={`${currentShelf.label} content`}>
                <div className="library-head">
                  <div>
                    <span>{currentShelf.label}</span>
                    <strong>{filtered.length} parts</strong>
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
                            <small>{contentStateSummary(group.visibility)}</small>
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
                        <div>
                          <h2>{selected.title}</h2>
                          <p>{selected.role} · {selectedTranslation?.source_path}</p>
                        </div>
                      </div>
                    </header>

                    <div className="editor-frame" data-entity={selected.entity_type} data-toolbar={toolbarVisible ? 'visible' : 'hidden'}>
                      <div className="language-tabs" role="tablist" aria-label="Language representations">
                        {selectedEditorLanguages.map((language) => {
                          const translation = selected.translations.find((item) => item.language === language);
                          const generationKey = `${selected.id}:${language}`;
                          const generating = generatingTranslation === generationKey;
                          return (
                            <button
                              type="button"
                              key={language}
                              className={translation?.id === selectedTranslation?.id ? 'active' : ''}
                              disabled={saving || Boolean(syncingTranslation) || Boolean(generatingTranslation && !generating) || (!translation && !translationAvailability.enabled)}
                              title={translation
                                ? `Open ${language}`
                                : translationAvailability.reason || `Generate ${language} with OpenAI (asks for confirmation)`}
                              onClick={() => {
                                if (translation) {
                                  setLanguageByDocument((current) => ({
                                    ...current,
                                    [selected.id]: translation.language,
                                  }));
                                  return;
                                }
                                void requestMissingTranslation(language);
                              }}
                            >
                              {language}
                              {generating ? <LoaderCircle size={12} /> : !translation ? <Sparkles size={12} /> : null}
                              {translation && dirtyIds.has(translation.id) && <span />}
                            </button>
                          );
                        })}
                      </div>
                      {selectedTranslation ? (
                        <MarkdownDocumentWorkspace
                          key={`${selectedTranslation.id}:shelf`}
                          ref={editorRef}
                          view={markdownWorkspaceView}
                          value={selectedTranslation.content}
                          defaultTitle={selectedTranslation.title || selected.title}
                          ariaLabel={`${selected.title} ${selected.role} Markdown editor`}
                          previewLabel={`${selected.title} · ${selected.role} · ${selectedTranslation.language}`}
                          activity={workspaceActivity}
                          disabled={false}
                          toolbarVisible={toolbarVisible}
                          reviewFindings={selectedReviewFindings}
                          onReviewFindingActivate={languageReview.openReport}
                          slashCommands={editorAssist.slashCommands}
                          onImportImages={importImagesToSelected}
                          onSelectionAssist={requestSelectionAssist}
                          selectionAssistDisabledReason={selectionAssistAvailability.reason}
                          onChange={patchSelectedTranslationContent}
                        />
                      ) : (
                        <div className="empty large">Choose or generate a language representation.</div>
                      )}
                    </div>
                  </>
                ) : null}
              </section>
            </div>
            )}
          </section>
        )}

        {screen === 'settings' ? null : screen === 'dashboard' ? (
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
            <button type="button" className="moment-trigger" onClick={(event) => openCaptureFromTrigger('moment', event)}><Aperture size={15} />Catch moment</button>
            <button type="button" onClick={openNewProject}><Plus size={15} />New project</button>
            <button type="button" onClick={(event) => openCaptureFromTrigger('blog', event)}><PencilLine size={15} />Write blog</button>
          </div>
        ) : isUpdateShelf && !contentEditorOpen ? (
          <div className="quick-dock moment-dock" aria-label="Moment shortcuts">
            <button type="button" className="moment-trigger" onClick={() => openCapture('moment')}><Aperture size={15} />Catch moment</button>
            <button type="button" onClick={() => openCapture('blog')}><PencilLine size={15} />Write blog</button>
            <button type="button" onClick={() => setCommitPanelScope('moment')} title="Open Moments Git version status">
              <GitBranch size={15} />
              Version
            </button>
            {renderSectionCommitButton('moment')}
          </div>
        ) : shelfDockMode ? (
          <div className="quick-dock shelf-action-dock" aria-label={`${currentShelf.label} shortcuts`}>
            {(shelfDockMode === 'resume' || shelfDockMode === 'blog' || shelfDockMode === 'project') && (
              <ShelfInteractionModeToggle
                mode={shelfInteractionMode}
                onToggle={() => dispatchShelfInteractionMode({ type: 'toggle' })}
              />
            )}
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
            <button type="button" onClick={() => setCommitPanelScope(shelfDockMode)} title={`Open ${currentShelf.label} Git version status`}>
              <GitBranch size={15} />
              Version
            </button>
            {renderSectionCommitButton(shelfDockMode)}
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
            <div className="save-dock-actions">
              {selected && (
                <MarkdownWorkspaceViewToggle
                  className="save-dock-view-toggle"
                  view={markdownWorkspaceView}
                  onChange={changeMarkdownWorkspaceView}
                />
              )}
              <span role="status">{saving ? 'Saving automatically…' : saveFailed ? 'Save failed · retrying' : dirty ? 'Autosave pending…' : 'All changes saved'}</span>
            </div>
          </div>
        )}

        {confirmingRefresh && (
          <RefreshConfirmDialog
            dirtyCount={dirtyIds.size}
            onCancel={cancelRefresh}
            onConfirm={confirmRefresh}
          />
        )}

        {confirmingDeploy && deploymentPlan && (
          <Dialog open onClose={() => setConfirmingDeploy(false)}>
            <DialogCard aria-labelledby="deploy-confirm-title">
              <div className="dialog-headline">
                <div className="new-project-badge">
                  <UploadCloud size={17} />
                </div>
                {renderLanguageCloseControls({
                  closeLabel: 'Cancel deployment',
                  closeSize: 15,
                  onClose: () => setConfirmingDeploy(false),
                })}
              </div>
              <DialogTitle id="deploy-confirm-title">Deploy content to production?</DialogTitle>
              <DialogDescription>This publishes committed content and media to {deploymentPlan.deploy_target}, then builds and atomically activates a fresh server-side SEO snapshot.</DialogDescription>
              <div className="deploy-confirm-summary">
                <span>Local commit</span>
                <strong>{deploymentPlan.head}</strong>
              </div>
              <DialogActions>
                <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmingDeploy(false)}>Cancel</Button>
                <Button type="button" variant="primary" size="sm" onClick={() => void deployContent()}>
                  <UploadCloud size={14} />
                  Deploy content
                </Button>
              </DialogActions>
            </DialogCard>
          </Dialog>
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

        {commitPanelScope && (
          <SectionCommitPanel
            key={commitPanelScope}
            scope={commitPanelScope}
            unsavedCount={dirtyIds.size}
            onClose={() => setCommitPanelScope(null)}
            onCommitted={sectionCommitCompleted}
          />
        )}

        {seriesEditingSlug && (
          <section className="resume-editor-workspace series-editor-workspace" role="dialog" aria-modal="true" aria-labelledby="series-editor-title">
            <header className="resume-editor-topbar">
              <div className="resume-editor-title">
                <span>Episode series</span>
                <strong id="series-editor-title">{seriesDraft.title || 'Edit series'}</strong>
                <em>{seriesSource?.relative_path || `content/resources/episode/${seriesEditingSlug}/series.toml`}</em>
              </div>
              {renderLanguageCloseControls({
                disabled: seriesEditorSaving,
                closeLabel: 'Close series editor',
                closeSize: 15,
                closeText: 'Close',
                onClose: closeSeriesEditor,
              })}
            </header>

            <div className="resume-editor-body content-settings-body">
              <aside className="resume-editor-outline content-settings-sidebar">
                <SettingsPageNavigation
                  items={seriesSettingsPages}
                  activePage={seriesSettingsPage}
                  onChange={setSeriesSettingsPage}
                  label="Series settings pages"
                />
              </aside>
              <main className="resume-editor-canvas">
                <div className="resume-form resume-form--workspace content-settings-form">
                  {seriesSettingsPage === 'overview' && (
                    <>
                      <SettingsPageIntro
                        eyebrow="Series settings"
                        title={seriesSettingsPageTitle('overview')}
                        description="Set the name and short promise readers see before opening an episode."
                      />
                      <section className="resume-editor-section content-settings-section">
                        <div className="content-settings-grid">
                          <label className="content-settings-field content-settings-field--wide">
                            <span>Series title</span>
                            <small>The public name used on the series card, detail page, and episode navigation.</small>
                            <input
                              type="text"
                              value={seriesDraft.title}
                              onChange={(event) => setSeriesDraft((current) => ({ ...current, title: event.target.value }))}
                              disabled={seriesEditorLoading || seriesEditorSaving}
                            />
                          </label>
                          <label className="content-settings-field content-settings-field--wide">
                            <span>Series summary</span>
                            <small>Explain the concrete outcome of the series so readers can decide whether to start it.</small>
                            <textarea
                              value={seriesDraft.description}
                              onChange={(event) => setSeriesDraft((current) => ({ ...current, description: event.target.value }))}
                              disabled={seriesEditorLoading || seriesEditorSaving}
                              rows={5}
                            />
                          </label>
                        </div>
                      </section>
                    </>
                  )}

                  {seriesSettingsPage === 'cover' && (
                    <>
                      <SettingsPageIntro
                        eyebrow="Series settings"
                        title={seriesSettingsPageTitle('cover')}
                        description="Choose the image that helps readers recognize this series in the blog index."
                      />
                      <section className="resume-editor-section content-settings-section content-settings-cover-section">
                        <div className="content-settings-section-heading">
                          <h3>Current cover</h3>
                          <p>Upload a replacement or remove the current cover. File storage is managed automatically.</p>
                        </div>
                        <ResumeMediaField
                          fieldKey="cover_url"
                          value={seriesDraft.cover_url}
                          previewUrl={seriesCoverLocalPreview || toWebviewMediaUrl(seriesSource?.cover_media) || ''}
                          saving={seriesEditorLoading || seriesEditorSaving}
                          busy={seriesCoverBusy}
                          error={seriesCoverError}
                          previewSize="cover"
                          showIcons={false}
                          onRemove={() => {
                            setSeriesDraft((current) => ({ ...current, cover_url: '' }));
                            setSeriesCoverError(undefined);
                            setSeriesCoverLocalPreview('');
                          }}
                          onUpload={async (file) => {
                            setSeriesCoverBusy(true);
                            setSeriesCoverError(undefined);
                            try {
                              const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                              const imported = await invoke<ImportedMediaAsset>('import_episode_series_media_asset', {
                                seriesSlug: seriesEditingSlug,
                                fileName: file.name,
                                bytes,
                              });
                              setSeriesDraft((current) => ({ ...current, cover_url: imported.uri }));
                              setSeriesCoverLocalPreview(
                                imported.local_path ? toWebviewMediaUrl(imported.local_path) : URL.createObjectURL(file),
                              );
                            } catch (reason) {
                              setSeriesCoverError(String(reason));
                            } finally {
                              setSeriesCoverBusy(false);
                            }
                          }}
                        />
                      </section>
                      <section className="resume-editor-section content-settings-section content-settings-cover-section">
                        <div className="content-settings-section-heading">
                          <h3>Generate a cover</h3>
                          <p>Turn the series promise into an editorial brief, generate an image with OpenAI, then review it before selecting it.</p>
                        </div>
                        <AiCoverGenerator
                          key={`series-cover:${seriesEditingSlug}`}
                          target={{ uri: `silan://resources/episode/${seriesEditingSlug}` }}
                          contentKind="series"
                          title={seriesDraft.title}
                          description={seriesDraft.description}
                          language={chromeLanguage}
                          disabled={seriesEditorLoading || seriesEditorSaving}
                          onConfigureOpenAi={() => openWorkspaceSettings(true)}
                          onUse={(asset) => {
                            setSeriesDraft((current) => ({ ...current, cover_url: asset.uri }));
                            setSeriesCoverLocalPreview(toWebviewMediaUrl(asset.local_path || asset.uri));
                            setSeriesCoverError(undefined);
                          }}
                        />
                      </section>
                    </>
                  )}

                  {seriesSettingsPage === 'publishing' && (
                    <>
                      <SettingsPageIntro
                        eyebrow="Series settings"
                        title={seriesSettingsPageTitle('publishing')}
                        description="Change whether the episodes in this series are available on the public site."
                      />
                      <section className="resume-editor-section content-settings-section">
                        <div className="content-settings-section-heading">
                          <h3>Series availability</h3>
                          <p>These actions update every episode together. Save any open episode edits before changing the series state.</p>
                        </div>
                        {editingSeries ? renderSeriesStateControls(editingSeries, 'header') : (
                          <div className="version-loading">
                          <span>Reading series state...</span>
                          </div>
                        )}
                      </section>
                    </>
                  )}

                  {seriesSettingsPage === 'source' && (
                    <>
                      <SettingsPageIntro
                        eyebrow="Series settings"
                        title={seriesSettingsPageTitle('source')}
                        description="Inspect the stable identifier and the file that owns this series metadata."
                      />
                      <section className="resume-editor-section content-settings-section">
                        <div className="content-settings-grid">
                          <label className="content-settings-field">
                            <span>Series slug</span>
                            <small>The stable folder and URL identifier. Rename it in source control to avoid broken episode links.</small>
                            <input type="text" value={seriesEditingSlug} disabled />
                          </label>

                          <label className="content-settings-field content-settings-field--wide">
                            <span>Metadata source</span>
                            <small>The TOML file read and written by this settings editor.</small>
                            <input type="text" value={seriesSource?.relative_path || `content/resources/episode/${seriesEditingSlug}/series.toml`} disabled />
                          </label>
                        </div>
                      </section>
                    </>
                  )}

                  {seriesEditorLoading && (
                    <div className="version-loading">
                      <span>Reading series...</span>
                    </div>
                  )}

                  {seriesEditorError && (
                    <div className="content-settings-error" role="alert">
                      <span>{seriesEditorError}</span>
                    </div>
                  )}
                </div>
              </main>
            </div>

            <div className="resume-editor-actions" aria-label="Series editor actions">
              <button
                type="button"
                className="resume-editor-save"
                disabled={!seriesSource || !seriesDraft.title.trim() || seriesEditorLoading || seriesEditorSaving}
                onClick={() => void saveSeriesEditor()}
              >
                {seriesEditorLoading ? 'Loading' : seriesEditorSaving ? 'Saving' : 'Save series'}
              </button>
            </div>
          </section>
        )}

        {gitPanelOpen && (
          <GitChangesPanel
            onClose={() => setGitPanelOpen(false)}
            onCommitted={() => { void Promise.all([loadDeploymentPlan(), loadDeliverySyncStatus()]); }}
          />
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
                {contentRailPanel === 'parts' && (
                  <>
                  <div className="quick-dock content-editor-actions" aria-label="Editor tools">
                    <MarkdownWorkspaceViewToggle
                      className="content-close content-view-toggle"
                      view={markdownWorkspaceView}
                      onChange={changeMarkdownWorkspaceView}
                      showLabel
                    />
                    {selected.entity_type === 'moment' && (
                      <button
                        type="button"
                        className="content-close content-write-up-toggle"
                        onClick={() => void writeMomentUpAsArticle()}
                        disabled={relationshipBusy !== ''}
                        title="Create a new blog article from this moment and open it (not committed)"
                      >
                        {relationshipBusy === 'moment-create-blog' ? <LoaderCircle size={15} /> : <PencilLine size={15} />}
                        <span>Write it up as an article</span>
                      </button>
                    )}
                    {languageReviewAvailable && (
                      <button
                        type="button"
                        className={`content-close content-language-review-toggle ${languageReview.state.visible ? 'active' : ''}`}
                        onClick={() => void runCurrentLanguageReview()}
                        title={dirty
                          ? 'Save this language before review'
                          : reviewAvailability.reason || 'Review the current language with DeepSeek (paid; asks for confirmation)'}
                        disabled={dirty || reviewRunning || !reviewAvailability.enabled}
                      >
                        {reviewRunning ? <LoaderCircle size={15} /> : <FileSearch size={15} />}
                        <span>Reader review · DeepSeek</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={`content-close content-geo-toggle ${geoPanelOpen ? 'active' : ''}`}
                      onClick={() => void openGeoPanel()}
                      title="Run the local AI/GEO readiness check (no AI provider is called)"
                      disabled={!selectedTranslation || geoLoading}
                    >
                      {geoLoading ? <LoaderCircle size={15} /> : <Search size={15} />}
                      <span>GEO check</span>
                    </button>
                    <button
                      type="button"
                      className={`content-close content-toolbar-toggle ${toolbarVisible ? 'active' : ''}`}
                      aria-pressed={toolbarVisible}
                      onClick={toggleToolbar}
                      title={toolbarVisible ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                    >
                      <Type size={15} />
                      <span>Toolbar</span>
                    </button>
                  </div>
                  <span className="content-editor-save-status" role="status">
                    {saving ? 'Saving…' : sourceConflict ? 'Source conflict · draft kept' : saveFailed ? 'Save failed · retrying' : dirty ? 'Autosave pending…' : 'Saved'}
                  </span>
                  </>
                )}
              </header>

              {renderLanguageCloseControls({
                fixed: true,
                closeLabel: contentRailPanel === 'settings' ? 'Close settings' : 'Close content editor',
                closeTitle: contentRailPanel === 'settings' ? 'Close settings' : 'Close content editor',
                closeText: contentRailPanel === 'settings' ? 'Close' : undefined,
                disabled: contentRailPanel === 'settings' && metadataSavingId === selectedContentGroup.id,
                onClose: closeContentEditorLayer,
              })}

              {sourceConflict && (
                <div className="error" role="alert">
                  The source changed on disk. Your draft is retained.
                  <button type="button" onClick={() => setConflictReviewOpen(true)}>Review conflict</button>
                </div>
              )}
              {creationNotice && (
                <div className="creation-notice" role="status">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>{creationNotice}</span>
                  <button type="button" onClick={() => setCreationNotice(null)} aria-label="Dismiss notice">
                    <X size={13} />
                  </button>
                </div>
              )}
              {(saveFailed || metadataError) && !sourceConflict && (
                <div className="error" role="alert">{metadataError || error || 'Save failed. Your draft is retained.'}</div>
              )}
              <div className="content-editor-body" data-panel={contentRailPanel}>
                {contentRailPanel !== 'settings' && (
                <aside className="content-part-rail" aria-label="Content side rail">
                  <header className="content-explorer-top">
                    <div className="content-explorer-window-space" data-tauri-drag-region aria-hidden="true" />
                    <button
                      type="button"
                      className="content-explorer-icon"
                      aria-label="Open content settings"
                      title="Open content settings"
                      onClick={() => {
                        setContentSettingsPage('overview');
                        setContentRailPanel('settings');
                      }}
                    >
                      <Cog size={20} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="content-explorer-title"
                      aria-label={`${contentRailMode.toUpperCase()} · Switch to ${nextContentRailMode[contentRailMode].toUpperCase()}`}
                      title={`Switch to ${nextContentRailMode[contentRailMode].toUpperCase()}`}
                      onClick={() => openContentRailMode(nextContentRailMode[contentRailMode])}
                    >
                      {contentRailMode.toUpperCase()}
                    </button>
                  </header>

                  <nav className="content-explorer-tree" aria-label="Content navigation">
                    {selectedContentGroup.documents.length === 0 ? (
                      <div className="content-explorer-empty">No content selected.</div>
                    ) : contentRailMode === 'outline' ? (
                      <ContentOutline key={selectedTranslation?.id} markdown={selectedTranslation?.content || ''} language={chromeLanguage} />
                    ) : contentRailMode === 'interaction' ? (
                      <>
                        {selected.entity_type === 'episode' && selectedSeries && (
                          <div className="content-tree-section" role="group" aria-label="Episode interactions">
                            {selectedSeries.episodes.map((episode) => (
                              <button
                                type="button"
                                key={episode.id}
                                className={`content-tree-row ${episode.id === selected.entity_id ? 'active' : ''}`}
                                onClick={() => openContentGroupInteraction(episode)}
                              >
                                <span>{episode.episodeNumber != null ? `${episode.episodeNumber}. ` : ''}{episode.title}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="content-tree-section content-tree-section--interactions" role="group" aria-label="Interaction sections">
                          <button
                            type="button"
                            className={`content-tree-row content-tree-row--interaction ${interactionRailSection === 'likers' ? 'active' : ''}`}
                            onClick={() => focusInteractionSection('likers')}
                          >
                            <span><Heart size={13} aria-hidden="true" />{chromeLanguage === 'zh' ? '点赞的人' : 'Liked by'}</span>
                          </button>
                          <button
                            type="button"
                            className={`content-tree-row content-tree-row--interaction ${interactionRailSection === 'comments' ? 'active' : ''}`}
                            onClick={() => focusInteractionSection('comments')}
                          >
                            <span><MessageCircle size={13} aria-hidden="true" />{chromeLanguage === 'zh' ? '评论' : 'Comments'}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {selected.entity_type === 'episode' && selectedSeries && (
                          <div className="content-tree-section" role="group" aria-label="Series episodes">
                            <button
                              type="button"
                              className="content-tree-row content-tree-row--tool"
                              onClick={() => void openSeriesEditor(selectedSeries)}
                            >
                              <span>Series settings</span>
                            </button>
                            {selectedSeries.episodes.map((episode) => (
                              <button
                                type="button"
                                key={episode.id}
                                className={`content-tree-row ${episode.id === selected.entity_id ? 'active' : ''}`}
                                onClick={() => openContentGroup(episode)}
                              >
                                <span>{episode.episodeNumber != null ? `${episode.episodeNumber}. ` : ''}{episode.title}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="content-tree-section" role="group" aria-label="Markdown parts">
                          {selectedContentGroup.documents.map((document) => {
                            const reviewFindingCount = languageReviewCountForDocument(document);
                            const activeTranslationId = document.translations.find(
                              (translation) => translation.language === languageByDocument[document.id],
                            )?.id || document.translations[0]?.id || '';
                            return (
                              <button
                                type="button"
                                key={document.id}
                                className={`content-tree-row ${contentRailPanel === 'parts' && document.id === selected?.id ? 'active' : ''}`}
                                onClick={() => {
                                  setContentRailMode('files');
                                  setContentRailPanel('parts');
                                  setSelectedId(document.id);
                                }}
                              >
                                <span>{document.role}</span>
                                <span className="content-tree-row-state">
                                  {reviewFindingCount != null && (
                                    <small
                                      className="content-tree-review-count"
                                      data-state={reviewFindingCount === 0 ? 'pass' : 'review'}
                                      aria-label={`${reviewFindingCount} reader review findings`}
                                    >
                                      {reviewFindingCount === 0 ? '✓' : reviewFindingCount}
                                    </small>
                                  )}
                                  {dirtyIds.has(activeTranslationId) && <i aria-label="Unsaved changes" />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {showTranslationSync && (
                          <div className="content-sidebar-sync">
                            <button
                              type="button"
                              className={aiTranslationBusy ? 'active' : ''}
                              onClick={() => void syncCounterpartTranslation()}
                              title={counterpartDirty
                                ? `Save ${counterpartLanguage} before syncing it from ${selectedTranslation?.language}`
                                : translationAvailability.reason || `${aiTranslationTitle} · OpenAI (asks for confirmation)`}
                              disabled={saving || aiTranslationBusy || counterpartDirty || !translationAvailability.enabled}
                            >
                              <strong>
                                {aiTranslationBusy
                                  ? `Syncing ${selectedTranslation?.language} → ${counterpartLanguage}`
                                  : `Sync ${selectedTranslation?.language} → ${counterpartLanguage}`}
                              </strong>
                              <small>
                                {counterpartDirty
                                  ? `Save the current ${counterpartLanguage} changes first`
                                  : counterpartTranslation
                                    ? `${pendingSourceChanges?.affected || 0} changed block${pendingSourceChanges?.affected === 1 ? '' : 's'} · preserve the rest`
                                    : `Save ${selectedTranslation?.language} and create ${counterpartLanguage}`}
                                {' · OpenAI'}
                              </small>
                            </button>
                            <PaidAiUnavailableHint kind="translation" />
                          </div>
                        )}
                      </>
                    )}
                  </nav>
                  {languageReviewAvailable && contentRailMode === 'files' && (
                    <section className="content-sidebar-review" aria-label="DeepSeek reader review">
                      <div>
                        <FileSearch size={14} />
                        <span>Reader review · DeepSeek</span>
                      </div>
                      <button
                        type="button"
                        disabled={dirty || reviewRunning || !reviewAvailability.enabled}
                        title={dirty ? 'Save this language before review' : reviewAvailability.reason || 'DeepSeek · asks for confirmation'}
                        onClick={() => void runCurrentLanguageReview()}
                      >
                        <strong>{reviewRunning ? 'Reviewing…' : 'Current language'}</strong>
                        <small>{selectedTranslation?.language} · saved source</small>
                      </button>
                      <button
                        type="button"
                        disabled={reviewScopeDirty || reviewRunning || !reviewAvailability.enabled}
                        title={reviewScopeDirty ? 'Save all target documents before review' : reviewAvailability.reason || 'DeepSeek · asks for confirmation'}
                        onClick={() => void runResourceLanguageReview()}
                      >
                        <strong>
                          {selected?.entity_type === 'episode' ? 'Complete series' : 'Complete article'}
                        </strong>
                        <small>
                          {reviewScopeDirty
                            ? 'Save pending changes first'
                            : `${reviewScopeDocuments.length} Markdown part${reviewScopeDocuments.length === 1 ? '' : 's'}`}
                        </small>
                      </button>
                      <PaidAiUnavailableHint kind="reader_review" />
                    </section>
                  )}
                </aside>
                )}

                <div className="content-main-panel">
                  <section
                    className={`content-writing-panel ${contentRailPanel === 'parts' ? '' : 'is-hidden'}`}
                    aria-label="Content Markdown editor"
                    aria-hidden={contentRailPanel !== 'parts'}
                  >

                    <div className="editor-frame content-editor-frame" data-entity={selected.entity_type} data-toolbar={toolbarVisible ? 'visible' : 'hidden'}>
                      {selectedTranslation ? (
                        <MarkdownDocumentWorkspace
                          key={`${selectedTranslation.id}:overlay`}
                          ref={editorRef}
                          view={markdownWorkspaceView}
                          value={selectedTranslation.content}
                          defaultTitle={selectedTranslation.title || selected.title}
                          ariaLabel={`${selected.title} ${selected.role} Markdown editor`}
                          previewLabel={`${selected.title} · ${selected.role} · ${selectedTranslation.language}`}
                          activity={workspaceActivity}
                          disabled={false}
                          toolbarVisible={toolbarVisible}
                          documentMeta={{
                            authorName: workspacePreferences?.identity.display_name || 'Silan Hu',
                            authorAvatarUrl: workspacePreferences?.identity.avatar_url
                              ? toWebviewMediaUrl(workspacePreferences.identity.avatar_url)
                              : undefined,
                            authorAvatarLabel: workspacePreferences?.identity.avatar_label || 'S',
                            modifiedAt: selected.updated_at,
                            modifiedLabel: `Modified ${formatShortDate(selected.updated_at)}`,
                          }}
                          reviewFindings={selectedReviewFindings}
                          onReviewFindingActivate={languageReview.openReport}
                          slashCommands={editorAssist.slashCommands}
                          onImportImages={importImagesToSelected}
                          onSelectionAssist={requestSelectionAssist}
                          selectionAssistDisabledReason={selectionAssistAvailability.reason}
                          onChange={patchSelectedTranslationContent}
                        />
                      ) : (
                        <div className="empty large">Choose or generate a language representation.</div>
                      )}
                      {editorAssist.fileInput}
                    </div>
                    {mediaDragActive && (
                      <div className="media-drop-overlay" role="status">
                        <div>
                          <UploadCloud size={26} />
                          <strong>Drop into {selected.role}</strong>
                          <span>Attach and insert into this document</span>
                        </div>
                      </div>
                    )}
                    {(mediaImporting || mediaDropError || lastImportedAsset) && (
                      <div className="media-import-toast" data-state={mediaDropError ? 'error' : mediaImporting ? 'loading' : 'done'}>
                        {mediaDropError ? <AlertCircle size={14} /> : mediaImporting ? <LoaderCircle size={14} /> : <FileImage size={14} />}
                        <span>
                          {mediaDropError || (mediaImporting
                            ? 'Importing media asset...'
                            : `${lastImportedAsset?.file_name} attached and inserted`)}
                        </span>
                      </div>
                    )}
                  </section>
                  {contentRailPanel === 'settings' && (
                    <section className="content-settings-panel content-settings-panel--metadata" aria-label="Content settings">
                      <header className="resume-editor-topbar content-settings-topbar">
                        <div className="resume-editor-title">
                          <span>{selected.entity_type.toUpperCase()} SETTINGS</span>
                          <strong>{selectedContentGroup.title}</strong>
                          <em>{selectedContentGroup.slug}</em>
                        </div>
                      </header>
                      <div className="resume-editor-body content-settings-body">
                        <aside className="resume-editor-outline content-settings-sidebar">
                          <SettingsPageNavigation
                            items={contentSettingsPagesFor(selectedContentGroup.kind, Boolean(selectedMetadataCoverLabel))}
                            activePage={contentSettingsPage}
                            onChange={setContentSettingsPage}
                            label={`${selected.entity_type} settings pages`}
                          />
                        </aside>
                        <main className="resume-editor-canvas">
                          <div className="resume-form resume-form--workspace content-settings-form">
                            {contentSettingsPage === 'overview' && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('overview')}
                                  description="Set the promise readers see in listings, search results, and the page header."
                                />
                                <section className="resume-editor-section content-settings-section">
                                  <div className="content-settings-grid">
                                    <label className="content-settings-field content-settings-field--wide">
                                      <span>Title</span>
                                      <small>The public name shown on cards, page headings, and browser metadata.</small>
                                      <input
                                        type="text"
                                        value={metadataDraft.title}
                                        onChange={(event) => setMetadataDraft((current) => ({ ...current, title: event.target.value }))}
                                        disabled={metadataSavingId === selectedContentGroup.id}
                                      />
                                    </label>
                                    {selectedMetadataSummaryLabel && (
                                      <label className="content-settings-field content-settings-field--wide">
                                        <span>{selectedMetadataSummaryLabel}</span>
                                        <small>A concise explanation of the problem and outcome, used where readers decide whether to open this page.</small>
                                        <textarea
                                          rows={5}
                                          value={metadataDraft.description}
                                          onChange={(event) => setMetadataDraft((current) => ({ ...current, description: event.target.value }))}
                                          disabled={metadataSavingId === selectedContentGroup.id}
                                        />
                                      </label>
                                    )}
                                    {selectedContentGroup.kind === 'moment' && (
                                      <>
                                        <div className="content-settings-control">
                                          <span>Moment type</span>
                                          <small>The semantic event class used by timeline and query surfaces.</small>
                                          <Select
                                            aria-label="Moment type"
                                            value={metadataDraft.moment_type}
                                            disabled={metadataSavingId === selectedContentGroup.id}
                                            onChange={(event) => setMetadataDraft((current) => ({
                                              ...current,
                                              moment_type: event.target.value,
                                            }))}
                                          >
                                            {momentTypes.map((momentType) => (
                                              <option key={momentType} value={momentType}>{momentType}</option>
                                            ))}
                                          </Select>
                                        </div>
                                        <div className="content-settings-control">
                                          <span>Priority</span>
                                          <small>Editorial importance; independent from lifecycle and visibility.</small>
                                          <Select
                                            aria-label="Moment priority"
                                            value={metadataDraft.priority}
                                            disabled={metadataSavingId === selectedContentGroup.id}
                                            onChange={(event) => setMetadataDraft((current) => ({
                                              ...current,
                                              priority: event.target.value,
                                            }))}
                                          >
                                            {momentPriorities.map((priority) => (
                                              <option key={priority} value={priority}>{priority}</option>
                                            ))}
                                          </Select>
                                        </div>
                                        <label className="content-settings-field content-settings-field--wide">
                                          <span>Tags</span>
                                          <small>Comma-separated semantic topics. A leading # is normalized automatically.</small>
                                          <Input
                                            value={metadataDraft.tags}
                                            disabled={metadataSavingId === selectedContentGroup.id}
                                            placeholder="research, systems, lexical"
                                            onChange={(event) => setMetadataDraft((current) => ({
                                              ...current,
                                              tags: event.target.value,
                                            }))}
                                          />
                                        </label>
                                      </>
                                    )}
                                  </div>
                                </section>
                              </>
                            )}

                            {contentSettingsPage === 'cover' && selectedMetadataCoverLabel && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('cover')}
                                  description="Choose the visual readers use to recognize this page before they open it."
                                />
                                <section className="resume-editor-section content-settings-section content-settings-cover-section">
                                  <div className="content-settings-section-heading">
                                    <h3>
                                      {selectedContentGroup.kind === 'project' && metadataDraft.cover_source_type === 'website'
                                        ? 'Website cover'
                                        : 'Current cover'}
                                    </h3>
                                    <p>
                                      {selectedContentGroup.kind === 'project' && metadataDraft.cover_source_type === 'website'
                                        ? 'Enter the fixed website address used for this project cover.'
                                        : 'Upload a replacement or remove the current cover. File storage is managed automatically.'}
                                    </p>
                                  </div>
                                  {selectedContentGroup.kind === 'project' && (
                                    <div className="content-settings-control">
                                      <span>Cover source</span>
                                      <small>Use an uploaded image, or keep the cover tied to a live website.</small>
                                      <div className="content-cover-type-group" role="radiogroup" aria-label="Cover source">
                                        <button
                                          type="button"
                                          role="radio"
                                          aria-checked={metadataDraft.cover_source_type === 'image'}
                                          className={metadataDraft.cover_source_type === 'image' ? 'active' : ''}
                                          disabled={metadataSavingId === selectedContentGroup.id}
                                          onClick={() => setMetadataDraft((current) => ({ ...current, cover_source_type: 'image' }))}
                                        >
                                          Image
                                        </button>
                                        <button
                                          type="button"
                                          role="radio"
                                          aria-checked={metadataDraft.cover_source_type === 'website'}
                                          className={metadataDraft.cover_source_type === 'website' ? 'active' : ''}
                                          disabled={metadataSavingId === selectedContentGroup.id}
                                          onClick={() => setMetadataDraft((current) => ({ ...current, cover_source_type: 'website' }))}
                                        >
                                          Website
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {metadataDraft.cover_source_type === 'image' ? (
                                    <ResumeMediaField
                                      fieldKey="cover_url"
                                      value={metadataDraft.cover_url}
                                      previewUrl={selectedCoverPreviewUrl}
                                      saving={metadataSavingId === selectedContentGroup.id}
                                      busy={metadataCoverBusy}
                                      error={metadataCoverError}
                                      previewSize="cover"
                                      showIcons={false}
                                      onUpload={(file) => void uploadMetadataCover(file)}
                                      onRemove={() => {
                                        setMetadataDraft((current) => ({ ...current, cover_url: '' }));
                                        setMetadataCoverError(undefined);
                                        setMetadataCoverLocalPreview('');
                                      }}
                                    />
                                  ) : selectedContentGroup.kind === 'project' ? (
                                    <label className="content-settings-field content-settings-field--wide">
                                      <span>Website address</span>
                                      <small>The live website used when the project cover is refreshed.</small>
                                      <Input
                                        type="url"
                                        value={metadataDraft.cover_website_url}
                                        onChange={(event) => setMetadataDraft((current) => ({ ...current, cover_website_url: event.target.value }))}
                                        disabled={metadataSavingId === selectedContentGroup.id}
                                        placeholder="https://example.com"
                                      />
                                    </label>
                                  ) : null}
                                </section>
                                {(selectedContentGroup.kind === 'blog' || selectedContentGroup.kind === 'project') && selectedMetadataTranslation && (
                                  <section className="resume-editor-section content-settings-section content-settings-cover-section">
                                    <div className="content-settings-section-heading">
                                      <h3>Generate a cover</h3>
                                      <p>Turn the page promise into an editorial brief, generate with OpenAI, and select the result only after review.</p>
                                    </div>
                                    <AiCoverGenerator
                                      key={`${selectedContentGroup.kind}-cover:${selectedContentGroup.id}:${selectedMetadataTranslation.language}`}
                                      target={{ uri: `silan://resources/${selectedContentGroup.kind === 'project' ? 'projects' : 'blog'}/${selectedContentGroup.slug}` }}
                                      contentKind={selectedContentGroup.kind}
                                      title={metadataDraft.title}
                                      description={metadataDraft.description}
                                      language={selectedMetadataTranslation.language}
                                      disabled={metadataSavingId === selectedContentGroup.id}
                                      onConfigureOpenAi={() => openWorkspaceSettings(true)}
                                      onUse={(asset) => {
                                        setMetadataDraft((current) => ({
                                          ...current,
                                          cover_url: asset.uri,
                                          cover_source_type: 'image',
                                        }));
                                        setMetadataError(null);
                                      }}
                                    />
                                  </section>
                                )}
                              </>
                            )}

                            {contentSettingsPage === 'links' && selectedContentGroup.kind === 'project' && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('links')}
                                  description="Connect the project page to the places where readers can inspect the work or try it."
                                />
                                <section className="resume-editor-section content-settings-section">
                                  <div className="content-settings-grid">
                                    <label className="content-settings-field content-settings-field--wide">
                                      <span>Repository</span>
                                      <small>The source repository opened from the project page.</small>
                                      <Input
                                        type="text"
                                        value={metadataDraft.github_url}
                                        onChange={(event) => setMetadataDraft((current) => ({ ...current, github_url: event.target.value }))}
                                        disabled={metadataSavingId === selectedContentGroup.id}
                                        placeholder="https://github.com/owner/repo"
                                      />
                                    </label>
                                    <label className="content-settings-field content-settings-field--wide">
                                      <span>Live demo</span>
                                      <small>The working product, paper companion, or deployed result readers can open directly.</small>
                                      <Input
                                        type="text"
                                        value={metadataDraft.demo_url}
                                        onChange={(event) => setMetadataDraft((current) => ({ ...current, demo_url: event.target.value }))}
                                        disabled={metadataSavingId === selectedContentGroup.id}
                                        placeholder="https://example.com"
                                      />
                                    </label>
                                  </div>
                                </section>
                              </>
                            )}

                            {contentSettingsPage === 'discovery' && selectedContentGroup.kind === 'blog' && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('discovery')}
                                  description="Connect this article to the work behind it, then preserve that identity across the page, search previews, and downloaded images."
                                />
                                <ArticleDiscoverySettings
                                  targetUri={`silan://resources/blog/${selectedContentGroup.slug}`}
                                  slug={selectedContentGroup.slug}
                                  coverUrl={metadataDraft.cover_url}
                                  value={metadataDraft.article_attribution}
                                  dirty={metadataDirty}
                                  disabled={metadataSavingId === selectedContentGroup.id}
                                  onChange={(articleAttribution) => setMetadataDraft((current) => ({
                                    ...current,
                                    article_attribution: articleAttribution,
                                  }))}
                                />
                              </>
                            )}

                            {contentSettingsPage === 'relations' && (selectedContentGroup.kind === 'blog' || selectedContentGroup.kind === 'moment') && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('relations')}
                                  description="Convert durable notes into publishable resources, or keep independent resources connected by typed source relations."
                                />
                                {selectedContentGroup.kind === 'blog' && (
                                  <section className="resume-editor-section content-settings-section">
                                    <div className="content-settings-section-heading">
                                      <h3>Convert this blog</h3>
                                      <p>Move this article source into Moments and rewrite its frontmatter for the moment schema.</p>
                                    </div>
                                    <div className="content-settings-command-row">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="content-settings-action"
                                        disabled={relationshipBusy !== ''}
                                        loading={relationshipBusy === 'blog-to-moment'}
                                        onClick={() => void runRelationshipCommand(
                                          'blog-to-moment',
                                          'convert_blog_to_moment',
                                          { slug: selectedContentGroup.slug },
                                        )}
                                      >
                                        <Radio size={15} />
                                        Convert to moment
                                      </Button>
                                    </div>
                                  </section>
                                )}

                                {selectedContentGroup.kind === 'moment' && (
                                  <>
                                    <section className="resume-editor-section content-settings-section">
                                      <div className="content-settings-section-heading">
                                        <h3>Convert this moment</h3>
                                        <p>Move this moment source into Blog and rewrite its frontmatter for the article schema.</p>
                                      </div>
                                      <div className="content-settings-command-row">
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="content-settings-action"
                                          disabled={relationshipBusy !== ''}
                                          loading={relationshipBusy === 'moment-to-blog'}
                                          onClick={() => void runRelationshipCommand(
                                            'moment-to-blog',
                                            'convert_moment_to_blog',
                                            { slug: selectedContentGroup.slug },
                                          )}
                                        >
                                          <FileText size={15} />
                                          Convert to blog
                                        </Button>
                                      </div>
                                    </section>

                                    <section className="resume-editor-section content-settings-section">
                                      <div className="content-settings-section-heading">
                                        <h3>Create from this moment</h3>
                                        <p>Create a new resource with fresh item identity, clone this moment body, and add an evolution relation from the moment. Nothing is committed; the new resource opens for editing.</p>
                                      </div>
                                      <div className="content-settings-command-row">
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="content-settings-action"
                                          disabled={relationshipBusy !== ''}
                                          loading={relationshipBusy === 'moment-create-blog'}
                                          onClick={() => void createFromMoment('blog')}
                                        >
                                          <FileText size={15} />
                                          New blog
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="content-settings-action"
                                          disabled={relationshipBusy !== ''}
                                          loading={relationshipBusy === 'moment-create-project'}
                                          onClick={() => void createFromMoment('project')}
                                        >
                                          <FolderPlus size={15} />
                                          New project
                                        </Button>
                                      </div>
                                    </section>

                                    <ContentRelationManager
                                      relations={selectedContentGroup.relations || []}
                                      targets={relationTargetOptions}
                                      targetKind={relationshipTargetKind}
                                      targetSlug={relationshipTargetSlug}
                                      busyKey={relationshipBusy}
                                      onTargetKindChange={(kind) => {
                                        setRelationshipTargetKind(kind);
                                        setRelationshipTargetSlug('');
                                      }}
                                      onTargetSlugChange={setRelationshipTargetSlug}
                                      onOpen={openRelationTarget}
                                      onUnlink={unlinkContentRelation}
                                      onLink={() => void runRelationshipCommand(
                                        'moment-link',
                                        'link_moment_to_content',
                                        {
                                          slug: selectedContentGroup.slug,
                                          targetKind: relationshipTargetKind,
                                          targetSlug: relationshipTargetSlug,
                                        },
                                      )}
                                    />
                                  </>
                                )}
                              </>
                            )}

                            {contentSettingsPage === 'publishing' && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('publishing')}
                                  description={selectedContentGroup.kind === 'moment'
                                    ? 'Manage progress and public visibility as independent Moment states.'
                                    : 'Manage the authored lifecycle and public visibility without collapsing them into one field.'}
                                />
                                <section className="resume-editor-section content-settings-section">
                                  <div className="content-settings-section-heading">
                                    <h3>Availability</h3>
                                    <p>Changes to lifecycle and audience are saved automatically.</p>
                                  </div>
                                  {selectedContentGroup.kind === 'project' && (
                                    <label className="content-publishing-pin">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(metadataDraft.is_featured)}
                                        disabled={metadataSavingId === selectedContentGroup.id}
                                        onChange={(event) => setMetadataDraft((current) => ({
                                          ...current, is_featured: event.target.checked,
                                        }))}
                                      />
                                      <span className="content-publishing-switch" aria-hidden="true"><i /></span>
                                      <span className="content-publishing-pin-copy">
                                        <strong>Feature project</strong>
                                        <small>Show this project on the website home page after the next deployment. The project must be public.</small>
                                      </span>
                                    </label>
                                  )}
                                  <ContentPublishingFields
                                    kind={selectedContentGroup.kind}
                                    value={publishingDraft}
                                    disabled={metadataSavingId === selectedContentGroup.id}
                                    onChange={setPublishingDraft}
                                  />
                                </section>
                              </>
                            )}

                            {contentSettingsPage === 'source' && (
                              <>
                                <SettingsPageIntro
                                  eyebrow={`${selected.entity_type} settings`}
                                  title={contentSettingsPageTitle('source')}
                                  description="Inspect the stable identifiers and authored file behind this page."
                                />
                                <section className="resume-editor-section content-settings-section">
                                  <div className="content-settings-grid">
                                    <label className="content-settings-field">
                                      <span>Slug</span>
                                      <small>The stable URL and resource identifier. Rename it in source control to avoid broken links.</small>
                                      <input type="text" value={selectedContentGroup.slug} disabled />
                                    </label>
                                    <label className="content-settings-field">
                                      <span>Content type</span>
                                      <small>Determines the schema, editor behavior, and public rendering used for this resource.</small>
                                      <input type="text" value={selected.entity_type} disabled />
                                    </label>
                                    <label className="content-settings-field content-settings-field--wide">
                                      <span>Metadata source</span>
                                      <small>The Markdown file read and written by this settings editor.</small>
                                      <input type="text" value={selectedMetadataTranslation?.source_path || ''} disabled />
                                    </label>
                                  </div>
                                </section>
                              </>
                            )}

                          {metadataError && (
                            <div className="content-settings-error" role="alert">
                              <span>{metadataError}</span>
                            </div>
                          )}
                          {relationshipError && (
                            <div className="content-settings-error" role="alert">
                              <span>{relationshipError}</span>
                            </div>
                          )}
                          </div>
                        </main>
                      </div>
                      <div className="resume-editor-actions" aria-label="Settings actions">
                        <span role="status">
                          {metadataSavingId ? 'Saving automatically…' : metadataError ? 'Save failed · retrying' : contentSettingsDirty ? 'Autosave pending…' : 'All changes saved'}
                        </span>
                      </div>
                    </section>
                  )}
                  {contentRailPanel === 'reactions' && (
                    <section className="content-settings-panel content-settings-panel--interactions" aria-label="Reader interactions">
                      <header className="workspace-settings-section-header">
                        <h2>{chromeLanguage === 'zh' ? '读者互动' : 'Reader interactions'}</h2>
                        <p>{selectedContentGroup.title}</p>
                      </header>
                      <div className="content-interaction-canvas">
                        <InteractionDetailsPanel
                          state={interactionDetailsState}
                          language={chromeLanguage}
                          refreshing={interactionDetailsRefreshing}
                          onRefresh={() => void loadInteractionDetails(true)}
                          visibilityPendingId={commentVisibilityPendingId}
                          visibilityError={commentVisibilityError}
                          onVisibilityChange={(commentId, isPublic) => void setCommentVisibility(commentId, isPublic)}
                        />
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <LanguageReviewPanel
          state={languageReview.state}
          onClose={languageReview.close}
          onRetry={languageReview.retry}
          onFindingOpen={focusReviewFinding}
          onFindingPreview={previewReviewSuggestion}
        />
        <ReviewSuggestionDialog
          state={reviewSuggestion}
          markdown={reviewSuggestionMarkdown}
          onReplacementChange={(replacement) => dispatchReviewSuggestion({ type: 'replacementChanged', replacement })}
          onConfirm={() => void applyReviewSuggestion()}
          onCancel={() => dispatchReviewSuggestion({ type: 'cancelled' })}
        />

        {geoPanelOpen && (
          <ModalLayer cardClassName="geo-card" labelledBy="geo-card-title" onClose={() => setGeoPanelOpen(false)}>
              <div className="dialog-headline">
                <div className="new-project-badge">
                  <Bot size={17} />
                </div>
                {renderLanguageCloseControls({
                  closeLabel: 'Close GEO insights',
                  closeSize: 15,
                  onClose: () => setGeoPanelOpen(false),
                })}
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
                  {Boolean(geoInsights.score_components?.length) && (
                    <section className="geo-score-components" aria-label="How the score is calculated">
                      {geoInsights.score_components?.map((component) => (
                        <div className="geo-score-component" key={component.label}>
                          <span>{component.label}</span>
                          <strong>{component.points}/{component.max}</strong>
                          <p>{component.reason}</p>
                        </div>
                      ))}
                    </section>
                  )}
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
          </ModalLayer>
        )}
      </main>

      <CaptureSheet
        phase={capturePhase}
        origin={captureOrigin}
        target={captureTarget}
        sourceCreated={captureSubmissionRef.current.hasDraft}
        onTargetChange={setCaptureTarget}
        category={captureCategory}
        language={chromeLanguage}
        onCategoryChange={setCaptureCategory}
        onLanguageChange={setChromeLanguage}
        categories={ideaCategories}
        title={captureTitle}
        onTitleChange={setCaptureTitle}
        note={captureNote}
        onNoteChange={setCaptureNote}
        attachments={captureAttachments}
        covers={captureCovers}
        onCoverChange={setCaptureCover}
        references={editorAssistReferences}
        error={captureError}
        authorName={workspacePreferences?.identity.display_name || 'Silan Hu'}
        authorAvatarUrl={workspacePreferences?.identity.avatar_url
          ? toWebviewMediaUrl(workspacePreferences.identity.avatar_url)
          : undefined}
        authorAvatarLabel={workspacePreferences?.identity.avatar_label || 'S'}
        inputRef={captureInputRef}
        onAttachFiles={attachFilesToCapture}
        onRemoveAttachment={(index) => {
          setCaptureCovers(current => { const next = new Map(current); next.delete(captureAttachments[index]); return next; });
          setCaptureAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
        }}
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
      {sourceConflict && conflictReviewOpen && !closeRecoveryOpen && (
        <div className="dialog-overlay" style={{ zIndex: 10000 }}>
          <section className="dialog-card" style={{ width: 'min(720px, 90vw)', maxHeight: '85vh', overflow: 'auto' }} role="dialog" aria-modal="true" aria-label="Resolve source conflict">
            <h2>The source changed on disk</h2>
            <p>Your draft has been kept separately. Choose which version to save; newer disk changes will still be checked.</p>
            <p>{sourceConflict.disk?.source_path || error || 'The current source could not be read yet.'}</p>
            {!sourceConflict.disk && <button type="button" onClick={() => {
              const pending = sourceConflict;
              void invoke<EditorDocument[]>('list_documents').then((fresh) => {
                const disk = fresh.flatMap((item) => item.translations).find((item) => item.id === pending.id);
                if (disk) setSourceConflict({ ...pending, disk });
                else setError('This source was removed from disk. Your local draft is still retained.');
              }).catch((reason) => setError(String(reason)));
            }}>Read current disk version</button>}
            <label>Current disk version
              <textarea readOnly value={sourceConflict.disk?.content || ''} rows={8} style={{ width: '100%' }} />
            </label>
            <label>Your {sourceConflict.kind === 'settings' ? 'settings' : 'draft'}
              <textarea readOnly rows={8} style={{ width: '100%' }} value={sourceConflict.kind === 'settings'
                ? JSON.stringify({ metadata: metadataDraft, publishing: publishingDraft }, null, 2)
                : documentsRef.current.flatMap((item) => item.translations).find((item) => item.id === sourceConflict.id)?.content || ''} />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConflictReviewOpen(false)}>Continue editing</button>
              <button type="button" onClick={() => void parkConflictedDraft()}>Keep recovery copy and resume other saves</button>
              {sourceConflict.kind === 'markdown' && <button type="button" disabled={!sourceConflict.disk} onClick={() => void resolveSourceConflict(false)}>Use disk version</button>}
              <button type="button" disabled={!sourceConflict.disk} onClick={() => void resolveSourceConflict(true)}>Save my {sourceConflict.kind === 'settings' ? 'settings' : 'draft'}</button>
            </div>
          </section>
        </div>
      )}
      {recoveryCopiesOpen && (
        <div className="dialog-overlay" style={{ zIndex: 10002 }}>
          <section className="dialog-card" style={{ width: 'min(720px, 90vw)', maxHeight: '85vh', overflow: 'auto' }} role="dialog" aria-modal="true" aria-label="Local recovery copies">
            <h2>Local recovery copies</h2>
            <p>These copies remain available even if their original file was removed. Select and copy the text you need.</p>
            {recoveryCopies.map((copy) => (
              <label key={`${copy.kind}:${copy.id}`} style={{ display: 'block' }}>{copy.kind} · {copy.id}
                <textarea readOnly rows={8} style={{ width: '100%' }} value={copy.kind === 'markdown'
                  ? String((copy.value as EditorTranslation).content || '') : JSON.stringify(copy.value, null, 2)} />
              </label>
            ))}
            <button type="button" onClick={() => setRecoveryCopiesOpen(false)}>Close</button>
          </section>
        </div>
      )}
      {closeRecoveryOpen && (
        <div className="dialog-overlay" style={{ zIndex: 10001 }}>
          <section className="dialog-card" style={{ width: 'min(720px, 90vw)', maxHeight: '85vh', overflow: 'auto' }} role="dialog" aria-modal="true" aria-label="Close with recovery copy">
            <h2>Source save did not finish</h2>
            <p>You can keep editing, or close with a local recovery copy. Pending drafts return when this workspace opens again.</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setCloseRecoveryOpen(false)}>Keep editing</button>
              <button type="button" onClick={() => {
                if (checkpointRef.current()) void getCurrentWindow().destroy().catch((reason) => setError(String(reason)));
              }}>Close with recovery copy</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
