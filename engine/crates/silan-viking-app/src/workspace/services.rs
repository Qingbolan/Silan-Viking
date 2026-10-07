//! Use-case assembly over one validated schema snapshot.
//!
//! A factory is scoped to an operation/session, never global. It shares schema
//! and strategy objects, not scanned content or database state. Reopening after
//! a schema edit creates a new snapshot; existing operations remain consistent.

use super::{OpenError, Workspace};
use crate::{
    ArticleImageAttributionWorkspace, ContentCreator, ContentEditor, ContentRelationshipEditor,
    CoverWorkspace, DeliveryControl, DeliveryControlError, GeoAdvisor, MediaLibrary,
    WebsiteInsights, WebsiteInsightsError, WorkspaceContent,
};
use std::path::Path;
use std::sync::Arc;

pub struct WorkspaceServices {
    workspace: Arc<Workspace>,
}

impl WorkspaceServices {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, OpenError> {
        Ok(Self {
            workspace: Arc::new(Workspace::open(content_root)?),
        })
    }

    pub fn insights(
        &self,
        db_path: impl AsRef<Path>,
    ) -> Result<WebsiteInsights, WebsiteInsightsError> {
        WebsiteInsights::from_workspace(&self.workspace, db_path.as_ref())
    }

    pub fn delivery(
        &self,
        db_path: impl AsRef<Path>,
    ) -> Result<DeliveryControl, DeliveryControlError> {
        DeliveryControl::from_workspace(&self.workspace, db_path.as_ref())
    }

    pub fn editor(&self) -> ContentEditor {
        ContentEditor::from_workspace(Arc::clone(&self.workspace))
    }

    pub fn content(&self) -> WorkspaceContent {
        WorkspaceContent::from_workspace(Arc::clone(&self.workspace))
    }

    pub fn creator(&self) -> ContentCreator {
        ContentCreator::from_workspace(Arc::clone(&self.workspace))
    }

    pub fn relationships(&self) -> ContentRelationshipEditor {
        ContentRelationshipEditor::from_workspace(Arc::clone(&self.workspace))
    }

    pub fn media(&self) -> MediaLibrary {
        MediaLibrary::from_workspace(&self.workspace)
    }

    pub fn covers(&self) -> CoverWorkspace {
        CoverWorkspace::from_workspace(Arc::clone(&self.workspace))
    }

    pub fn image_attribution(&self) -> ArticleImageAttributionWorkspace {
        ArticleImageAttributionWorkspace::from_workspace(Arc::clone(&self.workspace))
    }

    pub fn geo_advisor(&self, db_path: impl AsRef<Path>) -> GeoAdvisor {
        GeoAdvisor::from_workspace(Arc::clone(&self.workspace), db_path.as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_assembly_uses_the_opened_schema_snapshot() {
        let root = tempfile::tempdir().unwrap();
        let schema = root.path().join("SCHEMA.md");
        std::fs::write(
            &schema,
            include_str!("../../../../tests/fixtures/content/SCHEMA.md"),
        )
        .unwrap();
        let services = WorkspaceServices::open(root.path()).unwrap();
        // An in-flight operation must not re-read a changed schema while
        // assembling another use case from the same workspace.
        std::fs::write(&schema, "invalid schema").unwrap();
        let _ = services.editor();
        let _ = services.content();
        let _ = services.creator();
        let _ = services.relationships();
        let _ = services.media();
        let _ = services.covers();
        let _ = services.image_attribution();
        let _ = services.geo_advisor(root.path().join("projection.db"));
        assert!(WorkspaceServices::open(root.path()).is_err());
    }

    #[test]
    fn shared_services_read_current_source_instead_of_caching_documents() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(
            root.path().join("SCHEMA.md"),
            include_str!("../../../../tests/fixtures/content/SCHEMA.md"),
        )
        .unwrap();
        let part = root.path().join("resources/blog/example/parts/body");
        std::fs::create_dir_all(&part).unwrap();
        let source = part.join("en.md");
        std::fs::write(&source, "First version").unwrap();
        let services = WorkspaceServices::open(root.path()).unwrap();
        let editor = services.editor();
        let locator = crate::TranslationLocator::new(
            crate::ContentKind::Blog,
            "example",
            None::<String>,
            "body",
            "en",
        )
        .unwrap();
        let first = editor.read_markdown(&locator).unwrap();
        std::fs::write(&source, "Changed on disk").unwrap();
        let second = editor.read_markdown(&locator).unwrap();
        assert_ne!(first, second);
        assert_eq!(second, services.editor().read_markdown(&locator).unwrap());
    }
}
