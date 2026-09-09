//! Local Go/CGO cross-compilation. Only static ELF artifacts leave this adapter.
use super::GitCodeArtifact;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum LinuxTarget {
    Amd64,
    Arm64,
}
impl LinuxTarget {
    pub(super) fn parse(platform: &str) -> Result<Self, String> {
        match platform.split_whitespace().collect::<Vec<_>>().as_slice() {
            ["Linux", "x86_64"] => Ok(Self::Amd64),
            ["Linux", "aarch64" | "arm64"] => Ok(Self::Arm64),
            _ => Err(format!(
                "unsupported backend platform {platform:?}: expected Linux x86_64 or aarch64"
            )),
        }
    }
    fn arch(self) -> &'static str {
        match self {
            Self::Amd64 => "amd64",
            Self::Arm64 => "arm64",
        }
    }
    fn triple(self) -> &'static str {
        match self {
            Self::Amd64 => "x86_64-linux-musl",
            Self::Arm64 => "aarch64-linux-musl",
        }
    }
    fn machine(self) -> u16 {
        match self {
            Self::Amd64 => 62,
            Self::Arm64 => 183,
        }
    }
}

/// Owns the committed source and temporary outputs. Construction succeeds only
/// after both executables pass validation, before deployment can upload either.
pub(super) struct BuiltBackend {
    source: GitCodeArtifact,
}
impl BuiltBackend {
    pub(super) fn preflight() -> Result<(), String> {
        for tool in ["go", "zig"] {
            let result = Command::new(tool).arg("version").output()
                .map_err(|e| format!("local backend build requires Go and Zig on PATH ({tool}: {e}); install them before deploying"))?;
            if !result.status.success() {
                return Err(format!(
                    "local backend toolchain check failed: {tool} version"
                ));
            }
        }
        Ok(())
    }
    pub(super) fn build(root: &Path, target: LinuxTarget) -> Result<Self, String> {
        let built = Self {
            source: GitCodeArtifact::materialize(root, "backend")?,
        };
        if !built.source().join("go.mod").is_file() {
            return Err("committed backend/go.mod is missing".into());
        }
        for (package, output) in [
            ("./backend.go", built.api()),
            ("./cmd/sqlite2pg", built.importer()),
        ] {
            println!(
                "[backend] local cross-build {package}@{} → linux/{} (static musl)",
                built.source.commit,
                target.arch()
            );
            let status = Self::command(&built.source(), target, package, &output)
                .status()
                .map_err(|e| format!("local backend build: {e}"))?;
            if !status.success() {
                return Err(format!(
                    "local backend build failed for {package}: {status}; no binaries uploaded"
                ));
            }
            let bytes = fs::read(&output).map_err(|e| format!("read built backend: {e}"))?;
            validate_elf(&bytes, target).map_err(|e| format!("{}: {e}", output.display()))?;
        }
        Ok(built)
    }
    fn command(source: &Path, target: LinuxTarget, package: &str, output: &Path) -> Command {
        let mut command = Command::new("go");
        command
            .current_dir(source)
            .env("GOOS", "linux")
            .env("GOARCH", target.arch())
            .env("GOAMD64", "v1")
            .env("GOARM64", "v8.0")
            .env("CGO_ENABLED", "1")
            // musl exposes SQLite's Linux pread64/pwrite64 names under this feature macro.
            .env("CGO_CFLAGS", "-O2 -g -D_LARGEFILE64_SOURCE")
            .env("CC", format!("zig cc -target {}", target.triple()))
            .env("GOWORK", "off")
            .env("GOFLAGS", "")
            .args([
                "build",
                "-p=2",
                "-mod=readonly",
                "-trimpath",
                "-buildvcs=false",
                "-tags=netgo,osusergo",
                "-ldflags=-linkmode external -extldflags '-static'",
                "-o",
            ])
            .arg(output)
            .arg(package);
        command
    }
    pub(super) fn source(&self) -> PathBuf {
        self.source.component("backend")
    }
    pub(super) fn api(&self) -> PathBuf {
        self.source.component("silan-backend")
    }
    pub(super) fn importer(&self) -> PathBuf {
        self.source.component("silan-sqlite2pg")
    }
}

fn validate_elf(bytes: &[u8], target: LinuxTarget) -> Result<(), String> {
    if bytes.len() < 64 || &bytes[..4] != b"\x7fELF" || bytes[4] != 2 || bytes[5] != 1 {
        return Err("expected a 64-bit little-endian Linux ELF executable".into());
    }
    let word = |i| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
    if word(16) != 2 || word(18) != target.machine() {
        return Err("ELF executable target does not match the deployment host".into());
    }
    let offset = u64::from_le_bytes(bytes[32..40].try_into().unwrap());
    let size = word(54) as u64;
    let count = word(56) as u64;
    if size < 56
        || count == 0
        || offset
            .checked_add(size * count)
            .is_none_or(|end| end > bytes.len() as u64)
    {
        return Err("invalid ELF program headers".into());
    }
    for i in 0..count {
        let pos = (offset + size * i) as usize;
        let kind = u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap());
        if kind == 2 || kind == 3 {
            return Err(
                "backend must be statically linked (dynamic loader/dependencies found)".into(),
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_platform_is_explicit() {
        assert_eq!(
            LinuxTarget::parse("Linux\nx86_64\n").unwrap(),
            LinuxTarget::Amd64
        );
        assert_eq!(
            LinuxTarget::parse("Linux\naarch64\n").unwrap(),
            LinuxTarget::Arm64
        );
        assert!(LinuxTarget::parse("Darwin arm64").is_err());
        assert!(LinuxTarget::parse("Linux riscv64").is_err());
    }
    #[test]
    fn rejects_wrong_architecture_and_dynamic_executables() {
        let mut elf = vec![0; 120];
        elf[..6].copy_from_slice(b"\x7fELF\x02\x01");
        elf[16] = 2;
        elf[18] = 62;
        elf[32] = 64;
        elf[54] = 56;
        elf[56] = 1;
        elf[64] = 1;
        assert!(validate_elf(&elf, LinuxTarget::Amd64).is_ok());
        assert!(validate_elf(&elf, LinuxTarget::Arm64).is_err());
        elf[64] = 3;
        assert!(validate_elf(&elf, LinuxTarget::Amd64).is_err());
        elf[64] = 2;
        assert!(validate_elf(&elf, LinuxTarget::Amd64).is_err());
        assert!(validate_elf(&elf[..70], LinuxTarget::Amd64).is_err());
    }
    #[test]
    #[ignore = "requires Go and Zig; compiles the committed production backend"]
    fn cross_build_committed_backend() {
        BuiltBackend::preflight().unwrap();
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        for target in [LinuxTarget::Amd64, LinuxTarget::Arm64] {
            let built = BuiltBackend::build(&root, target).unwrap();
            assert!(built.api().is_file());
            assert!(built.importer().is_file());
        }
    }
}
