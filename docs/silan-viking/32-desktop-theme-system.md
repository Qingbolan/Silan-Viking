# Desktop theme packages and local resource factories

## Use cases and ownership

The desktop can preview and apply a theme without changing business components.
Settings → Appearance lists built-in Paper/Sand and workspace packages. Preview
updates the whole document, including portals. Apply saves the choice on this
device. Cancel, leaving Appearance, or closing Settings restores the last applied
theme. A failed load or unsupported CSS value leaves the last valid presentation
intact. A newer preview or cancellation invalidates older asynchronous replies.

The author workspace owns editable package files. The resolved project
`content_dir`, rather than a hardcoded `content/`, determines their physical root:

```text
<configured-content-root>/themes/<id>/theme.json
<configured-content-root>/themes/<id>/assets/...
```

These files can be tracked by the private workspace Git repository. They are not
content Items, not agent memory, and not part of public source archives or content
database projections. Production recovery cannot recover local themes. The
existing public-source archive allowlist remains unchanged.

## Package contract, schema 1

`desktop/src/theme/token-contract.json` is the versioned token contract. Each key
names a CSS property used to validate that token after reference expansion.
`paper.json` and `sand.json` are complete independent packages. A package has
exactly `schema_version`, `id`, `name`, `appearance`, and `tokens` fields:

- `schema_version`: integer `1`; incompatible versions are rejected.
- `id`: lowercase ASCII letter followed by lowercase letters, digits or hyphens;
  it must match the directory/address. Built-in `paper` and `sand` are reserved by
  their source registrations; collisions fail explicitly rather than shadowing.
- `name`: nonempty display name, at most 100 characters.
- `appearance`: `light` or `dark`, used for native form-control color scheme and
  existing `.dark` selectors. It does not synthesize or invert a palette.
- `tokens`: the complete contract, without extra keys. Start by copying a built-in
  package, change its id/name, then edit values. Partial themes are rejected.

The `--ds-*` tokens own shared semantic colors, typography, spacing, radius,
motion and elevation. `--component-*` tokens own existing component treatments
such as sidebar contrast, selection, startup material, overlays and editor chrome.
This keeps current defaults while making those treatments configurable. Component
CSS retains selectors, responsive layout and interaction geometry. Legacy
`--ink`, `--paper` and `--color-*` definitions and consumers have been migrated to
the semantic contract, rather than retaining a second palette or alias layer.
Media content, logo artwork and CSS mask geometry are not recolored.

Tokens may reference other contract tokens with `var(--name)`. References are
expanded before property validation; unknown references, cycles, fallback syntax,
oversized expansions, arbitrary URLs and CSS rule injection are rejected. A theme
cannot ship JavaScript or arbitrary selectors. Font-family tokens can select
installed fonts; schema 1 does not execute stylesheets or install fonts.

To create a theme, copy `desktop/src/theme/paper.json` to the path above, set its
id to the directory name, and choose Refresh themes in Appearance. This requires
no component changes, Tailwind rebuild, or new factory registration. The package
is read again on every preview, so edits can be tested before applying.

## Addressing

```text
silan://themes/my-theme
silan://themes/my-theme/theme.json
silan://themes/my-theme/assets/body.woff2
```

The first two addresses refer to the same package. Appearance accepts either and
stores the canonical package URI. The Tauri `silan` resource protocol also serves
package files. Assets are limited to local WOFF/WOFF2 fonts and PNG/JPEG/WebP/AVIF/
GIF images under `assets/`; serving an asset does not automatically apply it.
Encoded paths, queries, dot segments, unexpected file types and symlinks escaping
a package are rejected. The themes root itself cannot redirect to another tree.
Manifest reads are limited to 128 KiB.

This is in-process resource addressing. It does not register an operating-system
URL launcher, and clicking an external link does not silently apply a theme.
Existing content CLI/MCP workflows remain content workflows.

## Factories and composition

Two registries have different responsibilities:

1. `ThemeRegistry<Context>` registers **source factory functions** by source id.
   Construction validates unique registrations and snapshots the registration
   list. `create(context)` invokes each factory once per catalog. Each catalog
   owns its source instances and URI-to-source bindings. Discovery joins concurrent
   callers, refreshes explicitly, and rejects duplicate URIs before replacing its
   current bindings. Components never resolve dependencies from a global container.
2. Rust `LocalResourceRegistry` registers **resource source factory functions** by
   typed `Namespace`. The Tauri composition root registers media and themes once.
   Every resolution gives the selected factory the current workspace root; it
   cannot accidentally retain the workspace that was active at app launch.
   Agent memory is not registered as a webview resource source.

Frontend factories are assembled in `desktop/src/theme/composition.ts`; the
native factories are assembled in `desktop/src-tauri/src/main.rs`. Registries do
not self-register, instantiate products on import, overwrite duplicates, or
select implementations through theme-name conditionals. Adding a different theme
storage provider means registering another factory implementing `ThemeSource`;
adding another theme file to the existing workspace source needs no code change.

`ThemeDefinition` owns package and reference validation. `ThemeSession` owns the
preview transaction and persisted selection. `DocumentThemeProjection` owns CSS
property validation and replaces one complete stylesheet after validation.
`ThemeProvider` is only the React subscription adapter. `ThemeSettings` renders
state and sends actions. Rust `ThemeRepository` owns file addressing and bounded
reads; Tauri commands only adapt input/output.

## Lifecycle

```text
ready / previewing / failed --preview--> loading
loading --valid current reply--> previewing
loading --invalid current reply--> failed (presentation retained)
previewing --apply + successful persistence--> ready (new baseline)
previewing --failed persistence--> failed (old baseline retained)
any --cancel--> ready (restore baseline; invalidate pending replies)
```

Startup restoration is a read-only load of the saved choice. It cannot commit a
newer user preview and does not rewrite preferences. Discovery refresh changes
the catalog, not the displayed theme. Browser preview has only built-in sources;
a native workspace adds its file source. Native onboarding with no workspace
selected legitimately has no workspace theme packages.

## Verification

Automated coverage includes factory isolation and collisions; transient preview,
apply and cancel; stale asynchronous replies; restoration versus user actions;
invalid schema/token/reference graphs; URI canonicalization and identity; bounded
file reads; symlink and private-tree isolation; registered namespace dispatch;
workspace switching; and exclusion from public source snapshots.

Run `npm --prefix desktop test`, `npm --prefix desktop run build`, the Rust
workspace fmt/clippy/test matrix, and `cargo test --manifest-path
desktop/src-tauri/Cargo.toml`. Browser checks should cover switching Paper/Sand,
cancellation, application, reload restoration, invalid addresses, and leaving
Appearance with a preview active. Native file packages use the same session and
validation path as built-ins, with a separately tested Rust filesystem boundary.

Executed on 2026-10-07:

- `npm --prefix desktop ci`, the full desktop `npm test` suite, and production
  `npm run build`; the final theme suite has 15 passing cases.
- Rust workspace formatting, Clippy with `-D warnings`, and locked workspace tests.
- Tauri tests: 15 unit tests and 2 architecture tests passed; the existing live
  credential/network test remains ignored.
- Browser checks against the production build: Paper/Sand selection, cancel,
  apply, reload restoration, invalid-address rejection with the current theme
  retained, and automatic cancellation when leaving Appearance. The final layout
  was also inspected visually.

The source checkout has no configured content directory, so a native development
launch could not open this workspace. Browser validation used a loopback static
server and no author content. Native filesystem/command boundaries were validated
by Rust tests; the installed desktop application was not replaced.

## Device-local sidebar appearance

Appearance settings separately customize the editor Files rail and workspace navigation.
SidebarAppearance owns the closed, validated data contract; SidebarProjection owns scoped
CSS; ThemeSession owns their shared preview/apply/cancel transaction with the theme.
Overrides are saved together with the theme address in the versioned
`silan.desktop.appearance` record. The previous URI-only preference is migrated once.
Reset removes one sidebar override and restores its theme-defined styling.

Controls include background/text/selection/hover/card/border colors, radius, text size,
row spacing, border width, and an optional local PNG/JPEG/WebP background (maximum 1 MiB).
Images are signature-checked and decoded before preview. Fit, position and shading are
configurable. Images stay in device storage; they are not copied into public content.
Storage failures preserve the applied baseline. Pending theme loads and image reads
cannot overwrite newer edits or cancellation.

Validation for this extension: desktop full npm tests, production build, and browser
settings control/preview/cancel checks. Native installed application was not replaced.
