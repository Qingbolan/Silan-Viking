//! Local resource addressing. Factories are registered by the adapter composition
//! root; every request receives the current workspace root explicitly.
pub use silan_viking_base::Namespace;
use silan_viking_base::SilanUri;
use std::{
    collections::BTreeMap,
    error::Error,
    path::{Path, PathBuf},
};

pub type SourceError = Box<dyn Error + Send + Sync>;

pub trait LocalResourceSource: Send + Sync {
    fn resolve(&self, uri: &str) -> Result<PathBuf, SourceError>;
}

pub type LocalResourceFactory = fn(&Path) -> Result<Box<dyn LocalResourceSource>, SourceError>;

#[derive(Debug, thiserror::Error)]
pub enum LocalResourceError {
    #[error("duplicate local resource source: {0}")]
    Duplicate(Namespace),
    #[error("no local resource source registered for: {0}")]
    Unregistered(Namespace),
    #[error(transparent)]
    InvalidUri(#[from] silan_viking_base::BaseError),
    #[error("cannot open local resource source: {0}")]
    OpenSource(#[source] SourceError),
    #[error("cannot resolve local resource: {0}")]
    Resolve(#[source] SourceError),
}

pub struct LocalResourceRegistry {
    factories: BTreeMap<Namespace, LocalResourceFactory>,
}

impl LocalResourceRegistry {
    pub fn new(
        registrations: impl IntoIterator<Item = (Namespace, LocalResourceFactory)>,
    ) -> Result<Self, LocalResourceError> {
        let mut factories = BTreeMap::new();
        for (namespace, factory) in registrations {
            if factories.insert(namespace, factory).is_some() {
                return Err(LocalResourceError::Duplicate(namespace));
            }
        }
        Ok(Self { factories })
    }

    pub fn resolve(&self, content_root: &Path, raw: &str) -> Result<PathBuf, LocalResourceError> {
        let uri: SilanUri = raw.parse()?;
        let factory = self
            .factories
            .get(&uri.namespace())
            .ok_or(LocalResourceError::Unregistered(uri.namespace()))?;
        let source = factory(content_root).map_err(LocalResourceError::OpenSource)?;
        source.resolve(raw).map_err(LocalResourceError::Resolve)
    }
}

impl LocalResourceSource for crate::MediaLibrary {
    fn resolve(&self, uri: &str) -> Result<PathBuf, SourceError> {
        Ok(self.resolve_local_path(uri)?)
    }
}

impl LocalResourceSource for crate::themes::ThemeRepository {
    fn resolve(&self, uri: &str) -> Result<PathBuf, SourceError> {
        Ok(self.resolve(uri)?)
    }
}

pub fn create_media_source(root: &Path) -> Result<Box<dyn LocalResourceSource>, SourceError> {
    Ok(Box::new(crate::MediaLibrary::open(root)?))
}

pub fn create_theme_source(root: &Path) -> Result<Box<dyn LocalResourceSource>, SourceError> {
    Ok(Box::new(crate::themes::ThemeRepository::new(root)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn duplicate_factories_are_rejected_and_unregistered_namespaces_are_not_exposed() {
        assert!(matches!(
            LocalResourceRegistry::new([
                (
                    Namespace::Themes,
                    create_theme_source as LocalResourceFactory
                ),
                (
                    Namespace::Themes,
                    create_theme_source as LocalResourceFactory
                ),
            ]),
            Err(LocalResourceError::Duplicate(Namespace::Themes))
        ));
        let registry = LocalResourceRegistry::new([(
            Namespace::Themes,
            create_theme_source as LocalResourceFactory,
        )])
        .unwrap();
        assert!(matches!(
            registry.resolve(Path::new("."), "silan://agent/private"),
            Err(LocalResourceError::Unregistered(Namespace::Agent))
        ));
    }

    #[test]
    fn factory_uses_each_requests_workspace_instead_of_caching_the_first() {
        let registry = LocalResourceRegistry::new([(
            Namespace::Themes,
            create_theme_source as LocalResourceFactory,
        )])
        .unwrap();
        for _ in 0..2 {
            let workspace = tempfile::tempdir().unwrap();
            let package = workspace.path().join("themes/test");
            std::fs::create_dir_all(&package).unwrap();
            std::fs::write(package.join("theme.json"), "{}").unwrap();
            assert_eq!(
                registry
                    .resolve(workspace.path(), "silan://themes/test")
                    .unwrap(),
                package.join("theme.json").canonicalize().unwrap()
            );
        }
    }
}
