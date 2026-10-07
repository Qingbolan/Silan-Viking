# Composition integration fixture

This mounts the production `App`, `AppShell`, Lexical editor and session objects.
Only the Tauri IPC boundary is replaced. Source saves and deployments modify tab
memory; no content repository, AI provider, credential store or server is touched.
The separate Vite configuration is never used by production builds.

Run from the repository root:

```sh
./desktop/node_modules/.bin/vite --config desktop/tests/browser/vite.config.ts --port 5297
```

Open `http://127.0.0.1:5297`. If that port is occupied, choose another free port.
The fixture controls expose saved/deployed/pulled counts and persisted content.
Use **Reset fixture** only in this test origin to clear its local recovery storage.

Final interaction checklist (not yet verified by the agent):

- Adjustable media: insert two images in consecutive paragraphs. Select the
  first, choose **Create media layout**, then **+**. Change column count/alignment;
  resize the outside edge, bottom and column gap. Drag an item grip and verify the
  blue insertion marker, reorder, then undo. Escape during a drag must cancel it
  without starting a file upload. Switch source/rich mode and reopen to confirm
  layout persistence. Unwrap must restore both ordinary images and descriptions.

1. Open sidebar, Blog and Integration article. Edit rich text; switch to source
   mode and back. Verify Markdown, title and text survive and saved count advances.
2. Switch English/Chinese, navigate back/forward, close/reopen the editor. Verify
   each translation retains its own content and no source is overwritten.
3. Arm **Conflict on next save**, edit a translation, and wait for autosave.
   Verify the conflict dialog preserves the draft and displays the external text.
   Exercise **Continue editing**, **Use disk version**, and **Save my draft** on
   separate runs. Verify counters and persisted text match each choice.
4. Arm **Fail next save**, edit, then verify retry and recovery behavior. Reload
   the fixture while a conflict is unresolved and verify the draft is restored
   without silently adopting the newer disk revision.
5. Return to Overview. Opening the deploy confirmation must not increment the
   deployed count. Cancel once; then confirm a second time and verify exactly one
   fake deployment and successful verification.
6. Trigger **Remote ahead** with a clean editor; verify one automatic pull. Repeat
   with an unresolved/dirty editor and verify pulling stays blocked.
7. Open Settings and recovery/capture dialogs; check sidebar hiding, keyboard
   focus, overlay placement and narrow-window behavior.

The fixture builds successfully. Actual browser access is currently blocked by
an unavailable administrator-policy verification in the computer-use tool. A
successful fixture build does not establish that this checklist passed. This
fixture also does not replace native Tauri filesystem/command integration tests.

Scientific Markdown regression (added after the missing-renderer report): the
English fixture now contains inline/display formulas and a Mermaid flowchart.
Verify formulas are typeset with bundled fonts, the flowchart shows A → B, and
both stay intact after source/rich switching, edit, save and reopening. Exercise
`/math` and `/mermaid`; edit their source using the node buttons. Invalid TeX or
Mermaid must show an error while keeping its source editable. Read-only previews
must render the same content without edit buttons. This interaction check is
still pending while browser policy verification is unavailable.

Block interaction regression: hover a paragraph, multiline list, table and
formula; check a single rounded background and the six-dot handle aligned with
the first line. Move blocks before/after one another, then undo/redo and reopen
the document. Scroll and resize with the handle visible; it must stay beside the
block rather than the pane edge. Cancel a drag outside the editor; order must not
change. Verify Alt+Up/Down and Add block below, and ensure the title stays first.
This UI checklist remains unverified because the browser tool's administrator
policy check denied access again during this change.

Tauri-specific correction: block dragging must show the blue insertion line and
must never open the window's upload target. Test release, Escape, outside-editor
release, edge scrolling and touch/pen pointer cancellation. Finder file drags
must still show the upload target. While typing, verify caret height beside body,
heading and inline-code text, toolbar to its right, line-end placement below,
Chinese IME candidate positioning, and toolbar input focus. The earlier headless
move tests do not verify Tauri's native drag interception or browser caret metrics.

Unified table toolbar: click and type in the last row of a wide table. There must
be exactly one toolbar, at the caret side/below when space is constrained, with
Text/Table mode buttons. Move the caret within the same cell and horizontally
scroll the table; it must follow the current selection. Check row/column actions,
multiple-cell selection, and table actions while the general toolbar is hidden.
The separate toolbar above/centered on the current cell must never appear.

`/extraction.html` mounts the production editor with an image/right-text layout
and exposes its current Markdown below. Hover the text, drag its gutter grip below
“After layout”, and verify that only the text leaves the VML comments, bold markup
survives, and one Undo restores the original layout. The nested grip must be visible
and receive pointer input rather than the image resize edge beneath it.

For click/focus regressions use `/extraction.html?long`: scroll the layout into view,
click the text-column gutter below its grip, click text, drag it out, and click it
again. A gutter click must focus only the column; it must not move the outer caret
to the final “Later paragraph 60” or scroll there. Check initial/remounted columns
do not autofocus and steal the containing editor's selection.
