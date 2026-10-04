# Project section pages

Web routes: `/projects/:idOrSlug/` (first document),
`/projects/:idOrSlug/:role/`, and `/projects/:idOrSlug/feedback/`.
Each route owns its selected document and outline; browser history is the state
owner. Tabs are ordinary links, including open-in-new-tab support.

`GET /api/v1/projects/:id/detail?lang=en&section=goals` returns the project
metadata and complete `parts` manifest. `has_content` determines whether a tab
exists; only the selected part carries its `body` or `entries`. `section=default`
selects the first non-empty document; `section=feedback` omits all document
bodies. Unknown or empty sections return 404. Omitting `section` retains the
existing full-detail API response for other consumers.

The detail assembler reads parts once, then derives the named document fields
from that snapshot; section responses omit these duplicate prose fields.
