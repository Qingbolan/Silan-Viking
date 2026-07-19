# Installing Silan CLI

`silan` is the primary command for the Silan personal website content engine.
`svk` is its compact alias, while `silan-viking` remains available for
compatibility. All three names execute the same binary.
(Engine developers: use `engine/install-dev.sh` to build from a checkout.)

## One-line install

```sh
curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Personal-Website/main/engine/install.sh | sh
```

This:

1. detects your OS and CPU architecture (macOS and Linux, Intel and ARM);
2. downloads the matching prebuilt binary from the project's GitHub Releases;
3. installs `silan-viking` and creates the `silan` / `svk` aliases;
4. tells you the next command to run.

If no prebuilt binary exists for your platform (or no release is published
yet), the script **falls back to building from source** with `cargo` — that
path needs the Rust toolchain ([rustup.rs](https://rustup.rs)).

### Options

The installer reads two environment variables:

```sh
# install somewhere other than ~/.local/bin
curl -fsSL .../install.sh | SILAN_INSTALL_DIR="$HOME/bin" sh

# pin a specific release tag instead of the latest
curl -fsSL .../install.sh | SILAN_VERSION="v0.1.0" sh
```

### Put it on your PATH

If the installer says `~/.local/bin is not on your PATH`, add this to your
shell profile (`~/.zshrc` or `~/.bashrc`) and restart the shell:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

## From-zero to a running site

Once `silan` is on your PATH, it walks you through the rest — you
never have to memorise the command surface. The key command is **`guide`**:
run it any time and it tells you the next step for wherever your project is.

```sh
mkdir my-site && cd my-site

silan init                   # scaffold the project — ends by printing
                             # the next steps for you

silan guide                  # "what do I do now?" — re-run this anytime

silan index sync             # build the derived database from content/

silan site preview           # build the site and preview it locally
```

`init` lays down `content/` (six content types + three seed items), a
`silan-viking.toml` config, and a `SCHEMA.md`. From there `guide` reads the
project state and points you at the right next command — before `index sync`
it tells you to sync, after syncing it points at `site preview` and
`site deploy`.

Add content with the per-type commands — `silan blog new <slug>`,
`silan project new <slug>`, `silan idea new <slug>` — then
re-run `index sync`. `silan --help` lists everything.

## Uninstalling

```sh
silan uninstall                  # remove the skill + derived files,
                                 # keep your content/
silan uninstall --purge          # also delete content/ and the config
```

`uninstall` prints exactly what it will delete and asks for confirmation
first. It does not delete the `silan-viking` binary itself — remove that by
hand (e.g. `rm ~/.local/bin/silan-viking`).
