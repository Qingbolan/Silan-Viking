//! Compare independent public constructors with operation-scoped assembly.
//! No user workspace, network, or persistent database is used.
use silan_viking_app::{
    ArticleImageAttributionWorkspace, ContentCreator, ContentEditor, ContentRelationshipEditor,
    CoverWorkspace, GeoAdvisor, MediaLibrary, WorkspaceContent, WorkspaceServices,
};
use std::hint::black_box;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = tempfile::tempdir()?;
    std::fs::write(
        root.path().join("SCHEMA.md"),
        include_str!("../../../tests/fixtures/content/SCHEMA.md"),
    )?;
    let db = root.path().join("unused.db");
    let iterations = 300;
    for shared in [false, true] {
        let start = Instant::now();
        for _ in 0..iterations {
            if shared {
                let services = WorkspaceServices::open(root.path())?;
                black_box((
                    services.editor(),
                    services.creator(),
                    services.content(),
                    services.relationships(),
                    services.media(),
                    services.covers(),
                    services.image_attribution(),
                    services.geo_advisor(&db),
                ));
            } else {
                black_box((
                    ContentEditor::open(root.path())?,
                    ContentCreator::open(root.path())?,
                    WorkspaceContent::open(root.path())?,
                    ContentRelationshipEditor::open(root.path())?,
                    MediaLibrary::open(root.path())?,
                    CoverWorkspace::open(root.path())?,
                    ArticleImageAttributionWorkspace::open(root.path())?,
                    GeoAdvisor::open(root.path(), &db)?,
                ));
            }
        }
        println!(
            "{}: {} assemblies, {:.2} ms",
            if shared { "shared" } else { "independent" },
            iterations,
            start.elapsed().as_secs_f64() * 1000.0
        );
    }
    Ok(())
}
