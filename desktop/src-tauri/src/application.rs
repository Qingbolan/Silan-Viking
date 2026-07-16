//! Desktop use cases. This composes the Markdown write model with the SQLite
//! read projection without leaking either persistence API into Tauri commands.

use crate::insights::RuntimeInsightsRepository;
use crate::model::{
    DashboardData, DocumentStateInput, EditorDocument, EditorTranslation, EpisodeSeriesInput,
    EpisodeSeriesSource, EntityCount, MomentsCover, MomentsProfile, MomentsSettings, RawPart,
    ResumeEntryInput, ResumePartSource, ResumeProfile, ResumeProfileSource, ResumeSection,
    ResumeSocialLink, StatsSyncReport, VersionChange, VersionCommit, VersionStatus,
};
use crate::projection::ProjectionRepository;
use serde::Deserialize;
use silan_viking_app::{
    api_base_url, ContentCreator, ContentEditor, ContentKind, GitRepo, IdeaCategory, StatsSync,
    TranslationLocator, Workspace,
};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_MOMENTS_BACKGROUND_POSITION: &str = "center 42%";
const DEFAULT_MOMENTS_COVER_HEIGHT_PX: u16 = 420;
const VERSION_COMMIT_AUTHOR_NAME: &str = "Silan.Hu";
const VERSION_COMMIT_AUTHOR_EMAIL: &str = "silan.hu@u.nus.edu";

#[derive(Debug, Clone, Copy)]
enum VersionScope {
    Resume,
    Blog,
    Project,
    Idea,
    Update,
}

impl VersionScope {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "resume" => Ok(Self::Resume),
            "blog" => Ok(Self::Blog),
            "project" => Ok(Self::Project),
            "idea" => Ok(Self::Idea),
            "update" => Ok(Self::Update),
            other => Err(format!("unsupported version scope `{other}`")),
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Resume => "resume",
            Self::Blog => "blog",
            Self::Project => "project",
            Self::Idea => "idea",
            Self::Update => "update",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Resume => "Resume",
            Self::Blog => "Blog",
            Self::Project => "Projects",
            Self::Idea => "Ideas",
            Self::Update => "Updates",
        }
    }

    fn pathspecs(self) -> &'static [&'static str] {
        match self {
            Self::Resume => &["resources/resume"],
            Self::Blog => &["resources/blog", "resources/episode"],
            Self::Project => &["resources/projects"],
            Self::Idea => &["resources/ideas"],
            Self::Update => &["resources/updates"],
        }
    }

    fn release_message(self) -> String {
        format!("release: {} updates", self.id())
    }
}

#[derive(Debug, Clone)]
struct MomentsUiConfig {
    profile_alignment: String,
    background_image: Option<String>,
    background_position: String,
    cover_height_px: u16,
}

impl Default for MomentsUiConfig {
    fn default() -> Self {
        Self {
            profile_alignment: "right".to_owned(),
            background_image: None,
            background_position: DEFAULT_MOMENTS_BACKGROUND_POSITION.to_owned(),
            cover_height_px: DEFAULT_MOMENTS_COVER_HEIGHT_PX,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct ProjectConfig {
    desktop: Option<DesktopConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct DesktopConfig {
    moments: Option<MomentsConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct MomentsConfig {
    profile_alignment: Option<String>,
    background_image: Option<String>,
    background_position: Option<String>,
    cover_height_px: Option<u16>,
}

pub(crate) struct DesktopWorkspace {
    db_path: PathBuf,
    content_root: PathBuf,
    /// Deployed API base URL, when `[deploy]` is configured — used to
    /// absolutize server-relative media paths (`/api/v1/media?f=…`) so the
    /// Tauri webview can load cover images. `None` degrades to no covers.
    media_base: Option<String>,
    projection: ProjectionRepository,
    insights: RuntimeInsightsRepository,
    content: ContentEditor,
    creator: ContentCreator,
}

impl DesktopWorkspace {
    pub(crate) fn from_environment() -> Result<Self, String> {
        let db_path = env::var("SILAN_DESKTOP_DB")
            .map(PathBuf::from)
            .map_err(|_| {
                "SILAN_DESKTOP_DB is not set; launch through `silan-viking desktop`".to_owned()
            })?;
        let content_root = env::var("SILAN_DESKTOP_CONTENT")
            .map(PathBuf::from)
            .map_err(|_| {
                "SILAN_DESKTOP_CONTENT is not set; launch through `silan-viking desktop`".to_owned()
            })?;
        Ok(Self {
            projection: ProjectionRepository::open(&db_path)?,
            insights: RuntimeInsightsRepository::open(&db_path)?,
            content: ContentEditor::open(&content_root).map_err(|error| error.to_string())?,
            creator: ContentCreator::open(&content_root).map_err(|error| error.to_string())?,
            media_base: api_base_url(&content_root).ok(),
            db_path,
            content_root,
        })
    }

    pub(crate) fn dashboard(&self) -> Result<DashboardData, String> {
        let content = self.projection.content_metrics()?;
        let runtime = self.insights.snapshot()?;
        let deployed = self.projection.deployed_stats()?;
        Ok(DashboardData {
            total_views: content.total_views,
            total_likes: content.total_likes,
            total_comments: runtime.total_comments,
            pending_comments: runtime.pending_comments,
            human_interactions: runtime.human_interactions,
            crawler_interactions: runtime.crawler_interactions,
            ai_crawler_interactions: runtime.ai_crawler_interactions,
            search_crawler_interactions: runtime.search_crawler_interactions,
            recent_items: content.recent_items,
            deployed_views: deployed.views,
            deployed_likes: deployed.likes,
            deployed_comments: deployed.comments,
            deployed_human_interactions: deployed.human_interactions,
            deployed_ai_crawler_interactions: deployed.ai_crawler_interactions,
            deployed_search_crawler_interactions: deployed.search_crawler_interactions,
            deployed_ai_chat_referrals: deployed.ai_chat_referrals,
            stats_synced_at: deployed.synced_at,
        })
    }

    pub(crate) fn moments_settings(&self) -> Result<MomentsSettings, String> {
        let config = self.read_moments_config()?;
        let profile = self.resume_profile("en")?.profile;
        let display_name = non_empty_or(&profile.full_name, "Profile");
        let avatar_url = self.resolve_media_reference(&profile.avatar_url);
        let background_image_url = config
            .background_image
            .as_deref()
            .and_then(|reference| self.resolve_media_reference(reference));

        Ok(MomentsSettings {
            profile: MomentsProfile {
                avatar_label: avatar_label(&display_name),
                avatar_url,
                display_name,
                alignment: config.profile_alignment,
            },
            cover: MomentsCover {
                background_image_url,
                background_position: config.background_position,
                cover_height_px: config.cover_height_px,
            },
        })
    }

    /// Pull real view/like/comment counts from the deployed server for every
    /// known content item and cache them locally. There is no bulk endpoint,
    /// so this makes 4 HTTP requests per distinct entity — explicit and
    /// operator-triggered, never run implicitly on dashboard load.
    pub(crate) fn sync_stats(&self) -> Result<StatsSyncReport, String> {
        let base_url = api_base_url(&self.content_root).map_err(|error| error.to_string())?;
        let syncer = StatsSync::new(base_url, &self.db_path);

        let entities: BTreeSet<(String, String)> = self
            .projection
            .all_parts()?
            .into_iter()
            .map(|part| (part.entity_type, part.entity_id))
            .collect();

        let mut synced = 0i64;
        let mut failed = 0i64;
        for (entity_type, entity_id) in entities {
            match syncer.sync_item(&entity_type, &entity_id) {
                Ok(()) => synced += 1,
                Err(_) => failed += 1,
            }
        }

        let deployed = self.projection.deployed_stats()?;
        Ok(StatsSyncReport {
            synced,
            failed,
            stats: deployed,
        })
    }

    pub(crate) fn version_status(&self, scope: &str) -> Result<VersionStatus, String> {
        let scope = VersionScope::parse(scope)?;
        let repo = GitRepo::open(&self.content_root).map_err(|error| error.to_string())?;
        let branch = repo
            .run(["branch", "--show-current"])
            .map_err(|error| error.to_string())?
            .stdout;
        let head = repo
            .run(["rev-parse", "--short=12", "HEAD"])
            .map_err(|error| error.to_string())?;
        let head = head.stdout;
        let changes = repo
            .run(git_pathspec_args(
                &["status", "--porcelain"],
                scope.pathspecs(),
            ))
            .map_err(|error| error.to_string())?
            .stdout
            .lines()
            .filter_map(parse_git_status_line)
            .collect::<Vec<_>>();
        let recent_commits = repo
            .run(git_pathspec_args(
                &["log", "-5", "--pretty=format:%h%x1f%s%x1f%cr"],
                scope.pathspecs(),
            ))
            .map_err(|error| error.to_string())?
            .stdout
            .lines()
            .filter_map(parse_git_log_line)
            .collect::<Vec<_>>();

        Ok(VersionStatus {
            scope: scope.id().to_owned(),
            scope_label: scope.label().to_owned(),
            branch: if branch.is_empty() {
                "(detached)".to_owned()
            } else {
                branch
            },
            head,
            dirty_count: changes.len(),
            changes,
            recent_commits,
        })
    }

    pub(crate) fn release_scope(&self, scope: &str) -> Result<VersionStatus, String> {
        let scope = VersionScope::parse(scope)?;
        let repo = GitRepo::open(&self.content_root).map_err(|error| error.to_string())?;
        let before = self.version_status(scope.id())?;
        if before.dirty_count == 0 {
            return Err(format!("{} has no updates to release", scope.label()));
        }

        repo.run(git_pathspec_args(&["add", "-A"], scope.pathspecs()))
            .map_err(|error| error.to_string())?;
        let staged = repo
            .run(git_pathspec_args(
                &["diff", "--cached", "--name-only"],
                scope.pathspecs(),
            ))
            .map_err(|error| error.to_string())?
            .stdout;
        if staged.trim().is_empty() {
            return Err(format!("{} has no staged updates to release", scope.label()));
        }

        let mut commit_args = vec![
            "-c".to_owned(),
            format!("user.name={VERSION_COMMIT_AUTHOR_NAME}"),
            "-c".to_owned(),
            format!("user.email={VERSION_COMMIT_AUTHOR_EMAIL}"),
            "commit".to_owned(),
            "--only".to_owned(),
            "-m".to_owned(),
            scope.release_message(),
        ];
        commit_args.push("--".to_owned());
        commit_args.extend(scope.pathspecs().iter().map(|path| (*path).to_owned()));
        repo.run(commit_args).map_err(|error| error.to_string())?;

        Workspace::open(&self.content_root)
            .map_err(|error| error.to_string())?
            .sync(&self.db_path)
            .map_err(|error| error.to_string())?;
        self.version_status(scope.id())
    }

    pub(crate) fn list_documents(&self) -> Result<Vec<EditorDocument>, String> {
        let mut documents = Vec::new();
        for part in self.projection.all_parts()? {
            let document = self.hydrate(part)?;
            if !document.translations.is_empty() {
                documents.push(document);
            }
        }
        Ok(documents)
    }

    pub(crate) fn entity_counts(&self) -> Result<Vec<EntityCount>, String> {
        self.projection.entity_counts()
    }

    pub(crate) fn document(&self, id: &str) -> Result<EditorDocument, String> {
        self.hydrate(self.projection.part(id)?)
    }

    pub(crate) fn resume_sections(&self, language: &str) -> Result<Vec<ResumeSection>, String> {
        self.projection.resume_sections(language)
    }

    pub(crate) fn episode_series_source(
        &self,
        series_slug: &str,
    ) -> Result<EpisodeSeriesSource, String> {
        let source = self
            .content
            .read_episode_series_metadata(series_slug)
            .map_err(|error| error.to_string())?;
        Ok(EpisodeSeriesSource {
            slug: source.slug,
            title: source.title,
            description: source.description,
            cover_url: source.cover_url,
            status: source.status,
            revision: source.revision,
            relative_path: source.relative_path,
        })
    }

    pub(crate) fn save_episode_series(
        &self,
        series_slug: &str,
        input: &EpisodeSeriesInput,
        expected_revision: &str,
    ) -> Result<EpisodeSeriesSource, String> {
        let saved = self
            .content
            .save_episode_series_metadata_and_sync(
                series_slug,
                input.title.trim(),
                input.description.trim(),
                input.cover_url.trim(),
                input.status.trim(),
                expected_revision,
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        Ok(EpisodeSeriesSource {
            slug: saved.slug,
            title: saved.title,
            description: saved.description,
            cover_url: saved.cover_url,
            status: saved.status,
            revision: saved.revision,
            relative_path: saved.relative_path,
        })
    }

    pub(crate) fn resume_part_source(
        &self,
        role: &str,
        language: &str,
    ) -> Result<ResumePartSource, String> {
        let source = self
            .content
            .read_resume_part(role, language)
            .map_err(|error| error.to_string())?;
        Ok(ResumePartSource {
            role: role.to_owned(),
            language: language.to_owned(),
            revision: source.revision,
            relative_path: source.relative_path,
        })
    }

    pub(crate) fn resume_profile(&self, language: &str) -> Result<ResumeProfileSource, String> {
        let source = self
            .content
            .read_resume_profile(language)
            .map_err(|error| error.to_string())?;
        Ok(ResumeProfileSource {
            language: language.to_owned(),
            revision: source.revision,
            relative_path: source.relative_path,
            profile: parse_resume_profile(&source.frontmatter)?,
            summary: source.body,
        })
    }

    pub(crate) fn save_resume_profile(
        &self,
        language: &str,
        profile: &ResumeProfile,
        summary: &str,
        expected_revision: &str,
    ) -> Result<ResumeProfileSource, String> {
        let current = self
            .content
            .read_resume_profile(language)
            .map_err(|error| error.to_string())?;
        let frontmatter = serialize_resume_profile(&current.frontmatter, profile)?;
        let saved = self
            .content
            .save_resume_profile_and_sync(
                language,
                &frontmatter,
                summary,
                expected_revision,
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        Ok(ResumeProfileSource {
            language: language.to_owned(),
            revision: saved.revision,
            relative_path: saved.relative_path,
            profile: parse_resume_profile(&saved.frontmatter)?,
            summary: saved.body,
        })
    }

    /// Replace one structured Resume part (a section's blocks) for one
    /// language: serialize the submitted entries back to the part's TOML
    /// shape, save atomically with the engine's sync/rollback discipline,
    /// then return the refreshed sections for the same language.
    pub(crate) fn save_resume_entries(
        &self,
        role: &str,
        language: &str,
        shape: &str,
        entries: &[ResumeEntryInput],
        expected_revision: &str,
    ) -> Result<Vec<ResumeSection>, String> {
        let content = serialize_resume_part(role, shape, entries)?;
        self.content
            .save_resume_part_and_sync(role, language, &content, expected_revision, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.projection.resume_sections(language)
    }

    pub(crate) fn save_document(
        &self,
        translation_id: &str,
        body: &str,
        expected_revision: &str,
    ) -> Result<EditorDocument, String> {
        let part = self.projection.part_for_translation(translation_id)?;
        let item_part_id = part.id.clone();
        let document = self.hydrate(part)?;
        let translation = document
            .translations
            .iter()
            .find(|translation| translation.id == translation_id)
            .ok_or_else(|| format!("translation `{translation_id}` has no Markdown source"))?;
        let locator = translation_locator(&document, &translation.language)?;
        self.content
            .save_markdown_and_sync(&locator, body, expected_revision, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.document(&item_part_id)
    }

    pub(crate) fn save_document_state(
        &self,
        translation_id: &str,
        state: DocumentStateInput,
        expected_revision: &str,
    ) -> Result<EditorDocument, String> {
        let part = self.projection.part_for_translation(translation_id)?;
        let item_part_id = part.id.clone();
        let document = self.hydrate(part)?;
        validate_document_state(&document.entity_type, &state)?;
        let translation = document
            .translations
            .iter()
            .find(|translation| translation.id == translation_id)
            .ok_or_else(|| format!("translation `{translation_id}` has no Markdown source"))?;
        let locator = translation_locator(&document, &translation.language)?;
        self.content
            .save_frontmatter_fields_and_sync(
                &locator,
                &[
                    ("status", state.status.as_str()),
                    ("visibility", state.visibility.as_str()),
                ],
                expected_revision,
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        self.document(&item_part_id)
    }

    pub(crate) fn capture_idea(
        &self,
        note: &str,
        category: &str,
    ) -> Result<EditorDocument, String> {
        let category = IdeaCategory::parse(category).map_err(|error| error.to_string())?;
        let captured = self
            .creator
            .capture_idea_and_sync(note, category, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.hydrate(self.projection.part_by_stable_id(&captured.part_id)?)
    }

    pub(crate) fn capture_blog(
        &self,
        draft: &str,
        category: &str,
    ) -> Result<EditorDocument, String> {
        let category = IdeaCategory::parse(category).map_err(|error| error.to_string())?;
        let captured = self
            .creator
            .capture_blog_and_sync(draft, category, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.hydrate(self.projection.part_by_stable_id(&captured.part_id)?)
    }

    pub(crate) fn capture_update(&self, event: &str) -> Result<EditorDocument, String> {
        let captured = self
            .creator
            .capture_update_and_sync(event, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.hydrate(self.projection.part_by_stable_id(&captured.part_id)?)
    }

    pub(crate) fn create_project(&self, title: &str) -> Result<EditorDocument, String> {
        let captured = self
            .creator
            .capture_project_and_sync(title, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.hydrate(self.projection.part_by_stable_id(&captured.part_id)?)
    }

    fn hydrate(&self, raw: RawPart) -> Result<EditorDocument, String> {
        let summary = self.projection.entity_summary(
            &raw.entity_type,
            &raw.entity_id,
            &raw.canonical_language,
        )?;
        let title = if summary.title.is_empty() {
            format!("{} {}", raw.entity_type, raw.entity_id)
        } else {
            summary.title.clone()
        };
        let cover_url = self
            .projection
            .cover_url(&raw.entity_type, &raw.entity_id)?
            .and_then(|url| self.absolutize_media_url(&url));
        let series_cover_url = summary
            .series_cover_url
            .as_deref()
            .and_then(|url| self.absolutize_media_url(url));
        let mut document = EditorDocument {
            id: raw.id,
            part_id: raw.part_id,
            entity_type: raw.entity_type,
            entity_id: raw.entity_id,
            series_id: summary.series_id,
            series_slug: summary.series_slug,
            series_title: summary.series_title,
            series_description: summary.series_description,
            series_cover_url,
            episode_number: summary.episode_number,
            slug: summary.slug,
            role: raw.role,
            canonical_language: raw.canonical_language,
            title,
            status: summary.status,
            visibility: summary.visibility,
            date: summary.date,
            pinned: summary.pinned,
            updated_at: raw.updated_at,
            cover_url,
            translations: Vec::new(),
        };

        for translation in raw.translations {
            let locator = translation_locator(&document, &translation.language)?;
            match self.content.read_markdown(&locator) {
                Ok(source) => document.translations.push(EditorTranslation {
                    id: translation.id,
                    language: translation.language,
                    content: source.body,
                    revision: source.revision,
                    source_path: source.relative_path,
                }),
                Err(error) if error.is_source_not_found() => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(document)
    }

    fn absolutize_media_url(&self, url: &str) -> Option<String> {
        self.resolve_media_reference(url)
    }

    fn resolve_media_reference(&self, reference: &str) -> Option<String> {
        let reference = reference.trim();
        if reference.is_empty() {
            return None;
        }
        if reference.starts_with("http://") || reference.starts_with("https://") {
            return Some(reference.to_owned());
        }
        if reference.starts_with('/') {
            return self
                .media_base
                .as_ref()
                .map(|base| format!("{base}{reference}"));
        }

        let content_root = self.content_root.canonicalize().ok()?;
        let path = self.content_root.join(reference).canonicalize().ok()?;
        if path.is_file() && path.starts_with(content_root) {
            Some(path.to_string_lossy().to_string())
        } else {
            None
        }
    }

    fn read_moments_config(&self) -> Result<MomentsUiConfig, String> {
        let config_path = project_config_path(&self.content_root);
        if !config_path.is_file() {
            return Ok(MomentsUiConfig::default());
        }

        let text = fs::read_to_string(&config_path)
            .map_err(|error| format!("cannot read `{}`: {error}", config_path.display()))?;
        let project: ProjectConfig = toml::from_str(&text)
            .map_err(|error| format!("cannot parse `{}`: {error}", config_path.display()))?;
        let Some(moments) = project.desktop.and_then(|desktop| desktop.moments) else {
            return Ok(MomentsUiConfig::default());
        };

        let mut config = MomentsUiConfig::default();
        if let Some(alignment) = moments.profile_alignment {
            let alignment = alignment.trim().to_owned();
            if alignment != "left" && alignment != "right" {
                return Err(format!(
                    "`desktop.moments.profile_alignment` must be `left` or `right`, got `{alignment}`",
                ));
            }
            config.profile_alignment = alignment;
        }
        if let Some(background_image) = moments.background_image {
            let background_image = background_image.trim().to_owned();
            if !background_image.is_empty() {
                config.background_image = Some(background_image);
            }
        }
        if let Some(background_position) = moments.background_position {
            let background_position = background_position.trim().to_owned();
            if !background_position.is_empty() {
                config.background_position = background_position;
            }
        }
        if let Some(cover_height_px) = moments.cover_height_px {
            if !(240..=720).contains(&cover_height_px) {
                return Err(format!(
                    "`desktop.moments.cover_height_px` must be between 240 and 720, got {cover_height_px}",
                ));
            }
            config.cover_height_px = cover_height_px;
        }
        Ok(config)
    }
}

fn project_config_path(content_root: &Path) -> PathBuf {
    content_root
        .parent()
        .map(|project_root| project_root.join("silan-viking.toml"))
        .unwrap_or_else(|| content_root.join("silan-viking.toml"))
}

fn non_empty_or(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_owned()
    } else {
        value.to_owned()
    }
}

fn avatar_label(display_name: &str) -> String {
    display_name
        .split_whitespace()
        .find_map(|part| part.chars().next())
        .unwrap_or('P')
        .to_string()
}

/// Serialize block-editor entries back into the on-disk TOML shape:
/// `[[entry]]` array-of-tables for `entry_list` parts, a top-level
/// `"Category" = [...]` map for `key_value_list` parts.
fn serialize_resume_part(
    role: &str,
    shape: &str,
    entries: &[ResumeEntryInput],
) -> Result<String, String> {
    let header = format!("# Resume — {role} ({shape}). Managed by Silan Desktop.\n\n");
    match shape {
        "entry_list" => {
            let mut list = toml::value::Array::new();
            for entry in entries {
                let mut table = toml::map::Map::new();
                table.insert(
                    "entry_id".to_owned(),
                    toml::Value::String(entry.entry_id.clone()),
                );
                for (key, value) in &entry.fields {
                    if key == "entry_id" {
                        continue;
                    }
                    if let Some(converted) = json_to_toml(value)? {
                        table.insert(key.clone(), converted);
                    }
                }
                list.push(toml::Value::Table(table));
            }
            let mut root = toml::map::Map::new();
            root.insert("entry".to_owned(), toml::Value::Array(list));
            let body = toml::to_string(&toml::Value::Table(root))
                .map_err(|error| format!("cannot serialize `{role}` entries: {error}"))?;
            Ok(format!("{header}{body}"))
        }
        "key_value_list" => {
            let mut root = toml::map::Map::new();
            for entry in entries {
                let category = entry
                    .fields
                    .get("category")
                    .and_then(|value| value.as_str())
                    .unwrap_or(&entry.entry_id)
                    .to_owned();
                let items = entry
                    .fields
                    .get("items")
                    .map(|value| json_to_toml(value))
                    .transpose()?
                    .flatten()
                    .unwrap_or(toml::Value::Array(Vec::new()));
                root.insert(category, items);
            }
            let body = toml::to_string(&toml::Value::Table(root))
                .map_err(|error| format!("cannot serialize `{role}` categories: {error}"))?;
            Ok(format!("{header}{body}"))
        }
        other => Err(format!("unsupported Resume part shape `{other}`")),
    }
}

/// Convert one block-editor field value to TOML. `null` fields are
/// omitted rather than serialized.
fn json_to_toml(value: &serde_json::Value) -> Result<Option<toml::Value>, String> {
    Ok(match value {
        serde_json::Value::Null => None,
        serde_json::Value::Bool(flag) => Some(toml::Value::Boolean(*flag)),
        serde_json::Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                Some(toml::Value::Integer(integer))
            } else if let Some(float) = number.as_f64() {
                Some(toml::Value::Float(float))
            } else {
                return Err(format!("unsupported number `{number}`"));
            }
        }
        serde_json::Value::String(text) => Some(toml::Value::String(text.clone())),
        serde_json::Value::Array(items) => {
            let mut list = toml::value::Array::new();
            for item in items {
                if let Some(converted) = json_to_toml(item)? {
                    list.push(converted);
                }
            }
            Some(toml::Value::Array(list))
        }
        serde_json::Value::Object(_) => {
            return Err("nested tables are not supported in Resume entries".to_owned());
        }
    })
}

fn parse_resume_profile(frontmatter: &str) -> Result<ResumeProfile, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(frontmatter)
        .map_err(|error| format!("cannot parse Resume profile frontmatter: {error}"))?;
    let map = value
        .as_mapping()
        .ok_or_else(|| "Resume profile frontmatter is not a YAML mapping".to_owned())?;
    Ok(ResumeProfile {
        full_name: yaml_text(map, "full_name"),
        title: yaml_text(map, "title"),
        current_status: yaml_text(map, "current_status"),
        email: yaml_text(map, "email"),
        phone: yaml_text(map, "phone"),
        location: yaml_text(map, "location"),
        website: yaml_text(map, "website"),
        avatar_url: yaml_text(map, "avatar_url"),
        social_links: yaml_social_links(map),
    })
}

fn serialize_resume_profile(
    existing_frontmatter: &str,
    profile: &ResumeProfile,
) -> Result<String, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(existing_frontmatter)
        .map_err(|error| format!("cannot parse existing Resume profile frontmatter: {error}"))?;
    let mut map = match value {
        serde_yaml::Value::Mapping(map) => map,
        serde_yaml::Value::Null => serde_yaml::Mapping::new(),
        _ => return Err("Resume profile frontmatter is not a YAML mapping".to_owned()),
    };

    put_yaml_text(&mut map, "full_name", &profile.full_name);
    put_yaml_text(&mut map, "title", &profile.title);
    put_yaml_text(&mut map, "current_status", &profile.current_status);
    put_yaml_text(&mut map, "email", &profile.email);
    put_yaml_text(&mut map, "phone", &profile.phone);
    put_yaml_text(&mut map, "location", &profile.location);
    put_yaml_text(&mut map, "website", &profile.website);
    put_yaml_text(&mut map, "avatar_url", &profile.avatar_url);
    put_yaml_social_links(&mut map, &profile.social_links);

    serde_yaml::to_string(&serde_yaml::Value::Mapping(map))
        .map_err(|error| format!("cannot serialize Resume profile frontmatter: {error}"))
}

fn yaml_text(map: &serde_yaml::Mapping, key: &str) -> String {
    map.get(serde_yaml::Value::String(key.to_owned()))
        .and_then(serde_yaml::Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn yaml_social_links(map: &serde_yaml::Mapping) -> Vec<ResumeSocialLink> {
    map.get(serde_yaml::Value::String("social_links".to_owned()))
        .and_then(serde_yaml::Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|value| {
            let map = value.as_mapping()?;
            Some(ResumeSocialLink {
                platform: yaml_text(map, "platform"),
                url: yaml_text(map, "url"),
                display_name: yaml_text(map, "display_name"),
            })
        })
        .collect()
}

fn put_yaml_text(map: &mut serde_yaml::Mapping, key: &str, value: &str) {
    map.insert(
        serde_yaml::Value::String(key.to_owned()),
        serde_yaml::Value::String(value.to_owned()),
    );
}

fn put_yaml_social_links(map: &mut serde_yaml::Mapping, links: &[ResumeSocialLink]) {
    let values = links
        .iter()
        .filter(|link| {
            !link.platform.trim().is_empty()
                || !link.url.trim().is_empty()
                || !link.display_name.trim().is_empty()
        })
        .map(|link| {
            let mut link_map = serde_yaml::Mapping::new();
            put_yaml_text(&mut link_map, "platform", &link.platform);
            put_yaml_text(&mut link_map, "url", &link.url);
            put_yaml_text(&mut link_map, "display_name", &link.display_name);
            serde_yaml::Value::Mapping(link_map)
        })
        .collect();
    map.insert(
        serde_yaml::Value::String("social_links".to_owned()),
        serde_yaml::Value::Sequence(values),
    );
}

fn validate_document_state(kind: &str, state: &DocumentStateInput) -> Result<(), String> {
    let allowed_status = match kind {
        "blog" | "episode" => &["draft", "published", "archived"][..],
        "project" => &["active", "completed", "paused", "cancelled"][..],
        "idea" => &[
            "draft",
            "hypothesis",
            "experimenting",
            "validating",
            "published",
            "concluded",
        ][..],
        "update" => &["active", "ongoing", "completed"][..],
        other => return Err(format!("state controls are not supported for `{other}`")),
    };
    if !allowed_status.contains(&state.status.as_str()) {
        return Err(format!(
            "`{}` is not a valid status for `{kind}`",
            state.status
        ));
    }
    if !["private", "unlisted", "public"].contains(&state.visibility.as_str()) {
        return Err(format!("`{}` is not a valid visibility", state.visibility));
    }
    Ok(())
}

fn translation_locator(
    document: &EditorDocument,
    language: &str,
) -> Result<TranslationLocator, String> {
    let kind = ContentKind::from_frontmatter_value(&document.entity_type)
        .map_err(|error| error.to_string())?;
    TranslationLocator::new(
        kind,
        document.slug.clone(),
        document.series_slug.clone(),
        document.role.clone(),
        language,
    )
    .map_err(|error| error.to_string())
}

fn parse_git_status_line(line: &str) -> Option<VersionChange> {
    if line.len() < 4 {
        return None;
    }
    let status = line.get(..2)?.trim().to_owned();
    let path = line
        .get(3..)?
        .split(" -> ")
        .last()
        .unwrap_or_default()
        .trim()
        .to_owned();
    if path.is_empty() {
        return None;
    }
    Some(VersionChange { status, path })
}

fn git_pathspec_args(prefix: &[&str], pathspecs: &[&str]) -> Vec<String> {
    let mut args = prefix
        .iter()
        .map(|arg| (*arg).to_owned())
        .collect::<Vec<_>>();
    if !pathspecs.is_empty() {
        args.push("--".to_owned());
        args.extend(pathspecs.iter().map(|path| (*path).to_owned()));
    }
    args
}

fn parse_git_log_line(line: &str) -> Option<VersionCommit> {
    let mut parts = line.split('\x1f');
    let hash = parts.next()?.trim().to_owned();
    let subject = parts.next()?.trim().to_owned();
    let relative_time = parts.next()?.trim().to_owned();
    if hash.is_empty() {
        return None;
    }
    Some(VersionCommit {
        hash,
        subject,
        relative_time,
    })
}
