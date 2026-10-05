//! Local workspace creation. Source and its projection are staged together;
//! activation is the only operation that makes the new project visible.
use crate::{
    scaffold, ContentCreator, ContentEditor, IdeaCategory, MediaLibrary, ResumeProfileUpdate,
    WorkspaceSync,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

pub const SCHEMA_TEMPLATE: &str = include_str!("../assets/SCHEMA.md");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub destination: PathBuf,
    pub name: String,
    pub author: String,
    pub language: String,
    pub include_example: bool,
    #[serde(default)]
    pub avatar: Option<WorkspaceAvatarInput>,
}

/// Pending bytes belong to setup until the staged workspace is activated.
#[derive(Debug, Deserialize)]
pub struct WorkspaceAvatarInput {
    pub bytes: Vec<u8>,
}

impl WorkspaceAvatarInput {
    fn png_bytes(&self) -> Result<Vec<u8>, String> {
        if self.bytes.is_empty() || self.bytes.len() > 12 * 1024 * 1024 {
            return Err("Choose an image smaller than 12 MB.".into());
        }
        let mut reader = image::ImageReader::new(std::io::Cursor::new(&self.bytes))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(4096);
        limits.max_image_height = Some(4096);
        limits.max_alloc = Some(128 * 1024 * 1024);
        reader.limits(limits);
        let image = reader
            .decode()
            .map_err(|_| "Choose a valid PNG, JPEG or WebP image up to 4096 pixels.".to_owned())?;
        let mut output = std::io::Cursor::new(Vec::new());
        image
            .write_to(&mut output, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(output.into_inner())
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSetupStage {
    CheckingAccess,
    Cloning,
    Synchronizing,
    Creating,
    Indexing,
    Activating,
}

pub struct WorkspaceSetup;
impl WorkspaceSetup {
    pub fn create(
        input: &CreateWorkspaceInput,
        progress: impl Fn(WorkspaceSetupStage),
    ) -> Result<PathBuf, String> {
        let name = input.name.trim();
        let author = input.author.trim();
        if name.is_empty() || author.is_empty() {
            return Err("Enter a workspace name and author name.".into());
        }
        if !matches!(input.language.as_str(), "en" | "zh") {
            return Err("Choose English or Chinese as the writing language.".into());
        }
        let avatar = input
            .avatar
            .as_ref()
            .map(WorkspaceAvatarInput::png_bytes)
            .transpose()?;
        let destination = absolute_destination(&input.destination)?;
        if destination.exists() {
            return Err(
                "Choose a new folder. Existing folders can be opened from the welcome screen."
                    .into(),
            );
        }
        let parent = destination.parent().ok_or("Choose a workspace folder.")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let staging = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
        let project = staging.path().join("workspace");
        let content = project.join("content");
        progress(WorkspaceSetupStage::Creating);
        for collection in ["blog", "projects", "episode", "moment"] {
            fs::create_dir_all(content.join("resources").join(collection))
                .map_err(|e| e.to_string())?;
        }
        fs::create_dir_all(content.join("agent/notes")).map_err(|e| e.to_string())?;
        fs::write(content.join("SCHEMA.md"), SCHEMA_TEMPLATE).map_err(|e| e.to_string())?;
        fs::write(content.join(".gitignore"), "/.silan-cache\n*.db\n")
            .map_err(|e| e.to_string())?;
        let language = input.language.as_str();
        let config = toml::toml! {
            [project]
            name = name
            content_dir = "content"
            [database]
            path = "_deploy/portfolio.db"
            [desktop]
            default_language = language
        };
        fs::write(
            project.join("silan-viking.toml"),
            toml::to_string_pretty(&config).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        scaffold::new_resume(&content, author, "").map_err(|e| e.to_string())?;
        // Both supported profile languages share the supplied identity. The
        // writer remains free to translate each profile after onboarding.
        let summary = content.join("resources/resume/parts/summary");
        fs::copy(summary.join("en.md"), summary.join("zh.md")).map_err(|e| e.to_string())?;
        let output = Command::new("git")
            .args(["init", "--quiet", "-b", "main"])
            .arg(&content)
            .output()
            .map_err(|e| format!("Git is required to prepare local version history: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        // No fabricated commit identity: the first explicit commit uses the
        // owner's Git identity. Creating a workspace does not publish/commit.
        let database = project.join("_deploy/portfolio.db");
        fs::create_dir_all(database.parent().ok_or("Missing database directory")?)
            .map_err(|e| e.to_string())?;
        progress(WorkspaceSetupStage::Indexing);
        if let Some(bytes) = avatar {
            let asset = MediaLibrary::open(&content)
                .map_err(|e| e.to_string())?
                .import_resume_asset_bytes("avatar.png", &bytes)
                .map_err(|e| e.to_string())?;
            let editor = ContentEditor::open(&content).map_err(|e| e.to_string())?;
            let updates = ["en", "zh"]
                .into_iter()
                .map(|language| {
                    let source = editor
                        .read_resume_profile(language)
                        .map_err(|e| e.to_string())?;
                    let mut frontmatter: serde_yaml::Mapping =
                        serde_yaml::from_str(&source.frontmatter).map_err(|e| e.to_string())?;
                    frontmatter.insert("avatar_url".into(), asset.uri.clone().into());
                    Ok(ResumeProfileUpdate {
                        language: language.into(),
                        frontmatter: serde_yaml::to_string(&frontmatter)
                            .map_err(|e| e.to_string())?,
                        body: source.body,
                        expected_revision: source.revision,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            editor
                .save_resume_profiles_and_sync(&updates, &database)
                .map_err(|e| e.to_string())?;
        }
        if input.include_example {
            let draft = if input.language == "zh" {
                "# 我的第一篇笔记\n\n这是示例草稿，仅保存在本机。把这段文字替换成你正在思考的问题。\n\n## 从一个问题开始\n\n我想理解什么？有哪些证据？下一步准备验证什么？\n\n你可以随时在设置中完善个人信息，并在需要时配置同步与发布。"
            } else {
                "# My first note\n\nThis is an example draft, saved locally. Replace it with a question you are exploring.\n\n## Start with a question\n\nWhat do I want to understand? What evidence do I have? What will I investigate next?\n\nYou can update your profile in Settings and configure synchronization and publishing when needed."
            };
            ContentCreator::open(&content)
                .map_err(|e| e.to_string())?
                .capture_blog_and_sync(draft, IdeaCategory::Thought, &input.language, &database)
                .map_err(|e| e.to_string())?;
        }
        WorkspaceSync::open(&content, &database)
            .map_err(|e| e.to_string())?
            .sync()
            .map_err(|e| e.to_string())?;
        progress(WorkspaceSetupStage::Activating);
        // Recheck after staging: never replace another user's workspace.
        if destination.exists() {
            return Err("The destination appeared while preparing. Choose another folder.".into());
        }
        fs::rename(project, &destination).map_err(|e| e.to_string())?;
        Ok(destination)
    }
}

pub fn absolute_destination(path: &Path) -> Result<PathBuf, String> {
    let text = path.to_string_lossy();
    let path = if let Some(relative) = text.trim().strip_prefix("~/") {
        PathBuf::from(std::env::var_os("HOME").ok_or("Cannot locate your home folder.")?)
            .join(relative)
    } else {
        PathBuf::from(text.trim())
    };
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Use an absolute folder path or a path beginning with ~/ .".into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(destination: PathBuf) -> CreateWorkspaceInput {
        CreateWorkspaceInput {
            destination,
            name: "Research \"notes\"".into(),
            author: "Name: # researcher".into(),
            language: "zh".into(),
            include_example: true,
            avatar: None,
        }
    }
    #[test]
    fn creates_offline_workspace_with_quoted_identity_and_private_draft() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceSetup::create(&input(dir.path().join("new")), |_| {}).unwrap();
        assert!(root.join("content/.git").is_dir());
        assert!(root.join("_deploy/portfolio.db").is_file());
        let source =
            fs::read_to_string(root.join("content/resources/resume/parts/summary/zh.md")).unwrap();
        assert!(source.contains("Name: # researcher"));
        assert!(source.contains("visibility: private"));
        assert!(!fs::read_to_string(root.join("silan-viking.toml"))
            .unwrap()
            .contains("[deploy]"));
    }
    #[test]
    fn local_open_keeps_dirty_content_and_resolves_custom_directory_without_network() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceSetup::create(&input(dir.path().join("local")), |_| {}).unwrap();
        fs::rename(root.join("content"), root.join("silan.tech")).unwrap();
        let config = root.join("silan-viking.toml");
        let source = fs::read_to_string(&config)
            .unwrap()
            .replace("content_dir = \"content\"", "content_dir = \"silan.tech\"");
        fs::write(config, source).unwrap();
        let note = root.join("silan.tech/agent/notes/unsaved.md");
        fs::write(&note, "my local work").unwrap();
        let opened = crate::WorkspaceJoiner::open_local(&root.join("silan.tech")).unwrap();
        assert_eq!(
            opened.content_root,
            fs::canonicalize(root.join("silan.tech")).unwrap()
        );
        assert_eq!(fs::read_to_string(note).unwrap(), "my local work");
    }

    #[test]
    fn avatar_is_a_resolvable_resource_in_both_profile_languages() {
        let dir = tempfile::tempdir().unwrap();
        let mut input = input(dir.path().join("avatar"));
        let mut image = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(2, 2)
            .write_to(&mut image, image::ImageFormat::Png)
            .unwrap();
        input.avatar = Some(WorkspaceAvatarInput {
            bytes: image.into_inner(),
        });
        let root = WorkspaceSetup::create(&input, |_| {}).unwrap();
        let content = root.join("content");
        let editor = ContentEditor::open(&content).unwrap();
        for language in ["en", "zh"] {
            let source = editor.read_resume_profile(language).unwrap();
            let frontmatter: serde_yaml::Value = serde_yaml::from_str(&source.frontmatter).unwrap();
            let uri = frontmatter["avatar_url"].as_str().unwrap();
            assert!(uri.starts_with("silan://resources/resume/assets/"));
            let path = MediaLibrary::open(&content)
                .unwrap()
                .resolve_local_path(uri)
                .unwrap();
            assert_eq!(image::open(path).unwrap().width(), 2);
        }
    }

    #[test]
    fn invalid_avatar_does_not_activate_or_leave_a_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let mut input = input(dir.path().join("invalid"));
        input.avatar = Some(WorkspaceAvatarInput {
            bytes: b"not an image".to_vec(),
        });
        assert!(WorkspaceSetup::create(&input, |_| {}).is_err());
        assert!(!input.destination.exists());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn rejected_creation_preserves_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("keep"), "mine").unwrap();
        assert!(WorkspaceSetup::create(&input(dir.path().into()), |_| {}).is_err());
        assert_eq!(fs::read_to_string(dir.path().join("keep")).unwrap(), "mine");
    }
}
