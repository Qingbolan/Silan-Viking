use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
}

fn run(args: &[&str]) -> (bool, String, String) {
    let output = Command::new(bin()).args(args).output().expect("CLI runs");
    (
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    )
}

#[test]
fn cover_find_returns_content_and_series_target_uris_as_json() {
    let content = fixture();
    let content = content.to_str().expect("fixture path");

    let (ok, stdout, stderr) = run(&[
        "--content",
        content,
        "cover",
        "find",
        "hello",
        "--type",
        "blog",
        "--json",
    ]);
    assert!(ok, "cover find blog failed: {stderr}");
    let blogs: Value = serde_json::from_str(&stdout).expect("blog output is JSON");
    assert_eq!(blogs[0]["uri"], "silan://resources/blog/hello-world");
    assert_eq!(blogs[0]["kind"], "blog");

    let (ok, stdout, stderr) = run(&[
        "--content",
        content,
        "cover",
        "find",
        "Sample",
        "--type",
        "project",
        "--json",
    ]);
    assert!(ok, "cover find project failed: {stderr}");
    let projects: Value = serde_json::from_str(&stdout).expect("project output is JSON");
    assert_eq!(
        projects[0]["uri"],
        "silan://resources/projects/sample-project"
    );
    assert_eq!(projects[0]["kind"], "project");

    let (ok, stdout, stderr) = run(&[
        "--content",
        content,
        "cover",
        "find",
        "Tutorial",
        "--type",
        "series",
        "--json",
    ]);
    assert!(ok, "cover find series failed: {stderr}");
    let series: Value = serde_json::from_str(&stdout).expect("series output is JSON");
    assert_eq!(
        series[0]["uri"],
        "silan://resources/episode/tutorial-series"
    );
    assert_eq!(series[0]["kind"], "episode_series");
}

#[test]
fn cover_generate_dry_run_exposes_prompt_and_target_asset_directory() {
    let content = fixture();
    let (ok, stdout, stderr) = run(&[
        "--content",
        content.to_str().expect("fixture path"),
        "cover",
        "generate",
        "silan://resources/blog/hello-world",
        "--headline",
        "Researcher 为论文做网站，能不能只更新一次？",
        "--value",
        "几分钟完成一次更新，让进展被记录、理解和发现。",
        "--language",
        "zh",
        "--size",
        "wide",
        "--dry-run",
        "--json",
    ]);
    assert!(ok, "cover dry-run failed: {stderr}");
    let preview: Value = serde_json::from_str(&stdout).expect("dry-run output is JSON");
    assert_eq!(
        preview["asset_directory_uri"],
        "silan://resources/blog/hello-world/assets/"
    );
    assert_eq!(preview["apply"], true);
    assert_eq!(preview["size"], "1536x1024");
    assert!(preview["prompt"]
        .as_str()
        .expect("prompt")
        .contains("phone-readable hierarchy"));
    assert!(preview["prompt"]
        .as_str()
        .expect("prompt")
        .contains("几分钟完成一次更新"));
    assert!(preview["prompt"]
        .as_str()
        .expect("prompt")
        .contains("需要快速判断"));
}

#[test]
fn cover_generate_rejects_non_cover_target_uri_before_generation() {
    let content = fixture();
    let (ok, _stdout, stderr) = run(&[
        "--content",
        content.to_str().expect("fixture path"),
        "cover",
        "generate",
        "silan://resources/episode/tutorial-series/episode-01-intro",
        "--dry-run",
    ]);
    assert!(!ok);
    assert!(
        stderr.contains("expected silan://resources/blog/<slug>"),
        "{stderr}"
    );
}
