#!/usr/bin/env bash
# Package a clean, annotated Tide release anchor. Never packages mutable source.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: package-macos.sh OUTPUT_DIRECTORY"
  echo "Build native macOS CLI, Desktop ZIP/DMG and SHA256SUMS from a clean annotated v* tag."
  exit 0
fi
[[ $# == 1 ]] || { echo "An output directory is required" >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || { echo "macOS is required" >&2; exit 1; }
cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || { echo "Release source must be clean and committed" >&2; exit 1; }
tag="$(git describe --exact-match --match 'v*' HEAD)"
[[ "$(git cat-file -t "$tag")" == tag ]] || { echo "Release tag must be annotated" >&2; exit 1; }
version="$(scripts/tide-version.sh)"
[[ "$tag" == "v$version" ]] || { echo "Tide coordinate $version does not match $tag" >&2; exit 1; }
mkdir -p "$1"
output="$(cd "$1" && pwd)"
case "$output/" in "$repo_root/"*) echo "Use an output directory outside the repository" >&2; exit 1;; esac
[[ -z "$(ls -A "$output")" ]] || { echo "Output directory must be empty" >&2; exit 1; }
case "$(uname -m)" in
  arm64) target=aarch64-apple-darwin ;;
  x86_64) target=x86_64-apple-darwin ;;
  *) echo "Unsupported macOS architecture" >&2; exit 1 ;;
esac
packaging/release/dev-install-local.sh --no-install
binary="$repo_root/engine/target/release/silan-viking"
app="$repo_root/desktop/src-tauri/target/release/bundle/macos/Silan Context System.app"
[[ "$("$binary" --version)" == "silan-viking $version" ]] || { echo "CLI version mismatch" >&2; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")" == "$version" ]] || { echo "Desktop version mismatch" >&2; exit 1; }
cp "$binary" "$output/silan-viking-$target"
ditto -c -k --sequesterRsrc --keepParent "$app" "$output/Silan-Context-System-$version-$target.zip"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
ditto "$app" "$staging/Silan Context System.app"
ln -s /Applications "$staging/Applications"
hdiutil create -volname "Silan Context System $version" -srcfolder "$staging" -format UDZO "$output/Silan-Context-System-$version-$target.dmg"
(
  cd "$output"
  shasum -a 256 silan-viking-* ./*.zip ./*.dmg | sed 's|  ./|  |' > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
)
[[ -z "$(git status --porcelain)" ]] || { echo "Build modified release source" >&2; exit 1; }
echo "Release packages: $output"
