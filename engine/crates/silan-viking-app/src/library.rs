//! Source-owned folder operations for the content library.
use crate::{source_lock, workspace::Workspace, WorkspaceContent};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize)]
pub struct LibrarySeries {
    pub slug: String,
    pub title: String,
    pub description: String,
    pub cover_url: String,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum LibraryOperation {
    CreateSeries {
        title: String,
    },
    Transfer {
        document_id: String,
        series: Option<String>,
        copy: bool,
    },
    ImportMarkdown {
        name: String,
        markdown: String,
        series: String,
    },
}

pub struct ContentLibrary {
    root: PathBuf,
    db: PathBuf,
}
impl ContentLibrary {
    pub fn new(root: impl AsRef<Path>, db: impl AsRef<Path>) -> Self {
        Self {
            root: root.as_ref().to_owned(),
            db: db.as_ref().to_owned(),
        }
    }
    pub fn series(&self) -> Result<Vec<LibrarySeries>, String> {
        Ok(Workspace::open(&self.root)
            .map_err(err)?
            .scan()
            .map_err(err)?
            .series()
            .iter()
            .map(|s| LibrarySeries {
                slug: s.slug.clone(),
                title: s.title.clone(),
                description: s.description.clone(),
                cover_url: s.cover_url.clone(),
            })
            .collect())
    }
    pub fn execute(&self, operation: LibraryOperation) -> Result<(), String> {
        let _guard = source_lock::acquire()?;
        let transactions = self.root.join(".viking/transactions");
        fs::create_dir_all(&transactions).map_err(err)?;
        let stage = tempfile::tempdir_in(&transactions).map_err(err)?;
        let prepared = stage.path().join("prepared");
        fs::create_dir(&prepared).map_err(err)?;
        let mut original = None;
        let mut rewrites = Vec::new();
        let target = match operation {
            LibraryOperation::CreateSeries { title } => {
                if title.trim().is_empty() {
                    return Err("请输入系列名称".into());
                }
                let slug = format!(
                    "series-{}",
                    silan_viking_base::ItemId::generate()
                        .to_string()
                        .to_lowercase()
                        .replace('_', "-")
                );
                let text = toml::to_string(&std::collections::BTreeMap::from([
                    ("title", title.trim()),
                    ("slug", slug.as_str()),
                    ("description", ""),
                ]))
                .map_err(err)?;
                fs::write(prepared.join("series.toml"), text).map_err(err)?;
                self.root.join("resources/episode").join(slug)
            }
            LibraryOperation::Transfer {
                document_id,
                series,
                copy,
            } => {
                let documents = WorkspaceContent::open(&self.root)
                    .map_err(err)?
                    .editable_documents()
                    .map_err(err)?;
                let document = documents
                    .iter()
                    .find(|d| d.id == document_id || d.parts.iter().any(|p| p.id == document_id))
                    .ok_or("内容已不存在")?;
                if !matches!(document.content_type.as_str(), "blog" | "episode") {
                    return Err("只有文章和篇章可以移动到系列".into());
                }
                let old_relative = match &document.series_slug {
                    Some(s) => format!("episode/{s}/{}", document.slug),
                    None => format!("blog/{}", document.slug),
                };
                let source = self.root.join("resources").join(&old_relative);
                if !copy && document.series_slug == series {
                    return Ok(());
                }
                let parent = self.destination(series.as_deref())?;
                let slug = if copy {
                    format!(
                        "{}-{}",
                        document.slug,
                        silan_viking_base::ItemId::generate()
                            .to_string()
                            .to_lowercase()
                            .replace('_', "-")
                    )
                } else {
                    document.slug.clone()
                };
                let target = parent.join(&slug);
                if target.exists() {
                    return Err("目标已存在同名内容".into());
                }
                copy_tree(&source, &prepared)?;
                let new_relative = target
                    .strip_prefix(self.root.join("resources"))
                    .map_err(err)?
                    .to_string_lossy()
                    .replace('\\', "/");
                let old_uri = format!("silan://resources/{old_relative}");
                let new_uri = format!("silan://resources/{new_relative}");
                let number = documents
                    .iter()
                    .filter(|d| d.series_slug == series)
                    .filter_map(|d| d.episode_number)
                    .max()
                    .unwrap_or(0)
                    + 1;
                for file in files(&prepared)? {
                    let extension = file.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if !matches!(extension, "md" | "toml") {
                        continue;
                    }
                    let mut text = fs::read_to_string(&file).map_err(err)?;
                    text = replace_uri(&text, &old_uri, &new_uri);
                    if extension == "md" {
                        text = relocate_markdown(&text, &slug, series.as_deref(), number, copy)?;
                    }
                    if copy && extension == "toml" {
                        let mut data: toml::Value = toml::from_str(&text).map_err(err)?;
                        if data.get("item_id").is_some() {
                            data["item_id"] = toml::Value::String(
                                silan_viking_base::ItemId::generate().to_string(),
                            );
                        }
                        if data.get("part_id").is_some() {
                            data["part_id"] = toml::Value::String(
                                silan_viking_base::PartId::generate().to_string(),
                            );
                        }
                        text = toml::to_string(&data).map_err(err)?;
                    }
                    fs::write(file, text).map_err(err)?;
                }
                if !copy {
                    for file in files(&self.root.join("resources"))? {
                        if file.starts_with(&source)
                            || !matches!(
                                file.extension().and_then(|s| s.to_str()),
                                Some("md" | "toml")
                            )
                        {
                            continue;
                        }
                        let before = fs::read_to_string(&file).map_err(err)?;
                        let after = replace_uri(&before, &old_uri, &new_uri);
                        if before != after {
                            rewrites.push((file, before, after));
                        }
                    }
                    original = Some(source);
                }
                target
            }
            LibraryOperation::ImportMarkdown {
                name,
                markdown,
                series,
            } => {
                let parent = self.destination(Some(&series))?;
                let markdown = markdown
                    .trim_start_matches('\u{feff}')
                    .replace("\r\n", "\n");
                if markdown.len() > 8 * 1024 * 1024 {
                    return Err("Markdown 文件过大".into());
                }
                let slug = format!(
                    "episode-{}",
                    silan_viking_base::ItemId::generate()
                        .to_string()
                        .to_lowercase()
                        .replace('_', "-")
                );
                let docs = WorkspaceContent::open(&self.root)
                    .map_err(err)?
                    .editable_documents()
                    .map_err(err)?;
                let number = docs
                    .iter()
                    .filter(|d| d.series_slug.as_deref() == Some(&series))
                    .filter_map(|d| d.episode_number)
                    .max()
                    .unwrap_or(0)
                    + 1;
                let body = if markdown.starts_with("---\n") {
                    markdown
                } else {
                    format!(
                        "---\ntitle: {}\n---\n{}",
                        serde_json::to_string(name.trim_end_matches(".md")).map_err(err)?,
                        markdown
                    )
                };
                let part = prepared.join("parts/body");
                fs::create_dir_all(&part).map_err(err)?;
                fs::write(
                    prepared.join("item.toml"),
                    format!("item_id = \"{}\"\n", silan_viking_base::ItemId::generate()),
                )
                .map_err(err)?;
                fs::write(part.join("meta.toml"),format!("part_id = \"{}\"\ntype = \"body\"\nshape = \"prose\"\ncanonical_lang = \"en\"\n",silan_viking_base::PartId::generate())).map_err(err)?;
                fs::write(
                    part.join("en.md"),
                    relocate_markdown(&body, &slug, Some(&series), number, true)?,
                )
                .map_err(err)?;
                parent.join(slug)
            }
        };
        // Prepared -> activated -> projected. Any failure restores the source and references.
        fs::create_dir_all(target.parent().ok_or("目标路径无效")?).map_err(err)?;
        let backup = stage.path().join("original");
        if let Some(source) = &original {
            fs::rename(source, &backup).map_err(err)?;
        }
        let result = (|| {
            fs::rename(&prepared, &target).map_err(err)?;
            for (file, _, after) in &rewrites {
                fs::write(file, after).map_err(err)?;
            }
            Workspace::open(&self.root)
                .map_err(err)?
                .sync(&self.db)
                .map_err(err)?;
            Ok::<_, String>(())
        })();
        if let Err(error) = result {
            let rollback = (|| {
                for (file, before, _) in &rewrites {
                    fs::write(file, before).map_err(err)?;
                }
                if target.exists() {
                    fs::remove_dir_all(&target).map_err(err)?;
                }
                if let Some(source) = &original {
                    fs::rename(&backup, source).map_err(err)?;
                }
                Ok::<_, String>(())
            })();
            if let Err(rollback) = rollback {
                let path = stage.keep();
                return Err(format!(
                    "{error}; rollback failed: {rollback}; backup: {}",
                    path.display()
                ));
            }
            return Err(error);
        }
        Ok(())
    }
    fn destination(&self, series: Option<&str>) -> Result<PathBuf, String> {
        match series {
            None => Ok(self.root.join("resources/blog")),
            Some(slug) if self.series()?.iter().any(|s| s.slug == slug) => {
                Ok(self.root.join("resources/episode").join(slug))
            }
            _ => Err("系列已不存在".into()),
        }
    }
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    for entry in fs::read_dir(root).map_err(err)? {
        let entry = entry.map_err(err)?;
        let kind = entry.file_type().map_err(err)?;
        if kind.is_symlink() {
            return Err("内容目录不支持符号链接".into());
        }
        if kind.is_dir() {
            result.extend(files(&entry.path())?);
        } else {
            result.push(entry.path());
        }
    }
    Ok(result)
}
fn copy_tree(source: &Path, target: &Path) -> Result<(), String> {
    for file in files(source)? {
        let dest = target.join(file.strip_prefix(source).map_err(err)?);
        fs::create_dir_all(dest.parent().ok_or("无效路径")?).map_err(err)?;
        fs::copy(file, dest).map_err(err)?;
    }
    Ok(())
}
fn replace_uri(text: &str, old: &str, new: &str) -> String {
    let mut output = String::new();
    let mut rest = text;
    while let Some(index) = rest.find(old) {
        output.push_str(&rest[..index]);
        rest = &rest[index + old.len()..];
        let boundary = rest.chars().next().is_none_or(|c| {
            matches!(
                c,
                '/' | '"' | '\'' | ')' | ']' | '#' | '?' | ' ' | '\n' | '\r' | '\t'
            )
        });
        output.push_str(if boundary { new } else { old });
    }
    output.push_str(rest);
    output
}
fn relocate_markdown(
    source: &str,
    slug: &str,
    series: Option<&str>,
    number: i64,
    private: bool,
) -> Result<String, String> {
    let rest = source
        .strip_prefix("---\n")
        .ok_or("Markdown 缺少 frontmatter")?;
    let (header, body) = rest
        .split_once("\n---")
        .ok_or("Markdown frontmatter 无效")?;
    let mut data: serde_yaml::Mapping = serde_yaml::from_str(header).map_err(err)?;
    let mut set = |key: &str, value: serde_yaml::Value| {
        data.insert(key.into(), value);
    };
    set("slug", slug.into());
    set(
        "kind",
        if series.is_some() { "episode" } else { "blog" }.into(),
    );
    if private {
        set("visibility", "private".into());
    }
    if let Some(series) = series {
        set("series", series.into());
        set("episode_number", number.into());
    } else {
        data.remove(serde_yaml::Value::from("series"));
        data.remove(serde_yaml::Value::from("episode_number"));
    }
    Ok(format!(
        "---\n{}---{}",
        serde_yaml::to_string(&data).map_err(err)?,
        body
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, ContentLibrary) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("content");
        fs::create_dir(&root).unwrap();
        copy_tree(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content"),
            &root,
        )
        .unwrap();
        let library = ContentLibrary::new(&root, temp.path().join("index.db"));
        (temp, library)
    }
    #[test]
    fn folder_operations_preserve_sources_and_isolate_copies() {
        let (_temp, library) = fixture();
        library
            .execute(LibraryOperation::CreateSeries {
                title: "新系列".into(),
            })
            .unwrap();
        let target = library
            .series()
            .unwrap()
            .into_iter()
            .find(|s| s.title == "新系列")
            .unwrap();
        let blog_source = library
            .root
            .join("resources/blog/hello-world/parts/body/en.md");
        let source = fs::read_to_string(&blog_source).unwrap();
        fs::write(
            &blog_source,
            format!("{source}\n![asset](silan://resources/blog/hello-world/assets/chart.png)\n"),
        )
        .unwrap();
        let assets = library.root.join("resources/blog/hello-world/assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(assets.join("chart.png"), b"asset-bytes").unwrap();
        let linked = library
            .root
            .join("resources/moment/changelog-2026-q2/parts/body/en.md");
        let linked_source = fs::read_to_string(&linked).unwrap();
        fs::write(
            &linked,
            format!("{linked_source}\n[read](silan://resources/blog/hello-world)\n"),
        )
        .unwrap();
        let docs = WorkspaceContent::open(&library.root)
            .unwrap()
            .editable_documents()
            .unwrap();
        let blog = docs.iter().find(|d| d.content_type == "blog").unwrap();
        library
            .execute(LibraryOperation::Transfer {
                document_id: blog.id.clone(),
                series: Some(target.slug.clone()),
                copy: false,
            })
            .unwrap();
        let moved = WorkspaceContent::open(&library.root)
            .unwrap()
            .editable_document(&blog.id)
            .unwrap();
        assert_eq!(moved.content_type, "episode");
        assert_eq!(moved.series_slug.as_deref(), Some(target.slug.as_str()));
        assert_eq!(moved.parts[0].id, blog.parts[0].id);
        assert!(fs::read_to_string(&linked).unwrap().contains(&format!(
            "silan://resources/episode/{}/hello-world)",
            target.slug
        )));
        assert!(moved.parts[0]
            .translations
            .iter()
            .any(|t| t.content.contains(&format!(
                "silan://resources/episode/{}/hello-world/assets/chart.png",
                target.slug
            ))));
        assert_eq!(
            fs::read(library.root.join(format!(
                "resources/episode/{}/hello-world/assets/chart.png",
                target.slug
            )))
            .unwrap(),
            b"asset-bytes"
        );
        library
            .execute(LibraryOperation::Transfer {
                document_id: moved.id.clone(),
                series: Some(target.slug.clone()),
                copy: true,
            })
            .unwrap();
        let docs = WorkspaceContent::open(&library.root)
            .unwrap()
            .editable_documents()
            .unwrap();
        let copied = docs
            .iter()
            .find(|d| d.series_slug.as_deref() == Some(target.slug.as_str()) && d.id != moved.id)
            .unwrap();
        assert_ne!(copied.parts[0].id, moved.parts[0].id);
        assert_eq!(copied.visibility, "private");
        library
            .execute(LibraryOperation::Transfer {
                document_id: moved.id,
                series: None,
                copy: false,
            })
            .unwrap();
        assert!(library.root.join("resources/blog/hello-world").is_dir());
    }
    #[test]
    fn markdown_import_and_projection_failure_are_safe() {
        let (_temp, library) = fixture();
        library
            .execute(LibraryOperation::ImportMarkdown {
                name: "note.md".into(),
                markdown: "# Note\n\nResearch notes".into(),
                series: "tutorial-series".into(),
            })
            .unwrap();
        let docs = WorkspaceContent::open(&library.root)
            .unwrap()
            .editable_documents()
            .unwrap();
        assert!(docs
            .iter()
            .any(|d| d.title == "note" && d.visibility == "private"));
        let blog = docs.iter().find(|d| d.content_type == "blog").unwrap();
        let broken = ContentLibrary::new(&library.root, &library.root);
        assert!(broken
            .execute(LibraryOperation::Transfer {
                document_id: blog.id.clone(),
                series: Some("tutorial-series".into()),
                copy: false
            })
            .is_err());
        assert!(library.root.join("resources/blog/hello-world").is_dir());
        assert!(!library
            .root
            .join("resources/episode/tutorial-series/hello-world")
            .exists());
    }
    #[test]
    fn uri_rewrites_do_not_modify_similar_slugs() {
        assert_eq!(
            replace_uri(
                "silan://resources/blog/one/assets/a.png silan://resources/blog/one-more",
                "silan://resources/blog/one",
                "silan://resources/episode/s/one"
            ),
            "silan://resources/episode/s/one/assets/a.png silan://resources/blog/one-more"
        );
    }
}
