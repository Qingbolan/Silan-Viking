#!/usr/bin/env bash
# dev-install-local.sh — build the current Silan checkout and deploy its
# SDK/CLI plus Desktop application to this Mac.
#
# This is the local developer counterpart to a release installer. It keeps the
# installed command and Desktop app on the exact same source revision:
#   1. build the Rust SDK workspace and CLI
#   2. build the Tauri Desktop .app
#   3. install silan-viking plus the silan / svk aliases to ~/.local/bin
#   4. atomically replace /Applications/Silan Context System.app
#   5. verify the installed command aliases and macOS bundle
#
# Usage:
#   packaging/release/dev-install-local.sh
#   packaging/release/dev-install-local.sh --debug
#   packaging/release/dev-install-local.sh --no-install
#   packaging/release/dev-install-local.sh --cli-only
#   packaging/release/dev-install-local.sh --desktop-only
#   packaging/release/dev-install-local.sh --user-apps
#   packaging/release/dev-install-local.sh --open
#
# Author: Silan.Hu <silan.hu@u.nus.edu>
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
engine_root="$repo_root/engine"
desktop_root="$repo_root/desktop"

# Non-interactive launchers do not always source the user's shell profile.
# Include standard Rust/Homebrew locations and the newest installed NVM Node.
nvm_bin=""
if [ -d "$HOME/.nvm/versions/node" ]; then
    nvm_node=$(find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 \
        -type f -name node -perm -111 2>/dev/null | sort | tail -n 1)
    [ -z "$nvm_node" ] || nvm_bin="$(dirname "$nvm_node")"
fi
export PATH="${nvm_bin:+$nvm_bin:}$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

profile="release"
install_enabled=1
build_cli=1
build_desktop=1
open_after_install=0
install_bin="${SILAN_INSTALL_BIN:-$HOME/.local/bin}"
install_apps="${SILAN_INSTALL_APPS:-/Applications}"

usage() {
    sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

die() {
    echo "dev-install-local.sh: $*" >&2
    exit 1
}

have() {
    command -v "$1" >/dev/null 2>&1
}

install_with_sudo=0
run_installer() {
    if [ "$install_with_sudo" -eq 1 ]; then
        sudo "$@"
    else
        "$@"
    fi
}

while [ $# -gt 0 ]; do
    case "$1" in
        --debug)       profile="debug" ;;
        --release)     profile="release" ;;
        --no-install)  install_enabled=0 ;;
        --cli-only)    build_desktop=0 ;;
        --desktop-only) build_cli=0 ;;
        --user-apps)   install_apps="$HOME/Applications" ;;
        --open)        open_after_install=1 ;;
        --bin-dir)
            shift
            [ $# -gt 0 ] || die "--bin-dir needs a directory"
            install_bin="$1"
            ;;
        --app-dir)
            shift
            [ $# -gt 0 ] || die "--app-dir needs a directory"
            install_apps="$1"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "unknown argument: $1"
            ;;
    esac
    shift
done

[ "$build_cli" -eq 1 ] || [ "$build_desktop" -eq 1 ] \
    || die "--cli-only and --desktop-only cannot be combined"
[ "$(uname -s)" = "Darwin" ] \
    || die "Desktop local deployment currently supports macOS only"

have cargo || die "cargo is required (install Rust from https://rustup.rs)"
if [ "$build_desktop" -eq 1 ]; then
    have npm || die "npm is required to build the Desktop application"
    have ditto || die "macOS ditto is required to install the .app bundle"
fi

cli_bin="$engine_root/target/$profile/silan-viking"
desktop_app="$desktop_root/src-tauri/target/$profile/bundle/macos/Silan Context System.app"

step=1
total_steps=$((build_cli + build_desktop + install_enabled))

if [ "$build_cli" -eq 1 ]; then
    echo "==> [$step/$total_steps] build Rust SDK workspace + CLI ($profile)"
    (
        cd "$engine_root"
        if [ "$profile" = "release" ]; then
            cargo build --workspace --release
        else
            cargo build --workspace
        fi
    )
    [ -x "$cli_bin" ] || die "CLI build artefact missing: $cli_bin"
    step=$((step + 1))
fi

if [ "$build_desktop" -eq 1 ]; then
    echo "==> [$step/$total_steps] build Silan Context System.app ($profile)"
    if [ ! -d "$desktop_root/node_modules" ]; then
        echo "    desktop dependencies missing; running npm ci"
        (cd "$desktop_root" && npm ci)
    fi
    (
        cd "$desktop_root"
        if [ "$profile" = "release" ]; then
            npm run build:desktop
        else
            npm run build:desktop -- --debug
        fi
    )
    [ -d "$desktop_app" ] || die "Desktop bundle missing: $desktop_app"
    [ -f "$desktop_app/Contents/Info.plist" ] \
        || die "Desktop bundle has no Contents/Info.plist"
    plutil -lint "$desktop_app/Contents/Info.plist" >/dev/null
    step=$((step + 1))
fi

if [ "$install_enabled" -eq 0 ]; then
    echo
    echo "  ✓ Build complete. Nothing installed."
    [ "$build_cli" -eq 0 ] || echo "    CLI:     $cli_bin"
    [ "$build_desktop" -eq 0 ] || echo "    Desktop: $desktop_app"
    exit 0
fi

echo "==> [$step/$total_steps] deploy local artefacts"

if [ "$build_cli" -eq 1 ]; then
    mkdir -p "$install_bin"
    install -m 755 "$cli_bin" "$install_bin/silan-viking"
    ln -sfn "silan-viking" "$install_bin/silan"
    ln -sfn "silan-viking" "$install_bin/svk"
fi

if [ "$build_desktop" -eq 1 ]; then
    target_app="$install_apps/Silan Context System.app"
    staged_app="$install_apps/.Silan Context System.app.new.$$"
    backup_app="$install_apps/.Silan Context System.app.previous.$$"

    if [ ! -d "$install_apps" ] || [ ! -w "$install_apps" ]; then
        have sudo || die "sudo is required to write $install_apps"
        echo "    sudo is required to install the Desktop app into $install_apps"
        sudo -v
        install_with_sudo=1
    fi

    run_installer mkdir -p "$install_apps"
    # Ask a running copy to quit before replacing its bundle. Failure is
    # harmless when the app is not running or Automation access is denied.
    osascript -e 'tell application "Silan Context System" to quit' \
        >/dev/null 2>&1 || true

    run_installer rm -rf "$staged_app" "$backup_app"
    run_installer ditto "$desktop_app" "$staged_app"
    if [ -d "$target_app" ]; then
        run_installer mv "$target_app" "$backup_app"
    fi
    if ! run_installer mv "$staged_app" "$target_app"; then
        [ ! -d "$backup_app" ] || run_installer mv "$backup_app" "$target_app"
        die "could not activate Desktop bundle; previous app restored"
    fi
    run_installer rm -rf "$backup_app"
    run_installer xattr -dr com.apple.quarantine "$target_app" 2>/dev/null || true
fi

echo
echo "  ✓ Local SDK, CLI, and Desktop deployment complete."
if [ "$build_cli" -eq 1 ]; then
    for command_name in silan svk silan-viking; do
        [ -x "$install_bin/$command_name" ] \
            || die "installed command is missing: $install_bin/$command_name"
        "$install_bin/$command_name" --version
    done
    echo "    CLI:     $install_bin/{silan,svk,silan-viking}"
fi
if [ "$build_desktop" -eq 1 ]; then
    installed_app="$install_apps/Silan Context System.app"
    [ -d "$installed_app" ] || die "installed Desktop app is missing"
    plutil -lint "$installed_app/Contents/Info.plist" >/dev/null
    bundle_version=$(/usr/libexec/PlistBuddy \
        -c 'Print :CFBundleShortVersionString' \
        "$installed_app/Contents/Info.plist")
    echo "    Desktop: $installed_app ($bundle_version)"
    if [ "$open_after_install" -eq 1 ]; then
        open "$installed_app"
    fi
fi

echo
echo "  Try: silan onboard"
