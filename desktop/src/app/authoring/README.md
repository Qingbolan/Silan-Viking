# Editor session

`EditorSession` owns persisted-document drafts, pending translation IDs, saved
body baselines, recovery storage and the shared write queue. React reads one
snapshot through `useSyncExternalStore`; there is no parallel documents/dirty
state mirrored into mutable refs. The Lexical AST remains the editing runtime.

The save lifecycle is explicit: `idle -> saving -> idle | failed | conflict`.
Failed writes may retry; conflicts must be resolved or parked before any queued
write can proceed. Settings writes use the same queue and publish conflicts
before releasing it. App owns conflict dialogs and fetches disk copies, but late
fetch responses may enrich only the still-current conflict.

A write reads the latest draft on each iteration. The acknowledged revision is
merged while edits made during I/O stay pending. Recovery storage is written
before source I/O; storage failure leaves the in-memory draft intact and prevents
an unprotected source write. The next queued operation sees the new revision.

Reloading builds an ID index once, merges dirty drafts without adopting a newer
on-disk revision, and retains dirty documents whose source disappeared. It also
recovers persisted local copies when a translation is first opened. Saved-body
baselines remain separate from dirty text so translation synchronization can
compare against the previous persisted source.

`EditorSession.test.mjs` covers reload/recovery, edits during I/O, queue ordering,
conflicts, retry, storage failure, and a settings conflict racing a queued body
save. Existing Lexical tests own Markdown/IME-independent AST round trips; native
and browser integration remain separate checks.
