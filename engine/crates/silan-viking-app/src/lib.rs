//! `silan-viking-app` — L3 behaviour layer.
//!
//! This layer holds the **capabilities** of silan-viking: scanning the
//! `content/` tree, parsing Items into `Parsed` products, mapping those into
//! database rows, and writing them. It depends on L1 `base` and L2 `content`
//! (and, for row shapes, L2.5 `entities`); nothing here depends on an L4
//! adapter (`docs/silan-viking/01` §1.1).
//!
//! Module map:
//!
//! - [`schema`] — loads and models `content/SCHEMA.md` (the M0 contract).
//! - [`workspace`] — the `Workspace` aggregate root: `scan` (M5) and `sync`
//!   (M6).
//! - [`parser`] — the `Parser` trait, its 6 implementations, the closed
//!   `ParserRegistry`, and the read-only `Parsed` product (milestone M5).
//! - [`sync`] — the `Mapper` trait, its 6 implementations, the `RowSet` /
//!   `Sink` write path (milestone M6).
//!
//! Every public surface returns a typed error (`ParseError` / `SyncError`);
//! no non-test code uses `unwrap()` / `expect()` (`09` §9.1).

#![forbid(unsafe_code)]

pub mod capture;
pub mod credential_profile;
pub mod delivery_control;
pub mod editor;
pub mod geo_advisor;
pub mod github_oauth_credentials;
pub mod google_oauth_credentials;
pub mod media_library;
pub mod media_optimizer;
pub mod openai_credentials;
pub mod parser;
pub mod proposal;
pub mod query;
pub mod schema;
mod source_lock;
pub mod stats;
pub mod sync;
pub mod translation_ai;
pub mod website_insights;
pub mod workspace;
pub mod workspace_content;
pub mod workspace_sync;

pub use capture::{CaptureError, CapturedContent, ContentCreator, IdeaCategory};
pub use credential_profile::{
    CredentialProfile, CredentialProfileError, DEFAULT_CREDENTIAL_PROFILE,
};
pub use delivery_control::{
    DeliveryControl, DeliveryControlError, DeliverySyncStatus, DeployRunStatus,
    DeployVerificationResult, DeploymentPlan, ReleaseScope, RemoteContentVersion,
    ScopeReleaseStatus,
};
pub use editor::{
    ContentEditor, EditorError, ResumeProfileSource, SeriesMetadataSource, SourceDocument,
    TranslationLocator,
};
pub use geo_advisor::{
    GeoAction, GeoAdvisor, GeoAdvisorError, GeoEvidence, GeoEvidenceSource, GeoInsightReport,
    GeoMetric,
};
pub use github_oauth_credentials::{
    GitHubOAuthCredentialError, GitHubOAuthCredentials, GITHUB_OAUTH_KEYCHAIN_ACCOUNT,
    GITHUB_OAUTH_KEYCHAIN_SERVICE,
};
pub use google_oauth_credentials::{
    GoogleOAuthClientId, GoogleOAuthCredentialError, GOOGLE_OAUTH_KEYCHAIN_ACCOUNT,
    GOOGLE_OAUTH_KEYCHAIN_SERVICE,
};
pub use media_library::{MediaAssetRef, MediaLibrary, MediaLibraryError, MediaReferenceStatus};
pub use media_optimizer::{
    hash_deploy_media_asset, optimize_media_asset, optimize_media_tree, stage_deploy_media_asset,
    MediaOptimizationError, MediaOptimizationReport, MediaOptimizationStatus,
    MediaTreeOptimizationReport, MEDIA_OPTIMIZER_VERSION,
};
pub use openai_credentials::{
    OpenAiApiKey, OpenAiCredentialError, OpenAiCredentialVerifier, OpenAiVerification,
    OPENAI_KEYCHAIN_ACCOUNT, OPENAI_KEYCHAIN_SERVICE,
};
pub use proposal::store::ProposalKind;
pub use proposal::{
    canonicalize, AcceptOutcome, AcceptReport, GitRepo, ProposalError, ProposalId, ProposalLock,
    ProposalRecord, ProposalState, ProposalSummary, ProposalTarget,
};
pub use query::{EmbedderMode, QueryDocument, QueryError, QueryHit, QueryIndex};
pub use schema::{Schema, SchemaError};
pub use stats::{
    api_base_url, workspace_stats_sync_token, CountRow, ItemStats, StatsCache, StatsError,
    StatsSync, StatsSyncResult, VisitorRow,
};
pub use translation_ai::{
    GeneratedMarkdownTranslation, MarkdownTranslationRequest, OpenAiMarkdownTranslator,
    OpenAiTranslationError,
};
pub use website_insights::{
    AiReferralSummary, AttentionItem, AttentionKind, AttentionSeverity, CommentSummary,
    CrawlerSummary, DailyTraffic, DashboardSnapshot, FreshnessState, RecentContentItem,
    StatsFreshness, StatsSummary, TrafficEvidence, WebsiteInsights, WebsiteInsightsError,
};
pub use workspace::{LintIssue, ScanError, ScannedAsset, Workspace};
pub use workspace_content::{
    CreateTranslationInput, EditableDocument, EditableEntry, EditablePart, EditableSection,
    EditableTranslation, EditableWorkspace, SaveLifecycleInput, SaveMetadataInput,
    SaveProjectFeaturedInput, SaveTranslationInput, SourceRevision, WorkspaceContent,
    WorkspaceContentError, WorkspaceEntityCount,
};
pub use workspace_sync::{
    WorkspaceSync, WorkspaceSyncError, WorkspaceSyncResult, WorkspaceSyncState, WorkspaceSyncStatus,
};

// Re-export the content-layer types that appear across the app's public API.
pub use silan_viking_base::{Identified, SilanUri, Slug};
pub use silan_viking_content::{
    ContentKind, Item, Part, PartRole, PartShape, Relation, RelationType,
};
