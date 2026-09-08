# Desktop Markdown autosave

New Markdown editing surfaces must default to automatic local persistence; do not
introduce a required manual Save step. Reuse the write-ordering and draft-preservation
contract below.

Markdown drafts belong to the application workspace, independent of the open
editor or selected language. Edits transition from clean to pending, then saving,
then clean or failed. Typing during saving leaves a newer pending draft. Failed
writes retain the draft, expose the error, and retry after five seconds.

After 650 ms without edits, Desktop saves pending Markdown translations. A single
write queue serializes Markdown and content settings. Settings first flush pending
Markdown and then use the returned source revision. Server responses advance the
revision while preserving newer local bodies and titles. Refresh also preserves
pending drafts that arrived while the source listing was being read.

Content settings (including selected covers and local publishing metadata) use the
same debounce, with a submitted baseline separate from the current draft. Closing
the content editor, changing the top language control, losing window focus, and
requesting native window close flush pending work. A native close is cancelled
when saving fails. This is local source persistence; production deployment remains
an explicit action. Force termination cannot run the close handler.

The UI reports pending, saving, saved, or failed/retrying instead of requiring a
Save Markdown or Save settings button. Existing Cmd/Ctrl+S remains a flush shortcut.

Run `npm test` and `npm run build` in `desktop`, plus the desktop Cargo tests.
`autosaveQueue.test.mjs` covers write ordering, recovery after a write failure,
and retaining concurrent edits while adopting persisted revisions.

## Source conflicts and close recovery

A source revision conflict pauses automatic retries until the writer explicitly
chooses the disk version or rebases the local draft against the reviewed revision.
Refresh is read-only and independent of a successful save. Pending drafts retain
the revision they were based on, so a refresh cannot silently authorize overwriting
an external update. Disk reads and writes run on the background command executor.

EditorRecovery keeps per-translation Markdown copies and per-content settings
copies in device-local WebView storage, separate from canonical source and
publication. Drafts are checkpointed on edit and before closing. Successful saves
remove only the matching recovery copy; a late settings acknowledgement cannot
remove newer edits. Existing source identities restore their pending drafts on
load; Local recovery copies also enumerates orphaned records after source removal.
Storage errors are surfaced and block a close that would claim a copy was retained.

Closing the editor overlay keeps workspace drafts and does not require successful
source persistence. Native close waits at most five seconds for source save, then
offers continuing to edit or closing with a recovery copy. Timing out the UI wait
never releases the write queue or cancels an in-flight mutation. Source conflicts
are resolved explicitly before pending source writes resume.

This recovery facility applies to this editor build; it cannot retroactively
capture drafts from an already-running older binary. Preserve those drafts before
replacing or force-quitting an older app.
