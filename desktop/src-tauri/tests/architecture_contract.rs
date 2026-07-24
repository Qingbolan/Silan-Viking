use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

const FORBIDDEN_PRODUCTION_TERMS: &[&str] = &[
    "rusqlite",
    "SELECT ",
    "INSERT INTO",
    "item_part",
    "blog_posts",
    "content_interaction",
    "stats_cache",
    "ProjectionRepository",
    "mod projection",
    "mod insights",
];

#[test]
fn desktop_remains_a_schema_free_sdk_shell() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut production_sources = Vec::new();
    collect_rust_sources(&crate_root.join("src"), &mut production_sources);
    production_sources.push(crate_root.join("Cargo.toml"));

    for path in production_sources {
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
        for forbidden in FORBIDDEN_PRODUCTION_TERMS {
            assert!(
                !source.contains(forbidden),
                "{} contains forbidden Desktop persistence term {forbidden:?}",
                path.display()
            );
        }
    }
}

fn collect_rust_sources(directory: &Path, output: &mut Vec<std::path::PathBuf>) {
    for entry in fs::read_dir(directory)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", directory.display()))
    {
        let path = entry.expect("directory entry").path();
        if path.is_dir() {
            collect_rust_sources(&path, output);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            output.push(path);
        }
    }
}

#[test]
fn tauri_command_surface_matches_the_desktop_features() {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let desktop_root = crate_root.parent().expect("desktop root");
    let main = fs::read_to_string(crate_root.join("src/main.rs")).expect("main.rs");
    let commands = fs::read_to_string(crate_root.join("src/commands.rs")).expect("commands.rs");
    let mut frontend_paths = Vec::new();
    collect_frontend_sources(&desktop_root.join("src"), &mut frontend_paths);
    let frontend = frontend_paths
        .into_iter()
        .map(|path| {
            fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()))
        })
        .collect::<Vec<_>>()
        .join("\n");

    let registered = main
        .split("commands::")
        .skip(1)
        .filter_map(identifier_prefix)
        .collect::<BTreeSet<_>>();
    let declared = commands
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            line.strip_prefix("pub(crate) fn ")
                .or_else(|| line.strip_prefix("pub(crate) async fn "))
        })
        .filter_map(identifier_prefix)
        .collect::<BTreeSet<_>>();
    let invoked = invoked_commands(&frontend);

    assert_eq!(
        registered, declared,
        "registered and declared commands drifted"
    );
    assert_eq!(
        registered, invoked,
        "every public Desktop command must have one concrete UI consumer"
    );
}

fn collect_frontend_sources(directory: &Path, output: &mut Vec<std::path::PathBuf>) {
    for entry in fs::read_dir(directory)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", directory.display()))
    {
        let path = entry.expect("directory entry").path();
        if path.is_dir() {
            collect_frontend_sources(&path, output);
        } else if path
            .extension()
            .is_some_and(|extension| extension == "ts" || extension == "tsx")
        {
            output.push(path);
        }
    }
}

fn identifier_prefix(value: &str) -> Option<String> {
    let identifier = value
        .chars()
        .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
        .collect::<String>();
    (!identifier.is_empty()).then_some(identifier)
}

fn invoked_commands(source: &str) -> BTreeSet<String> {
    source
        .lines()
        .filter(|line| line.contains("invoke<") || line.contains("invoke("))
        .filter_map(|line| {
            let quote = line.find("('")? + 2;
            let end = line[quote..].find('\'')? + quote;
            Some(line[quote..end].to_owned())
        })
        .collect()
}
