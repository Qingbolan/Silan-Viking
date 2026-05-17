// Package contenttag reads an Item's tags from the cross-type `content_tag`
// table.
//
// The silan-viking engine unified tags into a single cross-type model: a
// `content_tag` row associates one Item — identified by `(entity_type,
// entity_id)` — with one `tag`, and the `tag` table holds the display label.
// The legacy per-type ent `Tags` edge is no longer populated by `index sync`,
// so handlers must read `content_tag` instead. This package is that read.
package contenttag

import (
	"context"
	"database/sql"
	"strings"
)

// Lookup returns the display labels of every tag associated with the Item
// `(entityType, entityID)`, ordered by label for a stable response.
//
// It is best-effort: a query error yields an empty slice and the error, so a
// caller can choose to log-and-continue rather than fail the whole response
// over a missing tag list. The slice is always non-nil — an Item with no
// tags returns `[]string{}`, never nil, so a JSON consumer never sees `null`.
func Lookup(ctx context.Context, db *sql.DB, entityType, entityID string) ([]string, error) {
	tags := []string{}
	if db == nil {
		return tags, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT t.label
		   FROM content_tag ct
		   JOIN tag t ON t.id = ct.tag_id
		  WHERE ct.entity_type = ? AND ct.entity_id = ?
		  ORDER BY t.label`,
		entityType, entityID)
	if err != nil {
		return tags, err
	}
	defer rows.Close()
	for rows.Next() {
		var label string
		if err := rows.Scan(&label); err != nil {
			return tags, err
		}
		if label != "" {
			tags = append(tags, label)
		}
	}
	return tags, rows.Err()
}

// EntityIDsMatchingTags returns the IDs of every `entityType` Item that
// carries **all** of `tags` — the same AND-of-tags semantics the legacy ent
// `HasTagsWith` filter chain had. A tag matches case-insensitively against
// either the `tag.slug` or the `tag.label`, so a search box entry like
// "EasyNet" finds the `easynet` tag.
//
// An empty `tags` list, or a nil `db`, returns `(nil, nil)` — the caller
// reads "no tag filter" and applies none. When the list is non-empty but no
// Item matches, an empty non-nil slice is returned, so the caller filters to
// zero results rather than skipping the filter.
func EntityIDsMatchingTags(ctx context.Context, db *sql.DB, entityType string, tags []string) ([]string, error) {
	// Normalise: trim, drop blanks, lower-case for the case-insensitive match.
	wanted := make([]string, 0, len(tags))
	for _, t := range tags {
		t = strings.ToLower(strings.TrimSpace(t))
		if t != "" {
			wanted = append(wanted, t)
		}
	}
	if db == nil || len(wanted) == 0 {
		return nil, nil
	}

	// One `?` per wanted tag, matched against slug or label. `GROUP BY ...
	// HAVING count(distinct …) = N` keeps only Items carrying every tag.
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(wanted)), ",")
	q := `SELECT ct.entity_id
	        FROM content_tag ct
	        JOIN tag t ON t.id = ct.tag_id
	       WHERE ct.entity_type = ?
	         AND (lower(t.slug) IN (` + placeholders + `)
	              OR lower(t.label) IN (` + placeholders + `))
	       GROUP BY ct.entity_id
	      HAVING count(DISTINCT lower(t.slug)) = ?`

	args := make([]any, 0, len(wanted)*2+2)
	args = append(args, entityType)
	for _, t := range wanted {
		args = append(args, t)
	}
	for _, t := range wanted {
		args = append(args, t)
	}
	args = append(args, len(wanted))

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
