# Lexical Markdown editor

The editor has one runtime model: the Lexical syntax tree. Markdown is the
persistence and interoperability boundary, not a second editor state.

## Architecture

```text
editor/
  model/         syntax-tree schema, Markdown import/export, selection values
  interaction/   editor-facing controllers and deterministic geometry
  plugins/       React adapters and contextual UI
  extensionPoints.ts
```

- `model/MarkdownDocument.tsx` owns the document schema and Markdown boundary.
  CommonMark, GFM, HTML, shortcuts, code, auto-linking, list indentation, and
  tables use official Lexical extensions. Transient review marks are explicit
  syntax-tree nodes.
- `model/MarkdownImage.tsx` owns the image node, DOM/Markdown codecs, and the
  `loading -> ready | error` rendering lifecycle. Image metadata is mutated on
  the Lexical node; the rendered `<img>` is never treated as editor state.
- `model/MarkdownSourceProjection.ts` parses source text with the compiled
  `MdastImportExtension` registry from the owning editor. Its styled character
  ranges come from mdast source positions, so headings, GFM constructs, HTML,
  tables, links, code, and images cannot drift into a second regex grammar.
  Clipboard Markdown classification uses the same projection instead of a
  parallel marker heuristic.
- `model/MarkdownTable.ts` keeps column alignment as public table semantics.
  The official GFM tokenizer and Lexical table nodes remain authoritative;
  row/column mutations shift the same alignment state exported to Markdown.
- `interaction/FormattingController.ts` and
  `interaction/TableEditingController.ts` are the only owners of structural
  formatting and table mutations. UI plugins call their semantic operations;
  they do not edit the DOM.
- `interaction/EditorShortcutController.ts` maps Typora-compatible authoring
  gestures to semantic editor commands. Clipboard reads and assistant actions
  restore an immutable selection value with compare-and-set semantics, so an
  asynchronous result cannot mutate a newer document state.
- `interaction/ImageEditingController.ts` owns image selection, insertion,
  replacement, removal, and clipboard serialization. `ImageEditingPlugin`
  adapts those operations to click, keyboard, picker, and paste gestures.
- `interaction/OverlayPositionController.ts` owns the explicit
  `idle -> measuring -> anchored -> disposed` lifecycle for selection and table
  overlays. All contextual tools use the editor canvas as their coordinate
  system and measure the mounted main toolbar instead of duplicating a fixed
  top inset.
- `plugins/` adapts the controllers to React. Toolbar, selection bubble, table
  tools, slash commands, Markdown paste, keyboard commands, code highlighting,
  block drag, and review annotations remain independently mounted capabilities.
- `extensionPoints.ts` is the public contribution boundary for application
  nodes, extensions, React components, and slash commands. Its registry compiles
  these collections once in stable priority order. Document construction and
  the React host consume that same snapshot; neither reinterprets raw plugins.
  Built-in, plugin, and host slash commands use the registry's shared collision
  validator. Changing host commands does not rebuild the document extension.
- `MarkdownEditor.tsx` is the composition root. It owns the
  `creating -> ready` lifecycle, controlled-value synchronization, mode
  transitions, and the public imperative handle.

## Persistence invariants

Source mode is a Markdown projection of the same tree. Each source edit is
parsed with `SOURCE_TREE_SYNC_TAG`; the update listener ignores that tag to
avoid echo writes. Underline, which has no CommonMark token, round-trips as a
minimal semantic `<u>` HTML island. Review marks are transient
`ReviewTextNode`s and export as ordinary text.

While source mode is active, the source string owns writes and the Lexical
tree is its continuously parsed semantic projection. Tree-side decoration
updates never serialize back over literal source spelling. A transparent
textarea owns input, selection, caret, and IME; an inert mdast-derived layer
owns syntax color. Both layers share one typography and scrolling contract.

Blog hosts additionally bind rich text, source, and workspace preview to one
editor measure and a 28px baseline. Capture may change the available measure,
but source and rich text retain the same line box so mode changes do not shift
the document vertically.

## Image and clipboard invariants

An image follows `idle -> selected -> editing | replacing | copying`, while an
import follows `idle -> importing -> inserted | queued | error`. In a persisted
document, files are imported before nodes receive their stable media URI. In a
new capture, image files are queued with a visible removable preview until the
draft has an identity and can own media assets.

Copy emits HTML, Markdown, and plain text; the explicit image copy action also
includes the fetched image binary when the platform allows it. Pasting copied
editor Markdown reuses the existing URI, while an image-only OS clipboard
(such as a screenshot) goes through the application media importer. This keeps
document structure and file ownership separate without duplicate import paths.

## Heading hygiene

MarkdownHygiene removes nonsemantic whitespace artifacts in heading text at the
import/export boundary. Source mode preserves keystrokes and cleans on blur or
explicit Markdown retrieval. Code, link destinations, body hard breaks, and
meaningful Unicode such as joiners remain untouched. Regression coverage lives
in scripts/verify-lexical-editor.ts. Public readers separately compare rendered
heading text against page titles, so existing published source needs no rewrite.

## Scientific Markdown

`ScientificMarkdownExtension` is a built-in document extension shared by editable
and read-only editors. It contributes math tokenization/import/export and a
source-owning decorator; `ScientificMarkdownSyntax` owns the Markdown grammar.
Supported formulas: `$...$`, `$$` display blocks, `\(...\)` and `\[...\]`.
Backslash delimiters are tokenized before CommonMark escapes, without rewriting
source offsets or parsing code spans/fences as mathematics. Mermaid fenced code
becomes a diagram node; ordinary code keeps the official Lexical code importer.

KaTeX renders formulas with trust disabled and local bundled fonts. Mermaid loads
on demand, uses strict rendering, and debounces source edits. Rendering failures
leave the source intact and expose an error plus the source editor. `/math` and
`/mermaid` insert editable examples; source mode supports the same grammar.

`npm run test:lexical-editor` covers the reported boxed-formula example, all four
math delimiters, Markdown/JSON round trips, diagram source edits, code shielding,
source positions and KaTeX output/error handling. These are automated parsing and
rendering-contract checks, not an assertion that native UI interaction passed.

## Block interaction

`BlockInteractionPlugin` owns the current-block background, hover handle geometry
and drag lifecycle. Hover takes precedence over the focused selection, so exactly
one root-level block is marked. The handle follows the first line's measured
position inside the editor gutter, including scrolling and resizing; a reserved
lane keeps it reachable in clipped/narrow editor panes.

`DocumentBlocks` owns selection resolution and legal moves. Paragraphs, complete
lists/quotes/tables and scientific decorators move by Lexical node identity,
without reparsing or slicing Markdown. The document title stays first. Each move
is an undoable operation; Alt+Up/Down on the handle provides keyboard reordering.
The previous independent active-block and draggable-block plugins were removed.

Block moves use pointer capture (`idle → pressed → dragging → idle`) with a
movement threshold, blue insertion line, edge scrolling, and cancellation on
Escape/pointer cancel/window blur. They never start HTML/native drag-and-drop,
which Tauri can intercept as a file upload. NativeFileDragSession separately
requires actual file paths before any window upload target becomes active.

CaretGeometry/useCaretChrome measure the focused text's font size and selection
rectangle for the visual caret and typing toolbar. Controls sit to the caret's
right and fall below only when the pane has insufficient room. IME composition
uses the system caret; image/node selections and blurred editors have no custom
caret. A floating toolbar does not reserve a header inset for other overlays.

Table actions are contributed by `TableToolbarActions` to the single
`FormattingToolbar` surface, with Text/Table mode buttons. The former
cell-centered TableToolbarPlugin and its floating-container CSS were removed.
Table context remains available when the general formatting toolbar preference
is off. Cursor movement inside the same cell uses the shared caret measurements,
not cell-key changes. Multi-cell selections use the focused cell edge without
inventing a text caret. Row/column/alignment/delete commands retain their existing
TableEditingController owner.

## Adjustable media

The built-in `silan/adjustable-media` extension stores upstream `vml` v2 comments,
ordinary Markdown/wiki embeds and column text. The pinned upstream format,
immutable model, edit planner, geometry, reference numbering and regression tests
are reused under MIT in `media/upstream`. See that directory's attribution and
`docs/silan-viking/31-adjustable-media-parity.md` for the acceptance inventory.

`MediaLayoutDocument` owns parsing and source-preserving model edits.
`MediaLayoutNode` owns Lexical persistence. `MediaLayoutController` owns atomic
wrap, split, move, join, unwrap and compare-and-set writes. Pointer gesture hooks
own previews and cancellation; the model changes once on release. The old
`silan-media` prototype is migrated on import and never emitted again.

The renderer handles mixed media rows, editable text columns, text-only blocks,
float wrapping, captions and a fullscreen image viewer. Shared root references
number figures, tables and equations across nested column editors. Settings,
selection menus, slash commands and an offline copy of both upstream guides
provide entry points. `MediaEnvironment` resolves document-relative and wiki
media through the existing Rust media-library owner. Workspace cleanup previews
concrete documents and uses EditorSession's serialized revision-checked saves.

Desktop readers share the renderer without mutation controls. Public website
layout rendering is outside this Desktop task. The parity contract records
remaining host integration and native visual acceptance separately; compilation
and upstream model tests alone do not prove interaction parity.

Layout extraction is owned by `MediaLayoutExtraction`: image drags and nested-column
block handles dispatch to the outer editor, which removes the exact source and inserts
ordinary Markdown blocks in one undoable transaction. Column offsets use the same
Markdown parser registry as the editor. Stale source snapshots are rejected. Layout
containers have zero vertical padding/margin; only spacing between media rows remains.
