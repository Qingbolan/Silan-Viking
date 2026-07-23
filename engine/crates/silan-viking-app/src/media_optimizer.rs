//! Media staging and lossless optimization.
//!
//! Deployment and batch optimization have different lifecycle requirements.
//! Deployment must be fast and bounded, so it stages source bytes directly.
//! Batch optimization can spend extra CPU on lossless tools because it is an
//! explicit maintenance action.

use silan_viking_base::ContentHash;
use std::ffi::OsStr;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use thiserror::Error;

/// Bump this when optimizer tools or arguments change. The legacy CLI's
/// whole-media generation hash includes it, while HTTP deploy manifests keep
/// per-file hashes as raw byte hashes because the server verifies uploaded
/// media directly.
pub const MEDIA_OPTIMIZER_VERSION: &str = "deploy-media-v1-source-bytes";
const OPTIMIZER_COMMAND_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_PNG_OPTIMIZATION_BYTES: u64 = 1_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaOptimizationStatus {
    Optimized,
    KeptOriginal,
    StagedOriginal,
    UnsupportedFormat,
    ToolUnavailable,
    ToolFailed(String),
    ToolTimedOut(String),
    SkippedLargeFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaOptimizationReport {
    pub status: MediaOptimizationStatus,
    pub original_bytes: u64,
    pub output_bytes: u64,
}

#[derive(Debug, Error)]
pub enum MediaOptimizationError {
    #[error("create output parent `{path}`: {detail}")]
    CreateParent { path: String, detail: String },
    #[error("copy media `{source_path}` to `{destination}`: {detail}")]
    Copy {
        source_path: String,
        destination: String,
        detail: String,
    },
    #[error("inspect media `{path}`: {detail}")]
    Inspect { path: String, detail: String },
    #[error("replace optimized media `{path}`: {detail}")]
    Replace { path: String, detail: String },
    #[error("write optimized media `{path}`: {detail}")]
    Write { path: String, detail: String },
}

impl MediaOptimizationReport {
    pub fn saved_bytes(&self) -> u64 {
        self.original_bytes.saturating_sub(self.output_bytes)
    }
}

pub fn hash_deploy_media_asset(source: &Path) -> Result<ContentHash, MediaOptimizationError> {
    let bytes = fs::read(source).map_err(|error| MediaOptimizationError::Inspect {
        path: source.display().to_string(),
        detail: error.to_string(),
    })?;
    Ok(ContentHash::of(&bytes))
}

pub fn stage_deploy_media_asset(
    source: &Path,
    destination: &Path,
) -> Result<MediaOptimizationReport, MediaOptimizationError> {
    copy_media_asset(source, destination, MediaOptimizationStatus::StagedOriginal)
}

/// Copy `source` to `destination`, then losslessly optimize supported image
/// formats in-place when a smaller output can be produced.
pub fn optimize_media_asset(
    source: &Path,
    destination: &Path,
) -> Result<MediaOptimizationReport, MediaOptimizationError> {
    copy_media_asset(source, destination, MediaOptimizationStatus::KeptOriginal)?;
    let original_bytes = file_len(destination)?;
    let status = match media_kind(source) {
        Some(MediaKind::Png) if original_bytes > MAX_PNG_OPTIMIZATION_BYTES => {
            Ok(MediaOptimizationStatus::SkippedLargeFile)
        }
        Some(MediaKind::Png) => optimize_with_candidate(destination, |input, output| {
            command_status(
                Command::new("zopflipng")
                    .arg("-y")
                    .arg(input)
                    .arg(output)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null()),
            )
        }),
        Some(MediaKind::Jpeg) => optimize_with_candidate(destination, |input, output| {
            let output_file = File::create(output).map_err(|error| error.to_string())?;
            command_status(
                Command::new("jpegtran")
                    .arg("-copy")
                    .arg("all")
                    .arg("-optimize")
                    .arg(input)
                    .stdout(Stdio::from(output_file))
                    .stderr(Stdio::null()),
            )
        }),
        Some(MediaKind::Other) => Ok(MediaOptimizationStatus::UnsupportedFormat),
        None => Ok(MediaOptimizationStatus::UnsupportedFormat),
    }?;
    let output_bytes = file_len(destination)?;

    Ok(MediaOptimizationReport {
        status,
        original_bytes,
        output_bytes,
    })
}

fn copy_media_asset(
    source: &Path,
    destination: &Path,
    status: MediaOptimizationStatus,
) -> Result<MediaOptimizationReport, MediaOptimizationError> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| MediaOptimizationError::CreateParent {
            path: parent.display().to_string(),
            detail: error.to_string(),
        })?;
    }
    if source != destination {
        fs::copy(source, destination).map_err(|error| MediaOptimizationError::Copy {
            source_path: source.display().to_string(),
            destination: destination.display().to_string(),
            detail: error.to_string(),
        })?;
    }
    let bytes = file_len(destination)?;
    Ok(MediaOptimizationReport {
        status,
        original_bytes: bytes,
        output_bytes: bytes,
    })
}

pub fn optimize_media_tree(
    root: &Path,
) -> Result<MediaTreeOptimizationReport, MediaOptimizationError> {
    let mut report = MediaTreeOptimizationReport::default();
    optimize_media_tree_recursive(root, &mut report)?;
    Ok(report)
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct MediaTreeOptimizationReport {
    pub files_seen: usize,
    pub files_optimized: usize,
    pub bytes_before: u64,
    pub bytes_after: u64,
}

impl MediaTreeOptimizationReport {
    pub fn saved_bytes(&self) -> u64 {
        self.bytes_before.saturating_sub(self.bytes_after)
    }
}

fn optimize_media_tree_recursive(
    dir: &Path,
    report: &mut MediaTreeOptimizationReport,
) -> Result<(), MediaOptimizationError> {
    for entry in fs::read_dir(dir).map_err(|error| MediaOptimizationError::Inspect {
        path: dir.display().to_string(),
        detail: error.to_string(),
    })? {
        let entry = entry.map_err(|error| MediaOptimizationError::Inspect {
            path: dir.display().to_string(),
            detail: error.to_string(),
        })?;
        let path = entry.path();
        if path.is_dir() {
            optimize_media_tree_recursive(&path, report)?;
            continue;
        }
        if !path.is_file() || media_kind(&path).is_none() {
            continue;
        }
        report.files_seen += 1;
        let before = file_len(&path)?;
        let file_report = optimize_media_asset(&path, &path)?;
        let after = file_report.output_bytes;
        report.bytes_before += before;
        report.bytes_after += after;
        if matches!(file_report.status, MediaOptimizationStatus::Optimized) {
            report.files_optimized += 1;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaKind {
    Png,
    Jpeg,
    Other,
}

fn media_kind(path: &Path) -> Option<MediaKind> {
    let ext = path
        .extension()
        .and_then(OsStr::to_str)?
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some(MediaKind::Png),
        "jpg" | "jpeg" => Some(MediaKind::Jpeg),
        "gif" | "webp" | "avif" | "ico" | "svg" => Some(MediaKind::Other),
        _ => None,
    }
}

fn optimize_with_candidate<F>(
    destination: &Path,
    run: F,
) -> Result<MediaOptimizationStatus, MediaOptimizationError>
where
    F: FnOnce(&Path, &Path) -> Result<MediaOptimizationStatus, String>,
{
    let candidate = candidate_path(destination);
    let cleanup = |path: &Path| {
        let _ = fs::remove_file(path);
    };
    let status = run(destination, &candidate).map_err(|detail| {
        cleanup(&candidate);
        MediaOptimizationError::Write {
            path: destination.display().to_string(),
            detail,
        }
    })?;
    if !matches!(status, MediaOptimizationStatus::Optimized) {
        cleanup(&candidate);
        return Ok(status);
    }

    let original = file_len(destination)?;
    let optimized = match file_len(&candidate) {
        Ok(len) => len,
        Err(error) => {
            cleanup(&candidate);
            return Err(error);
        }
    };
    if optimized >= original {
        cleanup(&candidate);
        return Ok(MediaOptimizationStatus::KeptOriginal);
    }
    fs::rename(&candidate, destination).map_err(|error| MediaOptimizationError::Replace {
        path: destination.display().to_string(),
        detail: error.to_string(),
    })?;
    Ok(MediaOptimizationStatus::Optimized)
}

fn command_status(command: &mut Command) -> Result<MediaOptimizationStatus, String> {
    let program = command.get_program().to_string_lossy().to_string();
    let started = Instant::now();
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(MediaOptimizationStatus::ToolUnavailable);
        }
        Err(error) => return Err(format!("{program}: {error}")),
    };
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(MediaOptimizationStatus::Optimized),
            Ok(Some(status)) => {
                return Ok(MediaOptimizationStatus::ToolFailed(format!(
                    "{program} exited with {status}"
                )));
            }
            Ok(None) if started.elapsed() >= OPTIMIZER_COMMAND_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(MediaOptimizationStatus::ToolTimedOut(format!(
                    "{program} exceeded {}s",
                    OPTIMIZER_COMMAND_TIMEOUT.as_secs()
                )));
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(error) => return Err(format!("{program}: {error}")),
        }
    }
}

fn file_len(path: &Path) -> Result<u64, MediaOptimizationError> {
    Ok(fs::metadata(path)
        .map_err(|error| MediaOptimizationError::Inspect {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?
        .len())
}

fn candidate_path(destination: &Path) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("media");
    destination.with_file_name(format!(".{name}.optimized"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn unsupported_media_is_copied_without_reencoding() {
        let dir = tempfile::tempdir().expect("temp dir");
        let source = dir.path().join("icon.svg");
        let destination = dir.path().join("out/icon.svg");
        fs::write(&source, b"<svg></svg>").expect("write source");

        let report = optimize_media_asset(&source, &destination).expect("stage media");

        assert_eq!(report.status, MediaOptimizationStatus::UnsupportedFormat);
        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"<svg></svg>"
        );
    }

    #[test]
    fn optimized_hash_reads_staged_bytes() {
        let dir = tempfile::tempdir().expect("temp dir");
        let source = dir.path().join("photo.gif");
        fs::write(&source, b"same bytes").expect("write source");

        let hash = hash_deploy_media_asset(&source).expect("hash media");

        assert_eq!(hash, ContentHash::of(b"same bytes"));
    }

    #[test]
    fn deployment_staging_does_not_run_external_optimizers() {
        let dir = tempfile::tempdir().expect("temp dir");
        let source = dir.path().join("image.png");
        let destination = dir.path().join("out/image.png");
        fs::write(&source, b"png bytes").expect("write source");

        let report = stage_deploy_media_asset(&source, &destination).expect("stage media");

        assert_eq!(report.status, MediaOptimizationStatus::StagedOriginal);
        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"png bytes"
        );
    }

    #[test]
    fn large_png_is_kept_out_of_interactive_optimizer() {
        let dir = tempfile::tempdir().expect("temp dir");
        let source = dir.path().join("large.png");
        let destination = dir.path().join("out/large.png");
        fs::write(
            &source,
            vec![0_u8; (MAX_PNG_OPTIMIZATION_BYTES + 1) as usize],
        )
        .expect("write source");

        let report = optimize_media_asset(&source, &destination).expect("stage media");

        assert_eq!(report.status, MediaOptimizationStatus::SkippedLargeFile);
        assert_eq!(report.original_bytes, MAX_PNG_OPTIMIZATION_BYTES + 1);
        assert_eq!(report.output_bytes, MAX_PNG_OPTIMIZATION_BYTES + 1);
    }

    #[test]
    fn tree_optimizer_visits_supported_assets() {
        let dir = tempfile::tempdir().expect("temp dir");
        fs::create_dir_all(dir.path().join("nested")).expect("mkdir");
        fs::write(dir.path().join("nested/a.svg"), b"<svg />").expect("svg");
        let mut text = File::create(dir.path().join("notes.txt")).expect("txt");
        writeln!(text, "ignore me").expect("write txt");

        let report = optimize_media_tree(dir.path()).expect("optimize tree");

        assert_eq!(report.files_seen, 1);
        assert_eq!(report.files_optimized, 0);
    }
}
