#!/usr/bin/env bash
#
# install.sh — install the silan-viking CLI.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Personal-Website/main/engine/install.sh | sh
#
# It detects your OS/architecture, downloads the matching prebuilt binary from
# the project's GitHub Releases, and installs it to ~/.local/bin. If no prebuilt
# binary exists for your platform (or no release is published yet), it falls
# back to building from source with `cargo install` — which needs the Rust
# toolchain (https://rustup.rs).
#
# Env overrides:
#   SILAN_INSTALL_DIR   install location          (default: ~/.local/bin)
#   SILAN_VERSION       release tag to install     (default: latest)

set -eu

REPO="Qingbolan/Silan-Personal-Website"
BIN="silan-viking"
INSTALL_DIR="${SILAN_INSTALL_DIR:-${HOME}/.local/bin}"
VERSION="${SILAN_VERSION:-latest}"

say()  { printf '%s\n' "$*"; }
err()  { printf 'error: %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- detect platform → Rust target triple -----------------------------------
# Release assets are named `silan-viking-<triple>`, e.g.
# silan-viking-aarch64-apple-darwin. Keep this map in sync with the release CI.
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

# --- download helper (curl or wget) -----------------------------------------
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

# --- fallback: build from source via cargo ----------------------------------
install_from_source() {
  say "no prebuilt binary available — building from source with cargo."
  have cargo || die "cargo (the Rust toolchain) is required for the source \
build. Install it from https://rustup.rs and re-run."
  # `cargo install` puts the binary in ~/.cargo/bin; honor the requested dir
  # by installing there directly with --root (it appends /bin).
  cargo install \
    --git "https://github.com/${REPO}.git" \
    --branch main \
    --root "${INSTALL_DIR%/bin}" \
    silan-viking-cli
  # --root DIR installs to DIR/bin; normalise so the verify step finds it.
  if [ "${INSTALL_DIR##*/}" != "bin" ]; then
    INSTALL_DIR="${INSTALL_DIR%/bin}/bin"
  fi
}

# --- install a prebuilt release asset ---------------------------------------
install_prebuilt() {
  target="$1"
  asset="${BIN}-${target}"
  if [ "${VERSION}" = "latest" ]; then
    url="https://github.com/${REPO}/releases/latest/download/${asset}"
  else
    url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
  fi

  tmp="$(mktemp)"
  say "downloading ${asset} (${VERSION})..."
  if ! fetch "${url}" "${tmp}"; then
    rm -f "${tmp}"
    return 1  # no asset for this platform/version — caller falls back.
  fi
  mkdir -p "${INSTALL_DIR}"
  install -m 755 "${tmp}" "${INSTALL_DIR}/${BIN}"
  rm -f "${tmp}"
  return 0
}

main() {
  target="$(detect_target)"
  say "installing ${BIN} for ${target}"

  if ! install_prebuilt "${target}"; then
    install_from_source
  fi

  installed="${INSTALL_DIR}/${BIN}"
  [ -x "${installed}" ] || die "install finished but ${installed} is missing"
  ver="$("${installed}" --help 2>/dev/null \
    | grep -oE 'silan-viking [0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
  say "installed ${installed}  (${ver:-version unknown})"

  # PATH check — installed correctly either way, but a bare-name call needs
  # the install dir on PATH.
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*)
      say ""
      say "done. next: run 'silan-viking guide' to get started."
      ;;
    *)
      say ""
      say "done — but ${INSTALL_DIR} is not on your PATH."
      say "add to your shell profile (~/.zshrc or ~/.bashrc):"
      say "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      say "then run 'silan-viking guide'."
      ;;
  esac
}

main "$@"
