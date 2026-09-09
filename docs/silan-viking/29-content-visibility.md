# Content visibility contract

Content has one exposure state: `private` or `public`. This supersedes the
status/visibility split in the earlier schema design. Blog, project, idea,
episode, series, and moment content no longer has a lifecycle `status` field.
Project progress is not retained as an independent field.

New content is private. Changing visibility controls eligibility for the next
content deployment; deployment remains an explicit operation. Deployment,
synchronization, proposal, and Git execution states are separate use cases and
are unaffected.

Schema version 2 removes content status and unlisted visibility. Migration must
preserve source text and media and must never silently publish content:
draft, archived, or unlisted content becomes private; existing private remains private;
other explicitly public content remains public. The migration is a one-time
source operation, followed by rebuilding the database projection. It must not
reinterpret runtime rows as authored truth. V1 is rejected by the V2 reader.

Series visibility is aggregated from its episodes for the library: all-public,
all-private, or a mixed aggregate. Mixed is a summary, never a stored exposure
state. Batch visibility operations apply Public or Private to every episode.

## Upgrade

1. Stop the editor before applying source migration. Preserve pending edits.
2. Run `python3 scripts/migrations/content-visibility-v2.py CONTENT_ROOT` to
   inspect changes, then rerun with `--apply`. Only source metadata changes;
   schema replacement is the final activation step. Errors roll back completed
   writes. Do not run concurrently with another source writer.
3. Run the v2 engine's content lint and index sync to rebuild the local projection.
4. Deploy the v2 backend before deploying v2 content. Its transactional migration
   privatizes old draft/archived/unlisted rows and archived series children, then
   drops only obsolete content status columns. Comments and analytics stay intact.
5. Commit and deploy the migrated content through the normal owner workflow.

CLI publish/unpublish and archive verbs remain owner command entry points;
all now write only visibility. Moment status transitions and MCP lifecycle
inference have been removed. Project progress prose remains authored text;
there is no progress-state field.
