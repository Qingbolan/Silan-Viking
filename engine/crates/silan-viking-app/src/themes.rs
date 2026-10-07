//! Read-only workspace theme package repository. Theme packages do not participate
//! in content scanning, proposal acceptance or publication.
use serde::Serialize;
use silan_viking_base::{Namespace, SilanUri};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    str::FromStr,
};

const MAX_MANIFEST_BYTES: u64 = 128 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ThemeError {
    #[error("invalid theme URI: {0}")]
    InvalidUri(String),
    #[error("theme path escapes its package")]
    OutsidePackage,
    #[error("theme manifest exceeds 128 KiB")]
    TooLarge,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Serialize)]
pub struct ThemeDescriptor {
    pub uri: String,
    pub name: String,
}

pub struct ThemeRepository {
    content_root: PathBuf,
}

impl ThemeRepository {
    /// The caller supplies the resolved workspace content root, never a hardcoded directory.
    pub fn new(content_root: impl AsRef<Path>) -> Self {
        Self {
            content_root: content_root.as_ref().to_path_buf(),
        }
    }

    pub fn list(&self) -> Result<Vec<ThemeDescriptor>, ThemeError> {
        let root = match self.root() {
            Ok(root) => root,
            Err(ThemeError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Vec::new())
            }
            Err(error) => return Err(error),
        };
        let entries = fs::read_dir(root)?;
        let mut themes = Vec::new();
        for entry in entries {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().into_owned();
            if !valid_id(&id) {
                continue;
            }
            let uri = format!("silan://themes/{id}");
            // Discovery does not parse packages: a malformed package remains selectable,
            // and its load error cannot hide the other installed themes.
            if entry.path().join("theme.json").is_file() {
                themes.push(ThemeDescriptor { uri, name: id });
            }
        }
        themes.sort_by(|left, right| left.uri.cmp(&right.uri));
        Ok(themes)
    }

    pub fn load(&self, uri: &str) -> Result<serde_json::Value, ThemeError> {
        let path = self.resolve(uri)?;
        if path.file_name().and_then(|name| name.to_str()) != Some("theme.json") {
            return Err(ThemeError::InvalidUri(uri.to_owned()));
        }
        let file = fs::File::open(path)?;
        let mut bytes = Vec::new();
        file.take(MAX_MANIFEST_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_MANIFEST_BYTES {
            return Err(ThemeError::TooLarge);
        }
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub fn resolve(&self, raw: &str) -> Result<PathBuf, ThemeError> {
        let uri = SilanUri::from_str(raw).map_err(|_| ThemeError::InvalidUri(raw.to_owned()))?;
        if uri.namespace() != Namespace::Themes
            || uri.segments().is_empty()
            || !valid_id(&uri.segments()[0])
            || uri.segments().iter().any(|part| !valid_segment(part))
        {
            return Err(ThemeError::InvalidUri(raw.to_owned()));
        }
        let root = self.root()?;
        let package = root.join(&uri.segments()[0]).canonicalize()?;
        if !package.starts_with(&root) || package == root {
            return Err(ThemeError::OutsidePackage);
        }
        let relative: PathBuf = uri.segments().iter().skip(1).collect();
        if !relative.as_os_str().is_empty() && relative != Path::new("theme.json") {
            let asset = uri.segments().get(1).is_some_and(|part| part == "assets");
            let extension = relative.extension().and_then(|value| value.to_str());
            if !asset
                || !matches!(
                    extension,
                    Some("woff" | "woff2" | "png" | "jpg" | "jpeg" | "webp" | "avif" | "gif")
                )
            {
                return Err(ThemeError::InvalidUri(raw.to_owned()));
            }
        }
        let path = package
            .join(if relative.as_os_str().is_empty() {
                Path::new("theme.json")
            } else {
                &relative
            })
            .canonicalize()?;
        if !path.starts_with(&package) || !path.is_file() {
            return Err(ThemeError::OutsidePackage);
        }
        Ok(path)
    }

    fn root(&self) -> Result<PathBuf, ThemeError> {
        let expected_root = self.content_root.canonicalize()?.join("themes");
        let root = expected_root.canonicalize()?;
        if root != expected_root {
            return Err(ThemeError::OutsidePackage);
        }
        Ok(root)
    }
}

fn valid_id(value: &str) -> bool {
    value.starts_with(|character: char| character.is_ascii_lowercase())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn valid_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifests_and_assets_are_package_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let package = dir.path().join("themes/paper");
        fs::create_dir_all(package.join("assets")).unwrap();
        fs::write(package.join("theme.json"), r#"{"schema_version":1}"#).unwrap();
        fs::write(package.join("assets/font.woff2"), b"font").unwrap();
        let repository = ThemeRepository::new(dir.path());
        assert_eq!(repository.list().unwrap()[0].uri, "silan://themes/paper");
        assert_eq!(
            repository.load("silan://themes/paper").unwrap()["schema_version"],
            1
        );
        assert!(repository
            .resolve("silan://themes/paper/assets/font.woff2")
            .is_ok());
        for uri in [
            "silan://resources/paper",
            "silan://themes/paper/../secret",
            "silan://themes/paper/%2e%2e/secret",
            "silan://themes/paper/theme.json?x=1",
        ] {
            assert!(repository.resolve(uri).is_err(), "{uri}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlink_cannot_escape_package() {
        let dir = tempfile::tempdir().unwrap();
        let package = dir.path().join("themes/paper");
        fs::create_dir_all(&package).unwrap();
        fs::write(dir.path().join("secret"), "private").unwrap();
        std::os::unix::fs::symlink(dir.path().join("secret"), package.join("theme.json")).unwrap();
        assert!(matches!(
            ThemeRepository::new(dir.path()).load("silan://themes/paper"),
            Err(ThemeError::OutsidePackage)
        ));
    }

    #[test]
    fn absent_repository_is_empty_and_large_manifests_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let repository = ThemeRepository::new(dir.path());
        assert!(repository.list().unwrap().is_empty());
        fs::create_dir_all(dir.path().join("themes/large")).unwrap();
        fs::write(
            dir.path().join("themes/large/theme.json"),
            vec![b' '; MAX_MANIFEST_BYTES as usize + 1],
        )
        .unwrap();
        assert!(matches!(
            repository.load("silan://themes/large"),
            Err(ThemeError::TooLarge)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn namespace_root_cannot_be_a_link_to_private_content() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("agent/personal")).unwrap();
        fs::write(dir.path().join("agent/personal/theme.json"), "{}").unwrap();
        std::os::unix::fs::symlink(dir.path().join("agent"), dir.path().join("themes")).unwrap();
        let repository = ThemeRepository::new(dir.path());
        assert!(matches!(repository.list(), Err(ThemeError::OutsidePackage)));
        assert!(matches!(
            repository.load("silan://themes/personal"),
            Err(ThemeError::OutsidePackage)
        ));
    }

    #[test]
    fn arbitrary_files_and_active_content_are_not_theme_resources() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("themes/test/assets")).unwrap();
        for name in [".env", "assets/run.js", "assets/index.html"] {
            fs::write(dir.path().join("themes/test").join(name), "private").unwrap();
            assert!(ThemeRepository::new(dir.path())
                .resolve(&format!("silan://themes/test/{name}"))
                .is_err());
        }
    }
}
