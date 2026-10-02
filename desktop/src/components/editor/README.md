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
  nodes, extensions, React components, and slash commands.
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
