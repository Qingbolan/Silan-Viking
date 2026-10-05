# Installing Silan CLI

`silan` is the primary command for the Silan Viking research publishing
workspace.
`svk` is its compact alias, while `silan-viking` remains available for
compatibility. All three names execute the same binary.
(Engine developers: use `engine/install-dev.sh` to build from a checkout.)

## Install the current source checkout

From the repository root, the canonical engine-only developer install is:

```sh
./engine/install-dev.sh
```

It resolves the repository build coordinate with `tide mark`, runs the Rust
engine workspace test suite, builds the locked release profile, verifies and atomically
activates the binary, and records the Tide coordinate, source revision, and
binary SHA-256 in `~/.local/state/silan-viking/install-receipt`. Use
`--skip-tests` only for an explicit fast local iteration; a completed change
must run the default checked path.

## One-line install

```sh
# stable (default): the latest GitHub Release
curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Context-System/main/engine/install.sh | sh

# main: a verified source build of the current main branch
curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Context-System/main/engine/install.sh | sh -s -- --channel main
```

The installer has two explicit channels.

**`stable`** (default):

1. detects your OS and CPU architecture (macOS and Linux, Intel and ARM);
2. downloads the matching prebuilt binary and the release's `SHA256SUMS`;
3. refuses to install unless the binary's SHA-256 matches `SHA256SUMS`;
4. atomically installs `silan-viking`, creates the `silan` / `svk` aliases,
   re-checks the installed file's hash, and writes an install receipt.

If the release has no binary for your platform, stable fails and tells you to
use `--channel main`; it never silently switches to a source build.

**`main`** clones the repository at `--ref` (default `main`; a tag or commit
pins it) and runs the documented source installer, `engine/install-dev.sh`:
the full engine test suite, a `Cargo.lock` release build, version and hash
verification, atomic activation, and the receipt. It needs `git`, the Rust
toolchain ([rustup.rs](https://rustup.rs)) and
[TideMark](https://github.com/Qingbolan/TideMark). Use it when you need
features that are on main but not yet in a release — for example Moments and
the Desktop commands described in the tutorials. main is not a release and can
change at any time.

Both channels print what was installed (version, source, SHA-256) and record
it in `~/.local/state/silan-viking/install-receipt`.

### Options

```sh
sh install.sh --help                       # full usage
... | sh -s -- --version v1.0.0            # stable: pin a release tag
... | sh -s -- --channel main --ref <sha>  # main: pin a commit or tag
... | sh -s -- --prefix "$HOME/bin"        # install somewhere other than ~/.local/bin
... | sh -s -- --state-dir DIR             # receipt location
```

Environment equivalents: `SILAN_CHANNEL`, `SILAN_VERSION`, `SILAN_REF`,
`SILAN_INSTALL_DIR`, `SILAN_VIKING_STATE_DIR`.

### Put it on your PATH

If the installer says `~/.local/bin is not on your PATH`, add this to your
shell profile (`~/.zshrc` or `~/.bashrc`) and restart the shell:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

## From zero to validated content

The public `v1.0.0` release can initialize, validate, index, and publish
Markdown-backed content. It uses the earlier `idea` / `update` naming. The
current main branch has since moved `update` to `moment` and added source-only
desktop/onboarding work; those post-release commands require
`install.sh --channel main` (or `engine/install-dev.sh` in a checkout) until a
newer release is published.

```sh
mkdir my-site && cd my-site

silan init                   # scaffold the project — ends by printing
                             # the next steps for you

silan guide                  # "what do I do now?" — re-run this anytime

silan index sync             # build the derived database from content/

silan blog new first-result  # create one private article
silan content lint
silan index sync
```

`init` lays down `content/`, `silan-viking.toml`, and `SCHEMA.md`. The exact
seed types follow the installed release. `guide` reads the project state and
points at the next compatible command.

Add a private article with `silan blog new <slug>`, then re-run
`content lint` and `index sync`. `silan --help` is the authority for the
installed binary's complete command surface.

## Configure a DeepSeek API key

On macOS, let the CLI verify the key with DeepSeek's read-only model-list
endpoint and store it in the current user's Keychain:

```sh
silan credentials deepseek set
silan credentials deepseek status
silan credentials deepseek test
```

`rotate` is an alias for `set`, and `remove` deletes the Keychain entry.
For CI and non-macOS systems, provide `DEEPSEEK_API_KEY`; environment
configuration takes precedence over Keychain storage:

```sh
export DEEPSEEK_API_KEY="<your-api-key>"
silan credentials deepseek test
```

The CLI never writes API keys to `silan-viking.toml`, workspace files, command
arguments, or output.

To review reader-facing Blog prose or a complete episode series for unnatural
phrasing, logical gaps, concept misuse, and odd terminology:

```sh
# All Blog language variants
silan blog language-check --report artifacts/blog-language-audit.json

# Every series, including series metadata and all episode language variants
silan episode series language-check \
  --report artifacts/series-language-audit.json

# One Blog or one series
silan blog language-check <slug>
silan episode series language-check <series>

# Raise or lower the default high-precision confidence threshold (0.80)
silan blog language-check --min-confidence 0.90
```

The default model is `deepseek-v4-flash`. Override it with `--model` or
`SILAN_DEEPSEEK_LANGUAGE_AUDIT_MODEL`. The default minimum confidence is
`0.80`; use `--min-confidence 0` to retain every model candidate. These
commands send the selected authored source to DeepSeek for read-only analysis;
they never modify source files or apply suggestions automatically.

## Uninstalling

```sh
silan uninstall                  # remove the skill + derived files,
                                 # keep your content/
silan uninstall --purge          # also delete content/ and the config
```

`uninstall` prints exactly what it will delete and asks for confirmation
first. It does not delete the `silan-viking` binary itself — remove that by
hand (e.g. `rm ~/.local/bin/silan-viking`).
