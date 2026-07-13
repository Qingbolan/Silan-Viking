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
	"strconv"
	"strings"
)

// Repository owns the cross-content tag read model and its SQL dialect.
// Keeping placeholder binding here prevents every caller from knowing whether
// the runtime database expects SQLite/MySQL `?` or PostgreSQL `$n` markers.
type Repository struct {
	db     *sql.DB
	driver string
}

func NewRepository(db *sql.DB, driver string) *Repository {
	return &Repository{db: db, driver: strings.ToLower(driver)}
}

// bind converts the package's canonical `?` placeholders to the target
// driver's syntax. Question marks inside quoted SQL literals/identifiers are
// preserved. All queries in this repository are static and parameterized.
func (r *Repository) bind(query string) string {
	if r == nil || (r.driver != "postgres" && r.driver != "postgresql") {
		return query
	}

	var out strings.Builder
	out.Grow(len(query) + 8)
	parameter := 1
	var quote rune
	for _, current := range query {
		if quote != 0 {
			out.WriteRune(current)
			if current == quote {
				quote = 0
			}
			continue
		}
		switch current {
		case '\'', '"':
			quote = current
			out.WriteRune(current)
		case '?':
			out.WriteByte('$')
			out.WriteString(strconv.Itoa(parameter))
			parameter++
		default:
			out.WriteRune(current)
		}
	}
	return out.String()
}

// Lookup returns the display labels of every tag associated with the Item
// `(entityType, entityID)`, ordered by label for a stable response.
//
// It is best-effort: a query error yields an empty slice and the error, so a
// caller can choose to log-and-continue rather than fail the whole response
// over a missing tag list. The slice is always non-nil — an Item with no
// tags returns `[]string{}`, never nil, so a JSON consumer never sees `null`.
func (r *Repository) Lookup(ctx context.Context, entityType, entityID string) ([]string, error) {
	tags := []string{}
	if r == nil || r.db == nil {
		return tags, nil
	}
	rows, err := r.db.QueryContext(ctx, r.bind(
		`SELECT t.label
		   FROM content_tag ct
		   JOIN tag t ON t.id = ct.tag_id
		  WHERE ct.entity_type = ? AND ct.entity_id = ?
		  ORDER BY t.label`),
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
func (r *Repository) EntityIDsMatchingTags(ctx context.Context, entityType string, tags []string) ([]string, error) {
	// Normalise: trim, drop blanks, lower-case for the case-insensitive match.
	wanted := make([]string, 0, len(tags))
	for _, t := range tags {
		t = strings.ToLower(strings.TrimSpace(t))
		if t != "" {
			wanted = append(wanted, t)
		}
	}
	if r == nil || r.db == nil || len(wanted) == 0 {
		return nil, nil
	}

	// One `?` per wanted tag, matched against slug or label. `GROUP BY ...
	// HAVING count(distinct …) = N` keeps only Items carrying every tag.
	//
	// The count is over `t.id` — the tag's primary key / canonical identity —
	// not over `slug`: a wanted term may match a tag by its label while
	// another matches a tag by its slug, and counting the distinct tag *rows*
	// is what correctly answers "did this Item carry all N requested tags".
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(wanted)), ",")
	q := `SELECT ct.entity_id
	        FROM content_tag ct
	        JOIN tag t ON t.id = ct.tag_id
	       WHERE ct.entity_type = ?
	         AND (lower(t.slug) IN (` + placeholders + `)
	              OR lower(t.label) IN (` + placeholders + `))
	       GROUP BY ct.entity_id
	      HAVING count(DISTINCT t.id) = ?`

	args := make([]any, 0, len(wanted)*2+2)
	args = append(args, entityType)
	for _, t := range wanted {
		args = append(args, t)
	}
	for _, t := range wanted {
		args = append(args, t)
	}
	args = append(args, len(wanted))

	rows, err := r.db.QueryContext(ctx, r.bind(q), args...)
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

// TagSummary is one distinct tag plus how many Items of a type use it.
type TagSummary struct {
	ID         string // the tag's stable id (= its slug)
	Label      string // the human-readable label
	Slug       string
	UsageCount int // how many `entityType` Items carry this tag
}

// ListTags returns every distinct tag used by Items of `entityType`, each
// with its usage count, ordered by label.
//
// This is the cross-type `content_tag` answer to the per-type `/tags`
// endpoints: a tag is "used by blog" when a `content_tag` row links it to a
// `blog` Item. The legacy per-type tag tables (`blog_tags`, `idea_tags`) are
// no longer populated by `index sync`, so they would report every count as
// zero. A nil `db` yields an empty slice.
func (r *Repository) ListTags(ctx context.Context, entityType string) ([]TagSummary, error) {
	out := []TagSummary{}
	if r == nil || r.db == nil {
		return out, nil
	}
	rows, err := r.db.QueryContext(ctx, r.bind(
		`SELECT t.id, t.label, t.slug, count(*) AS usage
		   FROM content_tag ct
		   JOIN tag t ON t.id = ct.tag_id
		  WHERE ct.entity_type = ?
		  GROUP BY t.id, t.label, t.slug
		  ORDER BY t.label`),
		entityType)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var s TagSummary
		if err := rows.Scan(&s.ID, &s.Label, &s.Slug, &s.UsageCount); err != nil {
			return out, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
