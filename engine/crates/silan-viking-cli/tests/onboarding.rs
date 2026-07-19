use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

fn fixture() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "silan-onboarding-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&root).expect("fixture");
    root
}

#[test]
fn plan_is_read_only_and_reports_required_lifecycle() {
    let root = fixture();
    let output = Command::new(bin())
        .args(["onboard", "--plan"])
        .current_dir(&root)
        .output()
        .expect("onboard plan");
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Deployment readiness plan"), "{stdout}");
    assert!(
        stdout.contains("initialise project       required"),
        "{stdout}"
    );
    assert!(!root.join("silan-viking.toml").exists());
    assert!(!root.join("content").exists());
}

#[test]
fn setup_alias_uses_the_same_plan() {
    let root = fixture();
    let output = Command::new(bin())
        .args(["setup", "--plan", "--flow", "advanced"])
        .current_dir(&root)
        .output()
        .expect("setup plan");
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("flow=advanced · plan only"), "{stdout}");
}
