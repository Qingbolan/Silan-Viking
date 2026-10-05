# Desktop content library

The Blog shelf treats episode series as source-backed folders. `series.toml`
containers are listed independently of their episodes, so an empty series stays
visible and can receive content. Search filters the displayed folders, never the
set of episodes used for series-wide visibility operations.

`ContentLibrary` in the app crate owns create-series, copy/move and Markdown
import. Desktop supplies one typed operation through a thin Tauri adapter.
Moving a blog into a series changes its source kind to episode; moving an episode
out creates an independent blog. Item and Part identities survive a move. Copies
receive new identities and start private. Existing episode numbers remain stable;
incoming episodes receive the next available number.

Each operation prepares a directory below `.viking/transactions`, activates the
new source, rewrites affected `silan://` references, and rebuilds the projection.
If activation or projection fails, original source and reference files are
restored. A failed rollback retains the transaction directory and reports its
path. No operation publishes or deploys content. A multi-file drop applies one
transaction per Markdown file; successful earlier imports remain if a later file
fails. Markdown imports copy the supplied text, not adjacent external media.

The context menu offers article copy/cut, folder paste, move-to, private visibility
and new series. Copy/cut/paste uses an in-app clipboard; Cmd/Ctrl C/X/V follows the
same operation path. Dragging articles into a series moves them; Alt-drag copies.
Desktop native file drops and browser file drops both import `.md` files as private
episodes. Unsaved editor content blocks structural operations.

Regression coverage: source identity and media preservation, incoming link updates,
copy isolation, independent empty series, Markdown import, projection failure
rollback, and URI boundary matching live in `library::tests`.
