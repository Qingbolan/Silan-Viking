# Desktop delivery session

`DeliverySession` owns one workspace's delivery lifecycle. Its typed port carries
plan/status queries and pull/deploy/verify commands; the React hook binds this port
to Tauri and owns only polling timers and subscription lifetime. `App` supplies
content/dashboard reload callbacks and owns the explicit confirmation dialog.

Legal operation paths:

- `idle -> deploying -> verifying -> refreshing_deploy -> idle`
- `idle -> pulling -> refreshing_pull -> idle`
- Any running phase may return to `idle` on failure, reporting the error and
  preserving the most recent successful release/status evidence.

The operation is set synchronously before invoking a command, so double clicks
cannot start a second mutation. Refreshing after a pull remains a pulling state
until content reload and plan refresh settle. The existing readiness function
continues to own button copy and policy: unsaved drafts block pulling; committed
content may be deployed while unsaved edits remain local.

Queries started in the same epoch share an in-flight request. Starting a write
invalidates old read results; late replies cannot replace the post-write status
or plan. Manual refresh joins polling and makes any resulting failure visible.
Polling preserves transient silent retries, exponential backoff and the slower
unconfigured-target interval. Each automatic pull revision is attempted once;
manual retry is separate. No automatic deployment is introduced.

`DeliverySession.test.mjs` uses deferred ports to verify these races and failure
paths without a real deployment target. It is included in the full Desktop test
command. Browser/native interaction verification remains a separate gate.
