# Application composition refactor

## Objective and acceptance scope

Preserve authoring, editing, media, AI, synchronization and deployment behavior
while improving object ownership, assembly cost, and extension consistency.
Public CLI commands, Tauri command names/DTOs, MarkdownEditor props, and existing
engine constructors remain compatible. Content stays the editable source; no
production deployment or private content modification is part of this refactor.

This work is in progress. Passing the first batch of checks does not establish
completion of the whole refactor.

## Implemented

- Editor nodes, extensions, commands and components consume one priority-ordered
  registry. Collections are compiled once rather than allocated on each read.
  Command collision rules have one implementation. Host-command changes do not
  recreate the Lexical document extension.
- `WorkspaceServices` owns one operation-scoped `Arc<Workspace>` and constructs
  typed use cases. Nested authoring services share schema/parser/mapper state.
  Public standalone constructors still work. Source text is never cached here.
- Tauri delivery operations live in `application/delivery.rs::DesktopDelivery`.
  They construct only the engine delivery use case, not the full editing/media/
  analytics graph. Their public commands and DTO mappings are preserved.
- The engine OOP document and editor README describe these ownership boundaries.

## Remaining scope

1. Desktop delivery orchestration is now extracted and covered by deterministic
   lifecycle/concurrency tests. Browser/native interaction verification is still
   required in the final end-to-end gate.
2. Editing-session and app-shell extraction is implemented. Final interaction
   verification must still cover source mode, recovery, conflict dialogs,
   navigation, translations and modal placement with the real React components.
3. AI construction/configuration/transport responsibilities are separated and
   tested, including connection reuse and request credential isolation. The
   existing configured capability and standalone constructor contracts remain.
4. Tauri delivery, shared Workspace assembly and AI modules have been organized
   around their use-case owners; the migrated implementations are removed. The
   separate closed Parser/Mapper registries remain. No dynamic plugin loader or
   string-based service locator was introduced.
5. Complete end-to-end UI verification and performance checks after the remaining
   changes. Re-run affected full validation matrices; audit the full scope above
   before marking the goal complete.

## Evidence for the first batch (2026-10-06)

Executed successfully:

- `npm --prefix desktop ci`
- `npm --prefix desktop test` (includes new plugin ordering/collision/snapshot tests)
- `npm --prefix desktop run build`
- `cargo test --manifest-path engine/Cargo.toml --workspace --locked`
- `cargo test --manifest-path engine/Cargo.toml -p silan-viking-app workspace::services --locked`
- `cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings`
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`

Added regression cases prove that an opened factory does not re-read a changed
Schema during assembly, existing editors observe source changes on disk, and
opening the delivery adapter does not create the projection database. Existing
Tauri command-surface and schema-boundary tests still pass. One pre-existing
native test is ignored; browser UI verification has not yet been performed.

Synthetic assembly measurement:

```sh
cargo run --manifest-path engine/Cargo.toml -p silan-viking-app --example workspace_assembly --locked
```

On this machine's debug build, 300 assemblies of eight use cases took 10652.87 ms
with independent constructors and 1326.53 ms through shared assembly (~87.5%
less time). Both modes use the current code and the same fixture Schema. This
measures construction only, not whole-app speed, disk scanning, or network work.


## Delivery session batch (2026-10-06)

`desktop/src/app/delivery/DeliverySession.ts` now owns the operation state machine,
plan/status snapshots, shared in-flight reads, automatic-pull deduplication and
retry policy. `useDeliverySession.ts` binds the typed port to Tauri, subscribes
React, and starts/stops polling timers. App retains confirmation and presentation.
The former parallel state flags, polling body, and orchestration callbacks were
removed from App; the existing deployment-readiness policy remains authoritative.

Nine new deterministic tests cover shared requests, silent retries/backoff,
manual refresh joining polling, duplicate deployment rejection, failed verify,
stale status/plan replies after pull, dirty-buffer/automatic-pull guards, blocked
mutations during reload, and failed-deploy retry. Two concurrent status readers
now invoke one backend query instead of two; this is an operation-count result,
not a whole-app latency claim. Public Tauri command-surface tests pass with the
new hook and adapter locations.

This batch preserves the remaining scope above, including editing-session and AI
work. It does not constitute completion of the goal.


## Authoring and AI batch (2026-10-06)

`EditorSession` is the sole in-memory document/dirty/baseline owner and owns the
serialized save lifecycle. App's duplicate state/ref stores and save loop have
been removed. Source reload uses an ID index instead of repeatedly flattening
and scanning all translations. `AppShell` owns window/main/overlay placement with
presentation slots; feature callbacks stay outside the layout component.

Seven new editor-session tests cover draft/revision recovery, deleted-source
drafts, editing during I/O, queued settings revision handoff, conflict blocking,
retry, storage failure and settings-conflict/queued-Markdown ordering. The latter
now publishes a conflict before the shared queue releases the next write.

The `ai_engine` directory separates configuration, wire contracts and typed HTTP
assembly. Existing public exports and provider constructors remain. Per-policy
connection pools preserve prior timeouts/redirect rules and hold no credentials
or endpoint configuration. Local HTTP tests prove two requests reuse one socket
and a later request does not inherit Authorization. Configured redirects remain
disabled. No external AI requests were made.

Executed: full Desktop tests/build, Rust workspace tests, workspace Clippy with
warnings denied, and native Tauri tests. The layout initially exposed an optional
style typing mismatch; it was fixed to retain the original optional DOM style
contract before the successful build. End-to-end browser/native interaction
verification and final scope audit remain outstanding.


## Final audit in progress (2026-10-06)

| Requirement | Current evidence | Status |
| --- | --- | --- |
| One editor plugin composition path | Registry is the only collector; ordering, collision and snapshot tests; Lexical round-trip suite | Implemented, automated checks passed |
| Explicit use-case construction | WorkspaceServices and standalone constructors; snapshot/live-source tests | Implemented, automated checks passed |
| Reduce assembly overhead | Reproducible 300-assembly benchmark; 10652.87 ms independent vs 1326.53 ms shared in debug | Proven for assembly only |
| Delivery ownership and lifecycle | DeliverySession + DesktopDelivery; ten race/failure tests; unchanged Tauri command contract | Implemented, automated checks passed |
| Editing ownership and lifecycle | EditorSession; eight draft/recovery/concurrency tests; existing autosave/review/translation suites | Implemented, automated checks passed |
| App shell layout responsibility | AppShell; two DOM ownership checks; production build | Implemented; actual visual/interaction verification missing |
| AI construction and request isolation | configuration/client/transport modules; HTTP keep-alive and header isolation tests; configured endpoint tests | Implemented, automated checks passed |
| Preserve CLI/native interfaces | Rust workspace tests and native command-surface checks; existing engine constructors retained | Automated checks passed |
| Remove migrated paths | Old AI monolith removed; App save/polling implementations removed; no extra runtime plugin compatibility path | Source audit passed |
| Documentation | OOP document, technical overview, feature READMEs, this audit and fixture checklist | Updated |
| Real UI interaction and native visual parity | Separate browser fixture builds, but computer-use browser access was denied | **Not verified; completion blocked on this gate** |

During the audit, two extra edge cases were fixed and tested: failed pull now
refreshes an invalidated loading plan; late disk reads cannot reopen a resolved
conflict or replace a newer one. These bring the deterministic session coverage
to ten delivery and eight editor cases.

The browser tool was attempted twice in this goal turn on the local fixture URL.
Both calls reported: "The admin-enforced policy could not be verified, so access
was not granted." No alternate browser, native UI route or browser automation
technology was used to bypass this denial. The overall objective remains unfinished. Unit tests and fixture compilation
are not substitutes for the UI gate.

The fixture and exact remaining interaction checklist are in
`desktop/tests/browser/README.md`. It uses production React components and a
memory-only Tauri IPC fixture; no private content, paid AI or real deployment is
accessed. The current changes are uncommitted. No production deployment, installed
app replacement or private content edits were performed.

## Scientific editor regression correction (2026-10-06)

The owner's Desktop screenshot exposed a gap in the prior compatibility evidence:
LaTeX and Mermaid had no registered grammar/rendering nodes or runtime dependencies.
The prior ordinary-Markdown tests did not cover scientific content and cannot prove
full editor parity.

The editor now composes ScientificMarkdownExtension for both editable and read-only
use. It recognizes dollar and backslash TeX delimiters, preserves source through
Markdown/JSON, and renders with KaTeX. Mermaid fences own their source and lazily
render through Mermaid with strict security. Ordinary code fences retain their
existing importer. Source positions are preserved by tokenization rather than
regex rewriting; slash commands expose insertion of formulas and diagrams.

New regression checks reproduce the screenshot's boxed formula and verify actual
KaTeX HTML/MathML, error/source retention, safe rendering, Mermaid source edits,
JSON recovery and Markdown round trips. Desktop full tests, TypeScript/Vite build
and native tests passed. Browser/native interaction evidence is still outstanding;
this correction does not mark the larger goal complete.

## Block interaction correction (2026-10-06)

Replaced the independent selection-marker and draggable-block adapters with
BlockInteractionPlugin and the DocumentBlocks model operations. A single rounded
background identifies the hovered block (or focused selected block). Controls
are measured beside its first line and remain inside the clipped pane; the old
negative fixed offset and vertical selection stripe were removed. Pointer dragging
moves complete Lexical blocks, preserves the title slot, and supports undo/redo
and keyboard ordering. Gutter hit testing uses binary search rather than a full
layout scan for every pointer movement.

Headless Lexical tests verify list and decorator moves, exported Markdown order,
unchanged title position, stale/no-op targets, and undo/redo. Full Desktop tests
and production build passed. The browser tool again refused UI access because
administrator policy verification was unavailable; visual and drag interaction
acceptance remains outstanding. No running app was replaced.

## Native drag and typing chrome correction (2026-10-06)

Owner feedback showed that HTML block dragging entered Tauri's window file-drop
channel, bypassing the editor's intended drop feedback. Block dragging now uses
pointer capture with a local lifecycle and insertion line. App, CaptureSheet and
ContentLibrary share NativeFileDragSession so orphan/empty native drag events
cannot activate upload targets. Real file drops keep their existing import path.

The typing toolbar now follows measured caret coordinates instead of the page
header. The visual caret uses the adjacent text's computed font size, restoring
the system caret during IME composition. Overlay header-inset calculation ignores
the caret toolbar. New tests cover native-file session transitions and toolbar
edge placement alongside the existing block-order/undo tests. Runtime pointer,
IME and visual acceptance still require the native app; automated checks are not
a claim of that acceptance.

## Single table/text toolbar correction (2026-10-06)

The next screenshot exposed a second independent toolbar: TableToolbarPlugin
still centered its own surface above the selected cell while only the general
formatting toolbar had moved to caret geometry. Removed that plugin and its
floating-container CSS. TableToolbarActions now contributes commands to the one
FormattingToolbar surface, with Text/Table mode buttons and shared caret tracking.
Multi-cell selections anchor at the focused cell edge; no fake text caret is drawn.

A rendered-component contract test checks exactly one toolbar, caret placement,
retained row/column controls, contextual availability when the general toolbar is
hidden, and absence of the old table overlay. Full Desktop tests and Desktop
bundle build passed. The browser policy check again denied access; this component
contract test is not live visual acceptance. The running application was not quit.
