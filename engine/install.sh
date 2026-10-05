#!/bin/sh
#
# install.sh — install the silan-viking CLI (silan / svk / silan-viking).
#
# One-liner (stable release):
#   curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Context-System/main/engine/install.sh | sh
# Current main branch (verified source build):
#   curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Context-System/main/engine/install.sh | sh -s -- --channel main
#
# Channels and options: see usage() below or run with --help. The help text
# lives in the script body so piped installs can print it too.

set -eu

REPO="Qingbolan/Silan-Context-System"
BIN="silan-viking"
CHANNEL="${SILAN_CHANNEL:-stable}"
VERSION="${SILAN_VERSION:-latest}"
REF="${SILAN_REF:-main}"
INSTALL_DIR="${SILAN_INSTALL_DIR:-${HOME}/.local/bin}"
STATE_DIR="${SILAN_VIKING_STATE_DIR:-${XDG_STATE_HOME:-${HOME}/.local/state}/silan-viking}"
WORK_DIR=""

say()  { printf '%s\n' "$*"; }
die()  { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
install.sh — install the silan-viking CLI (silan / svk / silan-viking).

Usage:
  install.sh [--channel stable|main] [--version TAG] [--ref REF]
             [--prefix DIR] [--state-dir DIR]
  curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Context-System/main/engine/install.sh | sh -s -- [options]

Channels:
  stable  (default) download the prebuilt binary of a GitHub Release (latest,
          or --version TAG), verify it against the release's SHA256SUMS, and
          install it. Fails instead of silently building from source.
  main    clone the repository at --ref (default: main) and run the documented
          source installer engine/install-dev.sh (engine tests, locked release
          build, binary verification). Needs git, cargo/rustc and TideMark.
          Use it for features not yet released (Moments, Desktop).

Options:
  --channel NAME   stable or main                    (default: stable)
  --version TAG    stable only: release tag          (default: latest)
  --ref REF        main only: branch, tag or commit  (default: main)
  --prefix DIR     install directory                 (default: ~/.local/bin)
  --state-dir DIR  install-receipt directory   (default: ~/.local/state/silan-viking)
  -h, --help       show this help

Both channels record source, version and binary SHA-256 in
<state-dir>/install-receipt.
Environment equivalents: SILAN_CHANNEL, SILAN_VERSION, SILAN_REF,
SILAN_INSTALL_DIR, SILAN_VIKING_STATE_DIR.
EOF
}

cleanup() {
  if [ -n "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}"
  fi
}

sha256_file() {
  if have shasum; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif have sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  else
    die "need shasum or sha256sum to verify the download"
  fi
}

fetch() {
  # fetch <url> <output-path>; returns non-zero if the download fails.
  if have curl; then
    curl -fsSL "$1" -o "$2"
  elif have wget; then
    wget -q "$1" -O "$2"
  else
    die "need curl or wget to download"
  fi
}

# Release assets are named `silan-viking-<triple>`. Keep in sync with the
# release CI.
detect_target() {
  os="$(uname -s)"
  arch="$(uname -m)"
  case "${os}" in
    Darwin) os_part="apple-darwin" ;;
    Linux)  os_part="unknown-linux-gnu" ;;
    *) die "unsupported OS: ${os} (only macOS and Linux are supported)" ;;
  esac
  case "${arch}" in
    arm64 | aarch64) arch_part="aarch64" ;;
    x86_64 | amd64)  arch_part="x86_64" ;;
    *) die "unsupported architecture: ${arch}" ;;
  esac
  printf '%s-%s' "${arch_part}" "${os_part}"
}

install_alias() {
  alias_path="${INSTALL_DIR}/$1"
  if [ -e "${alias_path}" ] && [ ! -L "${alias_path}" ]; then
    die "refusing to replace non-symlink alias: ${alias_path}"
  fi
  ln -sfn "${BIN}" "${alias_path}"
}

install_stable() {
  target="$(detect_target)"
  asset="${BIN}-${target}"
  if [ "${VERSION}" = "latest" ]; then
    base="https://github.com/${REPO}/releases/latest/download"
  else
    base="https://github.com/${REPO}/releases/download/${VERSION}"
  fi

  say "==> [1/3] download ${asset} (${VERSION}) and SHA256SUMS"
  fetch "${base}/${asset}" "${WORK_DIR}/${asset}" \
    || die "release ${VERSION} has no ${asset}; use --channel main to build from source"
  fetch "${base}/SHA256SUMS" "${WORK_DIR}/SHA256SUMS" \
    || die "release ${VERSION} publishes no SHA256SUMS; refusing an unverified binary"

  expected="$(awk -v name="${asset}" '$2 == name || $2 == "*" name {print $1}' "${WORK_DIR}/SHA256SUMS")"
  [ -n "${expected}" ] || die "SHA256SUMS has no entry for ${asset}"
  actual="$(sha256_file "${WORK_DIR}/${asset}")"
  [ "${actual}" = "${expected}" ] \
    || die "checksum mismatch for ${asset}: expected ${expected}, got ${actual}"
  chmod 755 "${WORK_DIR}/${asset}"
  version="$("${WORK_DIR}/${asset}" --version)" \
    || die "downloaded binary does not run on this machine"

  say "==> [2/3] atomically install ${BIN} to ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}" "${STATE_DIR}"
  staged="${INSTALL_DIR}/.${BIN}.new.$$"
  install -m 755 "${WORK_DIR}/${asset}" "${staged}"
  mv -f "${staged}" "${INSTALL_DIR}/${BIN}"
  install_alias silan
  install_alias svk

  say "==> [3/3] verify installation and write provenance receipt"
  installed="${INSTALL_DIR}/${BIN}"
  installed_sha256="$(sha256_file "${installed}")"
  [ "${installed_sha256}" = "${expected}" ] \
    || die "installed binary checksum differs from the verified release asset"
  {
    printf 'format=1\n'
    printf 'installed_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'channel=stable\n'
    printf 'release=%s\n' "${VERSION}"
    printf 'asset=%s\n' "${base}/${asset}"
    printf 'version=%s\n' "${version}"
    printf 'binary=%s\n' "${installed}"
    printf 'sha256=%s\n' "${installed_sha256}"
  } > "${STATE_DIR}/.install-receipt.new.$$"
  mv -f "${STATE_DIR}/.install-receipt.new.$$" "${STATE_DIR}/install-receipt"

  say ""
  say "  installed stable release"
  say "    version:  ${version} (${VERSION})"
  say "    sha256:   ${installed_sha256} (matches SHA256SUMS)"
  say "    commands: ${INSTALL_DIR}/{silan,svk,${BIN}}"
  say "    receipt:  ${STATE_DIR}/install-receipt"
}

install_main() {
  for tool in git cargo rustc tide; do
    have "${tool}" || die "--channel main needs ${tool} (Rust: https://rustup.rs; TideMark: https://github.com/Qingbolan/TideMark)"
  done
  checkout="${WORK_DIR}/source"
  say "==> clone ${REPO} at ${REF}"
  # Full commit history (blobs on demand) so TideMark can resolve the
  # build coordinate from tags.
  git clone --quiet --filter=blob:none "https://github.com/${REPO}.git" "${checkout}"
  git -C "${checkout}" checkout --quiet --detach "${REF}" \
    || die "ref not found: ${REF}"
  revision="$(git -C "${checkout}" rev-parse HEAD)"
  say "    revision: ${revision}"
  # The documented source path owns tests, the locked build, verification,
  # atomic activation and the receipt.
  "${checkout}/engine/install-dev.sh" --prefix "${INSTALL_DIR}" --state-dir "${STATE_DIR}"
  say "    channel:  main (ref ${REF} = ${revision})"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --channel)   shift; [ $# -gt 0 ] || die "--channel needs stable or main"; CHANNEL="$1" ;;
    --version)   shift; [ $# -gt 0 ] || die "--version needs a release tag"; VERSION="$1" ;;
    --ref)       shift; [ $# -gt 0 ] || die "--ref needs a branch, tag or commit"; REF="$1" ;;
    --prefix)    shift; [ $# -gt 0 ] || die "--prefix needs a directory"; INSTALL_DIR="$1" ;;
    --state-dir) shift; [ $# -gt 0 ] || die "--state-dir needs a directory"; STATE_DIR="$1" ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown argument: $1 (run with --help for usage)" ;;
  esac
  shift
done

case "${CHANNEL}" in
  stable | main) ;;
  *) die "unknown channel: ${CHANNEL} (expected stable or main)" ;;
esac

WORK_DIR="$(mktemp -d)"
trap cleanup EXIT HUP INT TERM

if [ "${CHANNEL}" = "stable" ]; then
  install_stable
else
  install_main
fi

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*)
    say "    next:     silan onboard"
    ;;
  *)
    say ""
    say "  ${INSTALL_DIR} is not on your PATH. Add this to your shell profile:"
    say "    export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac
