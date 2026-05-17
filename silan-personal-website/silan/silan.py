#!/usr/bin/env python3
"""
silan — thin forwarding shell.

The Python `silan` CLI has been retired. All content-management logic
now lives in the Rust engine, exposed by the `silan-viking` binary
(see `engine/crates/silan-viking-cli`). This module is the only thing
left of the old `silan` package: an entry-point shim that forwards
every invocation, verbatim, to `silan-viking`.

Why keep a Python shim at all instead of deleting the package:
`silan` is installed on a number of machines and is referenced by the
`silan-blog` skill. Keeping the command name working — as a transparent
pass-through — means nothing downstream breaks while the Rust binary
becomes the single source of truth.

This file has no third-party dependencies on purpose: it must keep
working even in a Python environment where the old `click` / `rich` /
`sqlalchemy` stack was never installed or was uninstalled.
"""

import os
import shutil
import sys

# Canonical name of the Rust binary this shim forwards to.
_BINARY = "silan-viking"

# Fallback locations probed when `silan-viking` is not on PATH. Ordered
# most-specific first. `~` is expanded at lookup time.
_FALLBACK_PATHS = (
    "~/.local/bin/silan-viking",
    "~/.cargo/bin/silan-viking",
    "/usr/local/bin/silan-viking",
    "/opt/homebrew/bin/silan-viking",
)


def _resolve_binary():
    """Return an absolute path to the `silan-viking` binary.

    Tries PATH first (the normal install case), then a small set of
    well-known locations. Exits with a clear, actionable message if the
    binary cannot be found anywhere — a missing engine is a setup error,
    not something to paper over.
    """
    found = shutil.which(_BINARY)
    if found:
        return found

    for candidate in _FALLBACK_PATHS:
        expanded = os.path.expanduser(candidate)
        if os.path.isfile(expanded) and os.access(expanded, os.X_OK):
            return expanded

    sys.stderr.write(
        "error: the 'silan-viking' engine binary was not found.\n"
        "       The Python 'silan' command is now a thin wrapper around it.\n"
        "       Build and install the engine:\n"
        "           cd engine && cargo install --path crates/silan-viking-cli\n"
        "       or put the built binary on your PATH.\n"
    )
    raise SystemExit(127)


def cli():
    """Entry point registered as the `silan` / `silan-db-tools` command.

    Forwards all arguments to `silan-viking` and replaces the current
    process with it (`os.execv`), so signal handling, exit codes, and
    stdio behave exactly as if the user had called `silan-viking`
    directly — there is no Python process left wrapping it.
    """
    binary = _resolve_binary()
    argv = [binary, *sys.argv[1:]]
    try:
        os.execv(binary, argv)
    except OSError as exc:  # pragma: no cover - exec failure is rare
        sys.stderr.write(f"error: failed to launch '{binary}': {exc}\n")
        raise SystemExit(126)


if __name__ == "__main__":
    cli()
