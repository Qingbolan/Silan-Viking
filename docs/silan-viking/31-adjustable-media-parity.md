# Adjustable media parity contract

Reference: Yi-luo-hua/obsidian-adjustable-media 0.7.1, commit
`f344ce1f2da2d059d7b3570a7b01021833ba1d5c`.

The requested scope is every upstream function point. Partial grid support is
not acceptance. Pure upstream modules and regression tests are reused under MIT;
Lexical, media ownership and Tauri integrations remain Desktop adapters.

## Acceptance inventory

- [x] Native `vml` v2 comments; preserve Markdown/wiki embeds, unknown metadata,
      captions and source, reject malformed edits; migrate the prototype format.
- [x] Mixed image/video rows, at most four items, natural aspect-ratio sizing.
- [x] Column dividers, double-click ratio reset, independent row heights,
      individual single-image width, frame width/height/proportional corner resize.
- [x] Free horizontal positioning with magnetic left/center/right snapping.
- [x] In-row, cross-row and cross-layout drag; new-row drops; loose-image drops;
      remove a single item from a layout; dedicated video grip.
- [ ] Whole-layout drag, paragraph insertion, left/right float drop zones,
      line-relative float offset, edge scrolling and cancellation.
- [ ] Left/right text wrapping with ordinary editable document text.
- [x] Editable Markdown on either/both sides; top/center/bottom alignment.
- [ ] Text-only blocks; 1–4 balanced columns, gap, font size, justification,
      block alignment and floating; formatting/list/link/editor keyboard behavior.
- [ ] Captions and alignment; numbered figures/tables/equations; cross-reference
      navigation and English/Chinese numbering.
- [ ] Image viewer: edit double-click/read click, wheel zoom, pan, arrows, close.
- [ ] Source editing/switching; read-only rendering; print/export parity.
- [ ] Image/video and selected-text context menus, source-selection menu,
      commands and configurable shortcuts; merge/unwrap actions.
- [x] Optional automatic multi-media paste/drop conversion, persisted settings.
- [x] Feature examples/working copy and UI language settings. The guide is opened explicitly; no automatic first-use modal.
- [x] Remove all layout comments with concrete preview and confirmation.
- [ ] Local media resolution, rename/move integration, offline operation,
      safe external URLs, no new telemetry or network dependencies.
- [x] One transaction per completed gesture, untouched-content preservation,
      undo/redo, stale edit rejection, no Tauri upload overlay for internal moves.

A checked item requires an implemented entry point and relevant automated
coverage. Native visual acceptance is recorded separately; unavailable browser
access is not evidence of a passing interaction test.

## Delivery evidence — 2026-10-07

- Upstream pure regression suite: 198 tests passed.
- Desktop `npm test`: includes authoring-session batch save and Lexical adapter
  tests. Adapter tests cover both complete upstream guides, exact VML source,
  CRLF, wiki links/embeds, mixed-paragraph extraction, prototype migration,
  malformed metadata retention, cross-layout image/video movement, stale targets
  and single-step undo/redo. Nested/fenced examples remain ordinary Markdown.
- Rust app crate: 255 tests passed across unit/integration suites. Relative/wiki
  asset resolution rejects ambiguous filenames and paths outside public resources.
- Desktop native: 17 tests passed, 1 pre-existing ignored test. Rust formatting
  and app-crate Clippy with warnings denied passed.
- Desktop production build passed. Native pointer/visual acceptance has not run:
  the available browser automation surface was denied by administrator policy.

## Remaining parity acceptance

These are not represented as completed by the checked model/adapter items above:

- Native interaction/rendering checks: line-relative opposite floats, nested
  column typing/history, figure-reference navigation, viewer gestures and the
  detached print/PDF view. Their Desktop entry points exist but need actual UI
  acceptance, including long documents and narrow panes.
- File rename/move link maintenance is an Obsidian host feature, not an upstream
  plugin-owned operation. Desktop resolves current Markdown/wiki paths and retains
  source links, but does not yet provide a workspace-wide resource rename/move
  transaction. External filesystem renames are not automatically repaired.
- UI language coverage is not yet complete for host-owned image/slash menus and
  dynamic cleanup notices; layout controls and the full offline guide are localized.

The prototype has been replaced; this is not yet a claim of fully accepted
one-for-one Desktop parity.

## Interaction correction — direct manipulation

The latest user feedback prioritizes learning the upstream interaction over adding
more visible controls. A single image now uses one continuous drag: positioning
inside its row (when space is available), moving outside the row, and returning
to positioning when it re-enters. Full-width and multi-image rows move directly.
Images no longer require a separate item grip; videos retain theirs so playback
controls stay usable. Moving items show a thumbnail and insertion markers.

Frame controls appear on hover/focus without consuming document height. The top
frame contains only the block grip and source action; merge, unwrap and detailed
settings live in the pointer-positioned context menu. That menu closes on outside
click or Escape. Source/settings/menu are mutually exclusive presentation states.
The full reference guide is available on request rather than opening automatically.

## Ordinary block drop integration

The document block handle now negotiates interior drops with the media layout
owner, in addition to before/after reordering. Image/video paragraphs enter media
rows with insertion markers. Prose, lists and other valid Markdown blocks enter
the left/right text column with a labeled highlight; text-only boxes receive
text in their existing column and can be converted to image-and-text layouts by
a media drop. The top/bottom edge bands retain document reordering.

`MediaBlockDrop` plans source-preserving changes before consuming the original
block. The latest displayed plan is committed on release with both source and
destination checked again. A successful move is one history transaction; stale
or unsupported plans never delete the source. Regression cases exercise blocks
above and below the layout, formatted prose/lists, image rows, text-box conversion,
stale source/destination rejection and undo.

### Layout-to-document extraction

Images can be dragged out to a blue document insertion line; captions travel with the
image. Text-column paragraphs and lists use their block handles to move back into the
article. The outer editor owns both changes as one undo step and rejects stale source.
Removing the final item unwraps remaining prose or removes the empty layout. Layout
vertical padding and outer margins are zero. Regression coverage verifies extraction,
caption/format preservation, stale-source rejection and undo; native gesture acceptance
still requires manual verification in the built Desktop app.

### Text extraction pointer acceptance — 2026-10-07

The nested editor inherited `overflow: hidden` from the document editor shell,
clipping its negative-offset gutter handle. Pointer hits fell through to the image
resize edge. Text-column editor shells now allow gutter overflow and size their
single-button control to its actual width. The document viewport retains clipping.

The isolated production-editor fixture at `desktop/tests/browser/extraction.html`
was exercised through browser pointer input: right-column formatted prose moved
below the layout, the image stayed inside VML, serialized bold markup survived,
and one Undo restored the exact original Markdown. This is browser interaction
acceptance; the native macOS window was not directly automated.

### Column grip discoverability

Editable text columns always expose one grip. Hover selects the paragraph to move;
when not hovering, focus retains the selected paragraph, otherwise the first block
is offered. A 30px internal gutter keeps the grip inside the column and away from
media resize edges and ancestor clipping. The grip has a visible border/background
and an explicit “Move text out of layout” accessible name. Browser pointer testing
confirmed initial visibility and successful formatted-text extraction.

### Drop focus ownership

Document moves and layout extraction select the moved block inside the same
transaction and attach Lexical's `SKIP_SCROLL_INTO_VIEW_TAG`. Extraction callers
must not subsequently call `editor.focus()`: that restores a stale outer-editor
selection or defaults to the document end. Selection and focus are reconciled by
Lexical from the committed drop selection. Browser testing with 60 later paragraphs
confirmed unchanged scroll position, outer-editor focus and a caret at the start
of the extracted prose. Adapter regressions assert selection ownership as well as
source preservation and undo.

### Nested click ownership

The editor host's blank-area mousedown handler formerly recognized targets only
by class name. A nested column root therefore triggered both its own handler and
the outer host's `selectEnd`, scrolling a long article to EOF. Hosts now handle
only targets whose nearest editor is themselves; editable-surface clicks retain
native pointer caret placement. Handled chrome clicks prevent the browser from
subsequently focusing the enclosing non-editable layout. Column editors do not
autofocus when mounted or remounted.

The 60-paragraph fixture reproduced a 2158px jump from clicking the column gutter.
The same click after correction retained column focus and zero scroll. Text clicks,
subsequent extraction and clicking the extracted paragraph were also exercised.
