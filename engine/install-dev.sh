#!/usr/bin/env bash
#
# install-dev.sh — build silan-viking from this source checkout and install it.
#
# For developers working on the engine: compiles the release binary and drops
# it on your PATH so `silan-viking` runs the code in this tree. Re-run it after
# any change to pick up the new build.
#
# Usage:
#   engine/install-dev.sh                 # build + install to ~/.local/bin
#   engine/install-dev.sh --prefix DIR    # install into DIR instead
#   engine/install-dev.sh --debug         # build the debug profile (faster build)
#
# This is the *developer* installer. End users want engine/install.sh (the
# curl|sh one), which downloads a prebuilt binary instead of compiling.

set -euo pipefail

# --- locate the engine workspace (this script's directory) ------------------
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- defaults / arg parsing -------------------------------------------------
PREFIX="${HOME}/.local/bin"
PROFILE="release"
PROFILE_FLAG="--release"

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)
      PREFIX="${2:?--prefix needs a directory}"
      shift 2
      ;;
    --debug)
      PROFILE="debug"
      PROFILE_FLAG=""
      shift
      ;;
    -h | --help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "install-dev.sh: unknown argument: $1" >&2
      echo "run 'engine/install-dev.sh --help' for usage" >&2
      exit 1
      ;;
  esac
done

# --- preflight: cargo must be present ---------------------------------------
if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo (the Rust toolchain) is required to build from source." >&2
  echo "       install it from https://rustup.rs and re-run." >&2
  exit 1
fi

# --- build ------------------------------------------------------------------
echo "[1/3] building silan-viking (${PROFILE} profile)..."
# shellcheck disable=SC2086  # PROFILE_FLAG is intentionally word-split (may be empty)
cargo build ${PROFILE_FLAG} --manifest-path "${ENGINE_DIR}/Cargo.toml" -p silan-viking-cli

BUILT_BIN="${ENGINE_DIR}/target/${PROFILE}/silan-viking"
if [ ! -x "${BUILT_BIN}" ]; then
  echo "error: build reported success but ${BUILT_BIN} is missing." >&2
  exit 1
fi

# --- install ----------------------------------------------------------------
echo "[2/3] installing silan + svk aliases to ${PREFIX}..."
mkdir -p "${PREFIX}"
install -m 755 "${BUILT_BIN}" "${PREFIX}/silan-viking"
ln -sfn "silan-viking" "${PREFIX}/silan"
ln -sfn "silan-viking" "${PREFIX}/svk"

# --- verify -----------------------------------------------------------------
echo "[3/3] verifying..."
INSTALLED_VERSION="$("${PREFIX}/silan-viking" --help 2>/dev/null | grep -oE 'silan-viking [0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
echo "  installed: ${PREFIX}/silan-viking  (${INSTALLED_VERSION:-version unknown})"
echo "  commands:  silan · svk · silan-viking"

# Warn — don't fail — if the install prefix is not on PATH; the binary is
# installed correctly, the shell just will not find it by bare name yet.
case ":${PATH}:" in
  *":${PREFIX}:"*)
    echo
    echo "done. run 'silan onboard' to get started."
    ;;
  *)
    echo
    echo "done — but ${PREFIX} is not on your PATH."
    echo "add this to your shell profile (~/.zshrc or ~/.bashrc):"
    echo "  export PATH=\"${PREFIX}:\$PATH\""
    echo "then run 'silan onboard'."
    ;;
esac
