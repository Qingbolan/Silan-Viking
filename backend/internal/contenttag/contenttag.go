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
	entsql "entgo.io/ent/dialect/sql"
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
	tags, err := r.LookupMany(ctx, entityType, []string{entityID})
	return tags[entityID], err
}

// LookupMany loads labels for a page in bounded batches, preserving empty arrays
// and label order. Duplicate IDs do not cause duplicate work.
func (r *Repository) LookupMany(ctx context.Context, entityType string, entityIDs []string) (map[string][]string, error) {
	result := make(map[string][]string, len(entityIDs))
	ids := make([]string, 0, len(entityIDs))
	for _, id := range entityIDs {
		if _, exists := result[id]; !exists {
			result[id] = []string{}
			ids = append(ids, id)
		}
	}
	if r == nil || r.db == nil {
		return result, nil
	}
	const batchSize = 500
	for start := 0; start < len(ids); start += batchSize {
		end := min(start+batchSize, len(ids))
		args := make([]any, 1, end-start+1)
		args[0] = entityType
		for _, id := range ids[start:end] {
			args = append(args, id)
		}
		placeholders := strings.TrimSuffix(strings.Repeat("?,", end-start), ",")
		rows, err := r.db.QueryContext(ctx, r.bind(`SELECT ct.entity_id, t.label FROM content_tag ct JOIN tag t ON t.id = ct.tag_id WHERE ct.entity_type = ? AND ct.entity_id IN (`+placeholders+`) ORDER BY t.label`), args...)
		if err != nil {
			return result, err
		}
		for rows.Next() {
			var id, label string
			if err := rows.Scan(&id, &label); err != nil {
				rows.Close()
				return result, err
			}
			if label != "" {
				result[id] = append(result[id], label)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

// MatchesTags composes AND-of-terms tag matching into the entity query.
// Each distinct term may match a slug or a label; aliases of the same tag
// remain valid rather than requiring multiple distinct tag rows.
func MatchesTags(entityType string, tags []string) func(*entsql.Selector) {
	wanted := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		tag = strings.ToLower(strings.TrimSpace(tag))
		if tag == "" {
			continue
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		wanted = append(wanted, tag)
	}
	return func(outer *entsql.Selector) {
		for _, term := range wanted {
			ct, tag := entsql.Table("content_tag"), entsql.Table("tag")
			query := entsql.Dialect(outer.Dialect()).Select(ct.C("entity_id")).From(ct).Join(tag).On(ct.C("tag_id"), tag.C("id"))
			query.Where(entsql.And(entsql.EQ(ct.C("entity_type"), entityType), entsql.Or(entsql.EqualFold(tag.C("slug"), term), entsql.EqualFold(tag.C("label"), term))))
			outer.Where(entsql.In(outer.C("id"), query))
		}
	}
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
